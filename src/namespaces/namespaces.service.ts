import each from 'src/utils/each';
import { ArrayContains, DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Namespace } from 'src/namespaces/namespaces.entity';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { Resource, ResourceType } from 'src/resources/resources.entity';
import { NamespaceMember } from 'src/namespace-members/namespace-members.entity';

@Injectable()
export class NamespacesService {
  constructor(
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
    private dataSource: DataSource,
  ) {}

  async getTeamspaceRoot(namespaceId: string): Promise<Resource> {
    const namespace = await this.namespaceRepository.findOne({
      where: {
        id: namespaceId,
      },
      relations: ['rootResource'],
    });
    if (namespace === null) {
      throw new NotFoundException('Workspace not found');
    }
    if (namespace.rootResource === null) {
      throw new NotFoundException('Root resource not found');
    }
    return namespace.rootResource;
  }

  async setTeamspaceRoot(
    namespaceId: string,
    rootId: string,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    await repo.update(namespaceId, { rootResource: { id: rootId } });
  }

  async getByUser(user_id: string) {
    const namespaces = await this.namespaceRepository.find({
      where: {
        owner_id: ArrayContains([user_id]),
      },
    });
    if (namespaces.length <= 0) {
      throw new NotFoundException('Workspace not found');
    }
    return namespaces;
  }

  async get(id: string, manager?: EntityManager) {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    const namespace = await repo.findOne({
      where: {
        id,
      },
    });
    if (!namespace) {
      throw new NotFoundException('Workspace not found');
    }
    return namespace;
  }

  async findByName(name: string) {
    return await this.namespaceRepository.findOne({
      where: { name },
    });
  }

  async create(
    ownerId: string,
    name: string,
    manager?: EntityManager,
  ): Promise<Namespace> {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    return await repo.save(
      repo.create({
        name,
        owner_id: [ownerId],
      }),
    );
  }

  async disableUser(namespaceId: string, userId: string) {
    const namespace = await this.get(namespaceId);
    if (!namespace.collaborators.includes(userId)) {
      return;
    }
    // todo: remove user from collaborators
    return;
  }

  async removeUser(namespaceId: string, userId: string) {
    const namespace = await this.get(namespaceId);
    if (!namespace.collaborators.includes(userId)) {
      return;
    }
    namespace.collaborators = namespace.collaborators.filter(
      (collaborator) => collaborator !== userId,
    );
    await this.namespaceRepository.save(namespace);
  }

  async update(
    id: string,
    updateNamespace: UpdateNamespaceDto,
    manager?: EntityManager,
  ) {
    const repo = manager
      ? manager.getRepository(Namespace)
      : this.namespaceRepository;
    const existNamespace = await this.get(id, manager);
    if (!existNamespace) {
      throw new ConflictException('The current namespace does not exist');
    }
    each(updateNamespace, (value, key) => {
      existNamespace[key] = value;
    });
    return await repo.update(id, existNamespace);
  }

  async delete(id: string) {
    await this.namespaceRepository.softDelete(id);
  }
}
