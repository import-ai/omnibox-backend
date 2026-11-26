import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  OpenCommentPageRequestDto,
  OpenListCommentThreadsRequestDto,
} from './open-resource-comment-request.dto';

describe('Open comment query contract', () => {
  it('defaults to all types and bounded pagination', async () => {
    const dto = plainToInstance(OpenListCommentThreadsRequestDto, {});
    expect(dto).toMatchObject({ type: 'all', offset: 0, limit: 20 });
    expect(await validate(dto)).toEqual([]);
  });

  it.each(['', ' ', '-1', '1.5', '1e2', '9007199254740992', ['20'], null])(
    'rejects invalid offset %j',
    async (offset) => {
      expect(
        (await validate(plainToInstance(OpenCommentPageRequestDto, { offset })))
          .length,
      ).toBeGreaterThan(0);
    },
  );

  it.each(['0', '1', '100'])('accepts decimal offset %s', async (offset) => {
    const dto = plainToInstance(OpenCommentPageRequestDto, { offset });
    expect(dto.offset).toBe(Number(offset));
    expect(await validate(dto)).toEqual([]);
  });

  it.each(['0', '101', '1.5', ['20']])(
    'rejects invalid limit %j',
    async (limit) => {
      expect(
        (await validate(plainToInstance(OpenCommentPageRequestDto, { limit })))
          .length,
      ).toBeGreaterThan(0);
    },
  );

  it.each([
    { type: 'sidebar' },
    { resolved: '1' },
    { type: ['all'] },
    { resolved: ['true'] },
  ])('rejects invalid filters %j', async (query) => {
    expect(
      (await validate(plainToInstance(OpenListCommentThreadsRequestDto, query)))
        .length,
    ).toBeGreaterThan(0);
  });
});
