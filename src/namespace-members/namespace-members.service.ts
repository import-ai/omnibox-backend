import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, IsNull, Repository } from 'typeorm';
import { NamespaceMember } from './namespace-members.entity';
import { Resource } from 'src/resources/resources.entity';
import { Namespace } from 'src/namespaces/namespaces.entity';

@Injectable()
export class NamespaceMemberService {
  constructor(
    @InjectRepository(NamespaceMember)
    private namespaceMemberRepository: Repository<NamespaceMember>,
  ) {}

  async addMember(
    namespaceId: string,
    userId: string,
    privateRootId: string,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(NamespaceMember)
      : this.namespaceMemberRepository;
    await repo.save(
      repo.create({
        namespace: { id: namespaceId },
        user: { id: userId },
        rootResource: { id: privateRootId },
      }),
    );
  }

  async getPrivateRoot(userId: string, namespaceId: string): Promise<Resource> {
    const member = await this.namespaceMemberRepository.findOne({
      where: {
        user: { id: userId },
        namespace: { id: namespaceId },
      },
      relations: ['rootResource'],
    });
    if (member === null) {
      throw new NotFoundException('Root resource not found.');
    }
    return member.rootResource;
  }

  async listNamespaces(userId: string): Promise<NamespaceMember[]> {
    return await this.namespaceMemberRepository.find({
      where: {
        user: { id: userId },
      },
      relations: ['namespace'],
    });
  }
}
