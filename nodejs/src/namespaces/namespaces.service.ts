import {
  Injectable,
  NotFoundException,
  ForbiddenException,
} from '@nestjs/common';
import { Repository, In } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { UserService } from 'src/user/user.service';
import { Namespace } from 'src/namespaces/namespaces.entity';

@Injectable()
export class NamespacesService {
  constructor(
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
    private readonly userService: UserService,
  ) {}

  async get(namespaceId: string) {
    const namespace = await this.namespaceRepository.findOne({
      where: {
        namespace_id: namespaceId,
      },
    });

    return namespace;
  }

  async getByUser(userId: string): Promise<Namespace[]> {
    return this.namespaceRepository.find({
      relations: ['user'],
      where: {
        collaborators: In([userId]),
        user: { user_id: +userId },
      },
    });
  }

  async create(name: string, ownerId: string): Promise<Namespace> {
    const account = await this.userService.find(ownerId);
    if (!account) {
      throw new NotFoundException('User not found');
    }
    const newNamespace = this.namespaceRepository.create({
      name,
      user: account,
    });
    return await this.namespaceRepository.save(newNamespace);

    // 资源创建不要在空间创建，前端解耦
    // const rootParams = {
    //   resource_type: 'folder',
    //   namespace: savedNamespace,
    // };

    // await this.resourcesService.create({
    //   ...rootParams,
    //   space_type: 'teamspace',
    // });

    // await this.resourcesService.create({
    //   ...rootParams,
    //   space_type: 'private',
    // });
  }

  async delete(namespaceId: string, userId: string): Promise<void> {
    const namespace = await this.namespaceRepository.findOne({
      where: { namespace_id: namespaceId },
      relations: ['user'],
    });
    if (!namespace) {
      throw new NotFoundException('Namespace not found');
    }
    if (namespace.user.user_id !== +userId) {
      throw new ForbiddenException(
        'You do not have permission to delete this namespace',
      );
    }
    await this.namespaceRepository.softRemove(namespace);
  }
}
