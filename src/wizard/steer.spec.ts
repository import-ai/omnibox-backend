import { ForbiddenException } from '@nestjs/common';

import { ConversationAttachmentsService } from '../attachments/conversation-attachments.service';
import { NamespaceResourcesService } from '../namespace-resources/namespace-resources.service';
import { AgentRequestDto } from './dto/agent-request.dto';
import { prepareSteer } from './steer';

describe('prepareSteer', () => {
  const id = 'd23e3f1f-cfc4-4708-84e5-64baa50e745c';
  const file = { id, name: 'plot.png', content_type: 'image/png' };
  const attachments = {
    getConversationAttachmentLlmUrl: jest.fn().mockResolvedValue(file),
  };
  const resources = { permissionFilter: jest.fn() };
  const request = {
    query: 'Compare this chart',
    client_request_id: id,
    images: [
      {
        attachment_id: id,
        name: 'client name',
        url: 'https://example.com/untrusted',
      },
    ],
    tools: [
      {
        name: 'private_search',
        visible_resources: [{ id: 'foreign' }],
        resources: [{ id: 'selected', name: 'Report', type: 'resource' }],
      },
      { name: 'web_search' },
    ],
  } as AgentRequestDto;
  const prepare = () =>
    prepareSteer(
      request,
      'ns',
      'conv',
      'user',
      attachments as unknown as ConversationAttachmentsService,
      resources as unknown as NamespaceResourcesService,
    );

  it('resolves attachments in the current conversation and uses only checked resource IDs', async () => {
    resources.permissionFilter.mockResolvedValue(['selected']);
    const message = await prepare();
    expect(attachments.getConversationAttachmentLlmUrl).toHaveBeenCalledWith(
      'ns',
      'conv',
      id,
      'user',
    );
    expect(message.images).toEqual([
      {
        attachment_id: id,
        name: 'plot.png',
        url: `/api/v1/namespaces/ns/conversations/conv/attachments/${id}`,
      },
    ]);
    expect(message.tools).toEqual([
      {
        name: 'private_search',
        namespace_id: 'ns',
        resources: request.tools[0]['resources'],
      },
      { name: 'web_search' },
    ]);
    resources.permissionFilter.mockResolvedValue([]);
    await expect(prepare()).rejects.toBeInstanceOf(ForbiddenException);
  });
});
