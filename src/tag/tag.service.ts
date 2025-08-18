import { Tag } from 'omniboxd/tag/tag.entity';
import { Repository, In, Like, EntityManager } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateTagDto } from 'omniboxd/tag/dto/create-tag.dto';
import { TagDto } from 'omniboxd/tag/dto/tag.dto';

@Injectable()
export class TagService {
  constructor(
    @InjectRepository(Tag)
    private tagRepository: Repository<Tag>,
  ) {}

  async create(namespaceId: string, createTagDto: CreateTagDto) {
    const oldTag = await this.findByName(namespaceId, createTagDto.name);
    if (oldTag) {
      return oldTag;
    }
    const newTag = this.tagRepository.create({
      namespaceId,
      name: createTagDto.name,
    });
    return await this.tagRepository.save(newTag);
  }

  async findByName(namespaceId: string, name: string) {
    return await this.tagRepository.findOneBy({
      name,
      namespaceId,
    });
  }

  async findByIds(namespaceId: string, ids: Array<string>) {
    if (ids.length <= 0) {
      return [];
    }
    return await this.tagRepository.find({
      where: { namespaceId, id: In(ids) },
    });
  }

  async findAll(namespaceId: string, name: string) {
    const where: any = {
      namespaceId,
    };
    if (name) {
      where.name = Like(`%${name}%`);
    }
    return await this.tagRepository.find({
      where,
      skip: 0,
      take: 10,
      order: { updatedAt: 'DESC' },
    });
  }

  async getTagsByIds(namespaceId: string, tagIds: string[]): Promise<TagDto[]> {
    if (tagIds.length === 0) {
      return [];
    }

    const tags = await this.tagRepository.find({
      where: {
        namespaceId,
        id: In(tagIds),
      },
    });

    return tags.map((tag) => TagDto.fromEntity(tag));
  }

  async getOrCreateTagsByNames(
    namespaceId: string,
    tagNames: string[],
    manager?: EntityManager,
  ): Promise<string[]> {
    if (!tagNames || tagNames.length === 0) {
      return [];
    }

    const repo = manager ? manager.getRepository(Tag) : this.tagRepository;

    // Find existing tags
    const existingTags = await repo.find({
      where: {
        namespaceId,
        name: In(tagNames),
      },
    });

    const existingTagNames = new Set(existingTags.map((tag) => tag.name));
    const tagIds = existingTags.map((tag) => tag.id);

    // Create missing tags
    const missingTagNames = tagNames.filter(
      (name) => !existingTagNames.has(name),
    );

    for (const tagName of missingTagNames) {
      const newTag = repo.create({
        namespaceId,
        name: tagName,
      });
      const savedTag = await repo.save(newTag);
      tagIds.push(savedTag.id);
    }

    return tagIds;
  }

  async findByNames(namespaceId: string, tagNames: string[]): Promise<Tag[]> {
    if (tagNames.length === 0) {
      return [];
    }

    return await this.tagRepository.find({
      where: {
        namespaceId,
        name: In(tagNames),
      },
      select: ['id', 'name'],
    });
  }
}
