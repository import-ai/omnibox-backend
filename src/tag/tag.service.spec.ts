import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { MAX_TAG_NAME_LENGTH } from 'omniboxd/tag/tag.constants';
import { Tag } from 'omniboxd/tag/tag.entity';
import { TagService } from 'omniboxd/tag/tag.service';

describe('TagService', () => {
  let service: TagService;
  let repo: {
    find: jest.Mock;
    findOne: jest.Mock;
    findOneBy: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };

  beforeEach(async () => {
    repo = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      findOneBy: jest.fn(),
      create: jest.fn((data) => data),
      save: jest.fn((tag) => Promise.resolve({ id: `${tag.name}-id`, ...tag })),
    };

    const module = await Test.createTestingModule({
      providers: [
        TagService,
        {
          provide: getRepositoryToken(Tag),
          useValue: repo,
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

    it('filters empty tag names', async () => {
      await expect(
        service.getOrCreateTagsByNames('namespace-id', ['']),
      ).resolves.toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('filters too long tag names', async () => {
      await expect(
        service.getOrCreateTagsByNames('namespace-id', [
          'x'.repeat(MAX_TAG_NAME_LENGTH + 1),
        ]),
      ).resolves.toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('keeps hierarchical tag names produced by user TAGS.md rules', async () => {
      // A user classification scheme like `Work/<area>` easily exceeds the old
      // 20 character limit; such tags used to be dropped silently.
      const hierarchicalTag = 'Work/Software Development-TEAMWIDE-2026';
      expect(hierarchicalTag.length).toBeGreaterThan(20);
      await expect(
        service.getOrCreateTagsByNames('namespace-id', [hierarchicalTag]),
      ).resolves.toEqual([`${hierarchicalTag}-id`]);
      expect(repo.create).toHaveBeenCalledWith({
        namespaceId: 'namespace-id',
        name: hierarchicalTag,
      });
    });

    it('creates only valid tag names', async () => {
      await expect(
        service.getOrCreateTagsByNames('namespace-id', [
          '',
          'valid-tag',
          'x'.repeat(MAX_TAG_NAME_LENGTH + 1),
        ]),
      ).resolves.toEqual(['valid-tag-id']);
      expect(repo.create).toHaveBeenCalledTimes(1);
      expect(repo.create).toHaveBeenCalledWith({
        namespaceId: 'namespace-id',
        name: 'valid-tag',
      });
    });
  });
});
