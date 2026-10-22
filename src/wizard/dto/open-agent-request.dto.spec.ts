import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { OpenAgentRequestDto } from './open-agent-request.dto';

async function invalidProperties(body: Record<string, unknown>) {
  const errors = await validate(
    plainToInstance(OpenAgentRequestDto, { query: 'hello', ...body }),
  );
  return errors.map((error) => error.property);
}

describe('OpenAgentRequestDto', () => {
  it('rejects a conversation_id that is not a UUID', async () => {
    await expect(
      invalidProperties({ conversation_id: 'not-a-uuid' }),
    ).resolves.toEqual(['conversation_id']);
  });

  it('rejects a parent_message_id that is not a UUID', async () => {
    await expect(
      invalidProperties({ parent_message_id: '123' }),
    ).resolves.toEqual(['parent_message_id']);
  });

  it('accepts UUID ids', async () => {
    await expect(
      invalidProperties({
        conversation_id: '550e8400-e29b-41d4-a716-446655440000',
        parent_message_id: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
      }),
    ).resolves.toEqual([]);
  });
});
