import each from 'src/utils/each';
import { ArrayContains, DataSource, EntityManager, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Namespace } from 'src/namespaces/namespaces.entity';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Resource } from 'src/resources/resources.entity';
import { NamespaceMemberService } from 'src/namespace-members/namespace-members.service';
import { User } from '../user/user.entity';

@Injectable()
export class NamespacesService {
  constructor(
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
    private readonly namespaceMemberService: NamespaceMemberService,
    private readonly dataSource: DataSource,
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

  async getByOwner(ownerId: string) {
    const namespaces = await this.namespaceRepository.find({
      where: {
        owner_id: ArrayContains([ownerId]),
      },
    });
    if (namespaces.length <= 0) {
      throw new NotFoundException('Workspace not found');
    }
    return namespaces;
  }

  async getByUser(user: User) {
    return await this.namespaceRepository.find({
      where: [
        { owner_id: ArrayContains([user.id]) },
        { collaborators: ArrayContains([user.id]) },
      ],
    });
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

  async create(ownerId: string, name: string): Promise<Namespace> {
    return await this.dataSource.transaction(async (manager) => {
      return await this.createAndInit(ownerId, name, manager);
    });
  }

  async createAndInit(
    ownerId: string,
    name: string,
    manager: EntityManager,
  ): Promise<Namespace> {
    const namespace = await manager.save(
      manager.create(Namespace, {
        name,
        owner_id: [ownerId],
      }),
    );
    const privateRoot = await manager.save(
      manager.create(Resource, {
        resourceType: 'folder',
        parent: null,
        namespace: { id: namespace.id },
        user: { id: ownerId },
      }),
    );
    const publicRoot = await manager.save(
      manager.create(Resource, {
        resourceType: 'folder',
        parent: null,
        namespace: { id: namespace.id },
        user: { id: ownerId },
      }),
    );
    await this.namespaceMemberService.addMember(
      namespace.id,
      ownerId,
      privateRoot.id,
      manager,
    );
    await manager.update(Namespace, namespace.id, {
      rootResource: { id: publicRoot.id },
    });
    return namespace;
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
