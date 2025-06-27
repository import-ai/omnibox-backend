import { Tag } from 'src/tag/tag.entity';
import { Repository, In, Like } from 'typeorm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateTagDto } from 'src/tag/dto/create-tag.dto';

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
      namespace: { id: namespaceId },
      name: createTagDto.name,
    });
    return await this.tagRepository.save(newTag);
  }

  async findByName(namespaceId: string, name: string) {
    return await this.tagRepository.findOneBy({
      name,
      namespace: { id: namespaceId },
    });
  }

  async tagsByIds(namespaceId: string, ids: Array<string>) {
    if (ids.length <= 0) {
      return [];
    }
    return await this.tagRepository.find({
      where: { namespace: { id: namespaceId }, id: In(ids) },
    });
  }

  async findAll(namespaceId: string, name: string) {
    const where: any = {
      namespace: { id: namespaceId },
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
}
