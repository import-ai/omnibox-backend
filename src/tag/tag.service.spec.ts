import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
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
        service.getOrCreateTagsByNames('namespace-id', ['x'.repeat(21)]),
      ).resolves.toEqual([]);
      expect(repo.find).not.toHaveBeenCalled();
    });

    it('creates only valid tag names', async () => {
      await expect(
        service.getOrCreateTagsByNames('namespace-id', [
          '',
          'valid-tag',
          'x'.repeat(21),
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
