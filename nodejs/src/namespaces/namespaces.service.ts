import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { Namespace } from './namespaces.entity';
import { Resource } from 'src/resources/resources.entity';

@Injectable()
export class NamespacesService {
  constructor(
    @InjectRepository(Namespace)
    private namespaceRepository: Repository<Namespace>,
    @InjectRepository(Resource)
    private resourceRepository: Repository<Resource>,
  ) {}

  async getNamespaces(userId: string): Promise<Namespace[]> {
    return this.namespaceRepository.find({
      where: [
        { owner_id: userId, deleted_at: IsNull() },
        { collaborators: userId, deleted_at: IsNull() },
      ],
    });
  }

  async createNamespace(name: string, ownerId: string): Promise<Namespace> {
    const newNamespace = this.namespaceRepository.create({
      name,
      owner_id: ownerId,
    });
    const savedNamespace = await this.namespaceRepository.save(newNamespace);

    const rootParams = {
      namespaceId: savedNamespace.namespace_id,
      resourceType: 'folder',
    };

    const teamspaceRoot = this.resourceRepository.create({
      ...rootParams,
      space_type: 'teamspace',
    });

    const privateRoot = this.resourceRepository.create({
      ...rootParams,
      space_type: 'private',
    });

    await this.resourceRepository.save([teamspaceRoot, privateRoot]);
    return savedNamespace;
  }

  async deleteNamespace(namespaceId: string, userId: string): Promise<void> {
    const namespace = await this.namespaceRepository.findOne({
      where: { namespace_id: namespaceId, deleted_at: IsNull() },
    });

    if (!namespace) {
      throw new NotFoundException('Namespace not found');
    }

    if (namespace.owner_id !== userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this namespace',
      );
    }

    namespace.deleted_at = new Date();
    await this.namespaceRepository.save(namespace);
  }
}
