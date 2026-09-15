import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ListResourceCommentThreadsRequestDto } from './resource-comment-request.dto';

describe('comment pagination contract', () => {
  it.each([
    [{}, 0, 20],
    [{ offset: '20', limit: '10' }, 20, 10],
    [{ offlet: '40', limits: '5' }, 40, 5],
    [{ offset: '0', limit: '2', offlet: '40', limits: '5' }, 0, 2],
  ])(
    'parses %j without silently resetting later pages',
    async (input, offset, limit) => {
      const query = plainToInstance(
        ListResourceCommentThreadsRequestDto,
        input,
      );
      expect(await validate(query)).toEqual([]);
      expect(query).toMatchObject({ offset, limit });
    },
  );
  it.each([
    { offset: '-1' },
    { offset: '1.5' },
    { offset: 'bad' },
    { limit: '0' },
    { limit: '101' },
    { limits: 'bad' },
    { offlet: '-1' },
    { offset: ['2'] },
    { limit: {} },
  ])('rejects invalid pagination %j', async (input) => {
    const query = plainToInstance(ListResourceCommentThreadsRequestDto, input);
    expect((await validate(query)).length).toBeGreaterThan(0);
  });
});
