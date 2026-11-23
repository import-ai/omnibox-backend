import { plainToInstance } from 'class-transformer';
import { validate, ValidationError } from 'class-validator';

import { OpenAgentRequestDto } from './open-agent-request.dto';

async function invalidProperties(body: Record<string, unknown>) {
  const errors = await validate(
    plainToInstance(OpenAgentRequestDto, { query: 'hello', ...body }),
  );
  return errors.map((error) => error.property);
}

function errorPaths(errors: ValidationError[], prefix = ''): string[] {
  return errors.flatMap((error) => {
    const path = prefix ? `${prefix}.${error.property}` : error.property;
    return error.children?.length ? errorPaths(error.children, path) : [path];
  });
}

async function invalidPaths(body: Record<string, unknown>) {
  const errors = await validate(
    plainToInstance(OpenAgentRequestDto, { query: 'hello', ...body }),
  );
  return errorPaths(errors);
}

const image = {
  attachment_id: '6ba7b810-9dad-41d1-80b4-00c04fd430c8',
  url: '/api/v1/namespaces/ns/conversations/c/attachments/a',
  name: 'image.jpg',
};

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

  it('accepts images with an absolute or relative preview URL', async () => {
    await expect(invalidPaths({ images: [image] })).resolves.toEqual([]);
    await expect(
      invalidPaths({
        images: [{ ...image, url: 'http://localhost/api/v1/attachments/a' }],
      }),
    ).resolves.toEqual([]);
  });

  it('accepts an empty images array', async () => {
    await expect(invalidPaths({ images: [] })).resolves.toEqual([]);
  });

  it('rejects images that are not an array', async () => {
    await expect(invalidPaths({ images: 'image.jpg' })).resolves.toEqual([
      'images',
    ]);
  });

  it('rejects a non-UUID attachment_id', async () => {
    await expect(
      invalidPaths({
        images: [{ ...image, attachment_id: 'attachment-1' }],
      }),
    ).resolves.toEqual(['images.0.attachment_id']);
  });

  it('rejects image entries missing required fields', async () => {
    await expect(invalidPaths({ images: [{}] })).resolves.toEqual([
      'images.0.attachment_id',
      'images.0.url',
      'images.0.name',
    ]);
  });
});
