import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
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
        { ownerId: userId, deletedAt: IsNull() },
        { collaborators: userId, deletedAt: IsNull() },
      ],
    });
  }

  async createNamespace(name: string, ownerId: string): Promise<Namespace> {
    const newNamespace = this.namespaceRepository.create({ name, ownerId });
    const savedNamespace = await this.namespaceRepository.save(newNamespace);

    const rootParams = {
      namespaceId: savedNamespace.namespaceId,
      resourceType: 'folder',
    };

    const teamspaceRoot = this.resourceRepository.create({
      ...rootParams,
      spaceType: 'teamspace',
    });

    const privateRoot = this.resourceRepository.create({
      ...rootParams,
      spaceType: 'private',
    });

    await this.resourceRepository.save([teamspaceRoot, privateRoot]);
    return savedNamespace;
  }

  async deleteNamespace(namespaceId: string, userId: string): Promise<void> {
    const namespace = await this.namespaceRepository.findOne({
      where: { namespaceId, deletedAt: IsNull() },
    });

    if (!namespace) {
      throw new NotFoundException('Namespace not found');
    }

    if (namespace.ownerId !== userId) {
      throw new ForbiddenException('You do not have permission to delete this namespace');
    }

    namespace.deletedAt = new Date();
    await this.namespaceRepository.save(namespace);
  }
}
