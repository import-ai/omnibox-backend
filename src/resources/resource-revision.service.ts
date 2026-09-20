import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Resource } from 'omniboxd/resources/entities/resource.entity';
import { User } from 'omniboxd/user/entities/user.entity';
import { EntityManager, Repository } from 'typeorm';

import { ResourceRevision } from './entities/resource-revision.entity';

export interface ResourceRevisionAuthor {
  id: string;
  username: string;
}

export interface ResourceRevisionSummary {
  id: string;
  name: string;
  createdAt: Date;
  author: ResourceRevisionAuthor | null;
  isCurrent: boolean;
}

export interface ResourceRevisionDetail extends ResourceRevisionSummary {
  resourceId: string;
  content: string;
  contentHash: string;
}

@Injectable()
export class ResourceRevisionService {
  constructor(
    @InjectRepository(ResourceRevision)
    private readonly revisionRepository: Repository<ResourceRevision>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  async createFromResource(
    resource: Resource,
    authorId: string,
    manager?: EntityManager,
  ): Promise<ResourceRevision> {
    const repository = manager
      ? manager.getRepository(ResourceRevision)
      : this.revisionRepository;
    const revision = repository.create({
      namespaceId: resource.namespaceId,
      resourceId: resource.id,
      authorId,
      name: resource.name,
      content: resource.content,
      contentHash: this.contentHash(resource.content),
    });
    return await repository.save(revision);
  }

  async list(resource: Resource): Promise<ResourceRevisionSummary[]> {
    const revisions = await this.revisionRepository.find({
      where: {
        namespaceId: resource.namespaceId,
        resourceId: resource.id,
      },
      relations: { author: true },
      order: { createdAt: 'DESC' },
      take: 100,
    });
    return [
      await this.current(resource),
      ...revisions.map((revision) => this.toSummary(revision)),
    ];
  }

  async get(
    resource: Resource,
    revisionId: string,
  ): Promise<ResourceRevisionDetail | null> {
    if (revisionId === 'current') {
      return this.current(resource);
    }
    const revision = await this.revisionRepository.findOne({
      where: {
        id: revisionId,
        namespaceId: resource.namespaceId,
        resourceId: resource.id,
      },
      relations: { author: true },
    });
    return revision ? this.toDetail(revision) : null;
  }

  private contentHash(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }

  private async current(resource: Resource): Promise<ResourceRevisionDetail> {
    const currentAuthor = resource.userId
      ? await this.userRepository.findOne({ where: { id: resource.userId } })
      : null;
    return {
      id: 'current',
      resourceId: resource.id,
      name: resource.name,
      content: resource.content,
      contentHash: this.contentHash(resource.content),
      createdAt: resource.updatedAt,
      author: currentAuthor ? this.author(currentAuthor) : null,
      isCurrent: true,
    };
  }

  private toSummary(revision: ResourceRevision): ResourceRevisionSummary {
    return {
      id: revision.id,
      name: revision.name,
      createdAt: revision.createdAt,
      author: revision.author ? this.author(revision.author) : null,
      isCurrent: false,
    };
  }

  private toDetail(revision: ResourceRevision): ResourceRevisionDetail {
    return {
      ...this.toSummary(revision),
      resourceId: revision.resourceId,
      content: revision.content,
      contentHash: revision.contentHash,
    };
  }

  private author(user: User): ResourceRevisionAuthor {
    return { id: user.id, username: user.username };
  }
}
