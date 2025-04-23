import each from 'src/utils/each';
import { ArrayContains, Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Namespace } from 'src/namespaces/namespaces.entity';
import { UpdateNamespaceDto } from './dto/update-namespace.dto';
import {
  Injectable,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class NamespacesService {
  constructor(
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
  ) {}

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
    const newNamespace = this.namespaceRepository.create({
      name,
      owner_id: [userId],
    });
    return await this.namespaceRepository.save(newNamespace);
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
