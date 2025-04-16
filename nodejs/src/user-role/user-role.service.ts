import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRole } from './user-role.entity';

@Injectable()
export class UserRoleService {
  constructor(
    @InjectRepository(UserRole)
    private readonly userRoleRepository: Repository<UserRole>,
  ) {}

  async create(userRole: Partial<UserRole>): Promise<UserRole> {
    return await this.userRoleRepository.save(userRole);
  }

  async findOne(user_role_id: string): Promise<UserRole | null> {
    return await this.userRoleRepository.findOne({ where: { user_role_id } });
  }
}
