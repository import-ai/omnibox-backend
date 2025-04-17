import * as bcrypt from 'bcrypt';
import { Repository, Like } from 'typeorm';
import { User } from 'src/user/user.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { UpdateUserDto } from 'src/user/dto/update-user.dto';
import { Injectable, ConflictException } from '@nestjs/common';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async verify(email: string, password: string) {
    const account = await this.findByEmail(email);
    if (!account) {
      return;
    }
    const match = await bcrypt.compare(password, account.password);
    if (!match) {
      return;
    }
    return account;
  }

  async create(account: CreateUserDto) {
    const existingUser = await this.userRepository.findOne({
      where: [{ username: account.username }, { email: account.email }],
    });

    if (existingUser) {
      throw new ConflictException('当前账户已存在');
    }

    if (account.password !== account.password_repeat) {
      throw new ConflictException('两次密码不一致');
    }

    const hash = await bcrypt.hash(account.password, 10);
    const newUser = this.userRepository.create({
      ...account,
      password: hash,
    });

    return await this.userRepository.save(newUser);
  }

  async findAll(start: number, limit: number, username?: string) {
    const where: any = {};
    if (username) {
      where.username = Like(`%${username}%`);
    }
    const data = await this.userRepository.findAndCount({
      where,
      take: limit,
      skip: (start - 1) * limit,
      order: { updatedAt: 'DESC' },
    });
    return {
      start,
      limit,
      list: data[0],
      total: data[1],
    };
  }

  async find(id: number) {
    return await this.userRepository.findOne({
      where: { id },
    });
  }

  async findByEmail(email: string) {
    return await this.userRepository.findOne({ where: { email } });
  }

  async update(id: number, account: UpdateUserDto) {
    const existingUser = await this.find(id);

    if (!existingUser) {
      throw new ConflictException('当前账户不存在');
    }

    if (account.password && account.password_repeat) {
      if (account.password !== account.password_repeat) {
        throw new ConflictException('两次密码不一致');
      }
      existingUser.password = await bcrypt.hash(account.password, 10);
    }
    if (account.email) {
      existingUser.email = account.email;
    }
    if (account.username) {
      existingUser.username = account.username;
    }
    return await this.userRepository.update(id, existingUser);
  }

  async updatePassword(id: number, password: string) {
    const account = await this.find(id);

    if (!account) {
      throw new ConflictException('当前账户不存在');
    }

    const hash = await bcrypt.hash(password, 10);

    account.password = hash;

    return await this.userRepository.update(id, account);
  }

  async remove(id: number) {
    return await this.userRepository.softDelete(id);
  }
}
