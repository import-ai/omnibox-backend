import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { OpenCollectUrlRequestDto } from './collect-url-request.dto';
import { OpenCollectRequestDto } from './open-collect-request.dto';

describe.each([OpenCollectUrlRequestDto, OpenCollectRequestDto])(
  'Open collection destination mapping',
  (Dto) => {
    it('maps public snake_case parent_id rather than silently using the default', () => {
      const dto = plainToInstance(Dto, {
        url: 'https://example.com',
        title: 'Title',
        parent_id: 'team-folder',
      });
      expect(dto.parentId).toBe('team-folder');
    });
    it('keeps accepting existing camelCase clients', () => {
      expect(plainToInstance(Dto, { parentId: 'legacy-folder' }).parentId).toBe(
        'legacy-folder',
      );
    });
    it('validates an invalid explicit destination instead of ignoring it', async () => {
      const dto = plainToInstance(Dto, {
        url: 'https://example.com',
        title: 'Title',
        parent_id: 123,
      });
      expect(
        (await validate(dto)).some((error) => error.property === 'parentId'),
      ).toBe(true);
    });
  },
);
