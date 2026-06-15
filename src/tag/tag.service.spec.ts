import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Tag } from 'omniboxd/tag/tag.entity';
import { TagService } from 'omniboxd/tag/tag.service';

describe('TagService', () => {
  let service: TagService;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        TagService,
        {
          provide: getRepositoryToken(Tag),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            findOneBy: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get(TagService);
  });

  describe('getOrCreateTagsByNames', () => {
    it('returns empty array for empty tag names', async () => {
      await expect(
        service.getOrCreateTagsByNames('namespace-id', []),
      ).resolves.toEqual([]);
    });

    it('rejects empty tag names', async () => {
      await expect(
        service.getOrCreateTagsByNames('namespace-id', ['']),
      ).rejects.toThrow('Empty name');
    });

    it('rejects too long tag names', async () => {
      await expect(
        service.getOrCreateTagsByNames('namespace-id', ['x'.repeat(21)]),
      ).rejects.toThrow('Name too long');
    });
  });
});
