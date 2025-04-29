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
  ) { }

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

  async get(id: string) {
    const namespace = await this.namespaceRepository.findOne({
      where: {
        id,
      },
    });
    if (!namespace) {
      throw new NotFoundException('Workspace not found');
    }
    return namespace;
  }

  async create(userId: string, name: string) {
    return await this.dataSource.transaction(async manager => {
      const namespace = await manager.save(manager.create(Namespace, {
        name,
        owner_id: [userId],
      }));
      const privateRoot = await manager.save(manager.create(Resource, {
        resourceType: 'folder',
        parent: null,
        namespace: { id: namespace.id },
        user: { id: userId },
      }))
      const publicRoot = await manager.save(manager.create(Resource, {
        resourceType: 'folder',
        parent: null,
        namespace: { id: namespace.id },
        user: { id: userId },
      }))
      manager.save(manager.create(NamespaceMember, {
        namespace: { id: namespace.id },
        user: { id: userId },
        rootResource: { id: privateRoot.id },
      }));
      manager.save(manager.create(NamespaceMember, {
        namespace: { id: namespace.id },
        user: null,
        rootResource: { id: publicRoot.id },
      }));
    });
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

  async update(id: string, updateNamespace: UpdateNamespaceDto) {
    const existNamespace = await this.get(id);
    if (!existNamespace) {
      throw new ConflictException('The current namespace does not exist');
    }
    each(updateNamespace, (value, key) => {
      existNamespace[key] = value;
    });
    return await this.namespaceRepository.update(id, existNamespace);
  }

  async delete(id: string) {
    await this.namespaceRepository.softDelete(id);
  }
}

