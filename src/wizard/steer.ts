import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { createHash } from 'crypto';

import { ConversationAttachmentsService } from '../attachments/conversation-attachments.service';
import { NamespaceResourcesService } from '../namespace-resources/namespace-resources.service';
import {
  AgentRequestDto,
  PrivateSearchResourceDto,
  WizardAgentRequestDto,
} from './dto/agent-request.dto';

const STORED_SUBMISSION_INPUT = `
local function submission_input(inbox, queue, id, payload)
  if not queue then return false end
  local record = queue .. ':' .. id
  if redis.call('HGET', record, 'inbox') == inbox and
      redis.call('HGET', record, 'payload') == payload then
    return redis.call('HGET', record, 'fingerprint')
  end
  return false
end`;

export function decodeSteerItem(row: string | [string, string]) {
  if (typeof row === 'string') return JSON.parse(row);
  return {
    ...JSON.parse(row[0]),
    submission_fingerprint: createHash('sha256').update(row[1]).digest('hex'),
  };
}

export const READ_STEER_INPUT = `
${STORED_SUBMISSION_INPUT}
local payload = redis.call('HGET', KEYS[1], ARGV[1])
if not payload then return false end
local item = cjson.decode(payload)
if item.submission_fingerprint then return payload end
local input = submission_input(KEYS[1], redis.call('HGET', KEYS[1], 'queue'), ARGV[1], payload)
if input then return {payload, input} end
return payload`;

// Check admission and append in one operation, including across backend replicas.
export const APPEND_STEER = `
local previous = redis.call('HGET', KEYS[1], ARGV[1])
if previous then return previous == ARGV[2] and 1 or -1 end
if redis.call('HGET', KEYS[1], 'open') ~= '1' then return 0 end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('RPUSH', KEYS[2], ARGV[2])
redis.call('PUBLISH', (redis.call('HGET', KEYS[1], 'queue') or KEYS[1]) .. ':wake', ARGV[1])
redis.call('EXPIRE', KEYS[2], ARGV[3])
return 1`;

// Closing an empty inbox races atomically with the last composer submission.
// While a save is pending, queued inputs are left unassigned so a later ask is
// not folded into the running turn; items already in the inbox still return.
export const READ_STEER = `
${STORED_SUBMISSION_INPUT}
if redis.call('HEXISTS', KEYS[1], 'stopped') == 1 then
  return {'{"stopped":true}'}
end
local gate = false
for _, token in ipairs(redis.call('HKEYS', KEYS[3])) do
  local expires = tonumber(redis.call('HGET', KEYS[3], token))
  if expires and expires > tonumber(ARGV[4]) then
    gate = true
    break
  end
end
local queue = redis.call('HGET', KEYS[1], 'queue')
if not gate and queue and redis.call('HGET', KEYS[1], 'open') == '1' then
  local run = redis.call('HGET', KEYS[1], 'run')
  local predecessor = redis.call('HGET', queue .. ':' .. run, 'target')
  local previous = predecessor and redis.call('HGET', KEYS[1], 'previous_run')
  for _, id in ipairs(redis.call('LRANGE', queue, 0, -1)) do
    if id ~= run then
      local record = queue .. ':' .. id
      local assigned = redis.call('HGET', record, 'inbox')
      if not assigned then
        local payload = redis.call('HGET', record, 'payload')
        local target = redis.call('HGET', record, 'target')
        if not payload or (target ~= '' and target ~= run and target ~= predecessor and target ~= previous) then break end
        redis.call('HSET', record, 'inbox', KEYS[1])
        if redis.call('HSETNX', KEYS[1], id, payload) == 1 then
          redis.call('RPUSH', KEYS[2], payload)
          redis.call('EXPIRE', KEYS[2], ARGV[3])
        end
      elseif assigned ~= KEYS[1] and redis.call('HEXISTS', assigned, 'saved:' .. id) == 0 then
        break
      end
    end
  end
end
local items = redis.call('LRANGE', KEYS[2], ARGV[1], -1)
if #items == 0 and ARGV[2] == '1' and redis.call('EXISTS', KEYS[1]) == 1 then
  redis.call('HDEL', KEYS[1], 'open')
end
if queue then
  for index, payload in ipairs(items) do
    local item = cjson.decode(payload)
    if not item.submission_fingerprint then
      local input = submission_input(KEYS[1], queue, item.client_request_id, payload)
      if input then
        -- Return the original serialized request separately for legacy payloads.
        items[index] = {payload, input}
      end
    end
  end
end
return items`;

export async function prepareSteer(
  body: AgentRequestDto,
  namespaceId: string,
  conversationId: string,
  userId: string,
  attachments: ConversationAttachmentsService,
  resources: NamespaceResourcesService,
) {
  if (
    !body ||
    !isUUID(body.client_request_id) ||
    typeof body.query !== 'string' ||
    !body.query.trim() ||
    (body.current_resource_id != null &&
      typeof body.current_resource_id !== 'string') ||
    !Array.isArray(body.images ?? []) ||
    !Array.isArray(body.tools ?? [])
  )
    throw new BadRequestException('Invalid steer message');
  const images: NonNullable<AgentRequestDto['images']> = [];
  for (const image of body.images ?? []) {
    if (!isUUID(image?.attachment_id))
      throw new BadRequestException('Invalid image');
    const file = await attachments.getConversationAttachmentLlmUrl(
      namespaceId,
      conversationId,
      image.attachment_id,
      userId,
    );
    if (!file.content_type?.startsWith('image/'))
      throw new BadRequestException('Invalid image');
    images.push({
      attachment_id: file.id,
      name: file.name,
      url: `/api/v1/namespaces/${namespaceId}/conversations/${conversationId}/attachments/${file.id}`,
    });
  }
  const tools: WizardAgentRequestDto['tools'] = [];
  const ids = new Set<string>();
  if (body.current_resource_id) ids.add(body.current_resource_id);
  for (const tool of body.tools ?? []) {
    if (tool?.name === 'web_search') tools.push({ name: tool.name });
    else if (
      tool?.name === 'private_search' &&
      Array.isArray(tool.resources ?? [])
    ) {
      const selected: PrivateSearchResourceDto[] = [];
      for (const resource of tool.resources ?? []) {
        if (
          typeof resource?.id !== 'string' ||
          typeof resource.name !== 'string' ||
          !['resource', 'folder'].includes(resource.type)
        )
          throw new BadRequestException('Invalid resource');
        ids.add(resource.id);
        selected.push({
          id: resource.id,
          name: resource.name,
          type: resource.type,
        });
      }
      tools.push({
        name: tool.name,
        namespace_id: namespaceId,
        resources: selected,
      });
    } else throw new BadRequestException('Unsupported tool');
  }
  if (
    ids.size &&
    (await resources.permissionFilter(namespaceId, userId, [...ids])).length !==
      ids.size
  )
    throw new ForbiddenException();
  return {
    client_request_id: body.client_request_id,
    query: body.query,
    ...(body.source_channel ? { source_channel: body.source_channel } : {}),
    images,
    tools,
    current_resource_id: body.current_resource_id,
  };
}
