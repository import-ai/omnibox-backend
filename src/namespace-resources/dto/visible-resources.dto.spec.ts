import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import {
  MAX_VISIBLE_RESOURCE_IDS,
  VisibleResourcesRequestDto,
} from './visible-resources.dto';

describe('VisibleResourcesRequestDto', () => {
  it('binds snake_case resource_ids from wizard', async () => {
    const dto = plainToInstance(VisibleResourcesRequestDto, {
      resource_ids: ['keep', 'deny'],
    });
    expect(await validate(dto)).toEqual([]);
    expect(dto.resourceIds).toEqual(['keep', 'deny']);
  });

  it('rejects more than 200 ids', async () => {
    const dto = plainToInstance(VisibleResourcesRequestDto, {
      resource_ids: Array.from(
        { length: MAX_VISIBLE_RESOURCE_IDS + 1 },
        (_, i) => String(i),
      ),
    });
    expect((await validate(dto)).length).toBeGreaterThan(0);
  });
});
