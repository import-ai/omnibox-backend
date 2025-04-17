import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { Namespace } from 'src/namespaces/namespaces.entity';
import { Injectable, NotFoundException } from '@nestjs/common';
// import { CreateNamespaceDto } from 'src/namespaces/dto/create-namespace.dto';
// import { UpdateNamespaceDto } from 'src/namespaces/dto/update-namespace.dto';

@Injectable()
export class NamespacesService {
  constructor(
    @InjectRepository(Namespace)
    private readonly namespaceRepository: Repository<Namespace>,
  ) {}

  async getByUser(user_id: string) {
    const namespace = await this.namespaceRepository.find({
      where: {
        user: { id: +user_id },
      },
      relations: ['user'],
    });
    if (!namespace) {
      throw new NotFoundException('空间不存在');
    }
    return namespace;
  }

  async get(id: number) {
    const namespace = await this.namespaceRepository.findOne({
      where: {
        id,
      },
      relations: ['user'],
    });
    if (!namespace) {
      throw new NotFoundException('空间不存在');
    }
    return namespace;
  }

  async create(userId: string, name: string) {
    const newNamespace = this.namespaceRepository.create({
      name,
      user: { id: +userId },
    });
    return await this.namespaceRepository.save(newNamespace);
  }

  async delete(id: number) {
    await this.namespaceRepository.softDelete(id);
  }
}
