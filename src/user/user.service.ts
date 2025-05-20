import * as bcrypt from 'bcrypt';
import { User } from 'src/user/user.entity';
import { In, Repository, Like, EntityManager } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import { UpdateUserDto } from 'src/user/dto/update-user.dto';
import { Injectable, ConflictException } from '@nestjs/common';
import { isEmail } from 'class-validator';

@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  async verify(email: string, password: string) {
    let account: User | null = null;
    if (isEmail(email)) {
      account = await this.userRepository.findOne({
        where: { email },
      });
    } else {
      account = await this.userRepository.findOne({
        where: { username: email },
      });
    }
    if (!account) {
      return;
    }
    const match = await bcrypt.compare(password, account.password);
    if (!match) {
      return;
    }
    return account;
  }

  async create(account: CreateUserDto, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    const existingUser = await repo.findOne({
      where: [{ username: account.username }, { email: account.email }],
    });

    if (existingUser) {
      throw new ConflictException('The account already exists');
    }

    if (account.password !== account.password_repeat) {
      throw new ConflictException('Passwords do not match');
    }

    const hash = await bcrypt.hash(account.password, 10);
    const newUser = repo.create({
      ...account,
      password: hash,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...reset } = await repo.save(newUser);
    return reset;
  }

  async findAll(start: number, limit: number, search?: string) {
    const where: any = {};
    if (search) {
      where.username = Like(`%${search}%`);
    }
    const data = await this.userRepository.findAndCount({
      where,
      take: limit,
      skip: (start - 1) * limit,
      order: { updatedAt: 'DESC' },
      select: ['id', 'username', 'email'],
    });
    return {
      start,
      limit,
      list: data[0],
      total: data[1],
    };
  }

  async usersByIds(ids: Array<string>) {
    if (ids.length <= 0) {
      return [];
    }
    return await this.userRepository.find({
      where: { id: In(ids) },
      select: ['id', 'username', 'email'],
    });
  }

  async find(id: string) {
    return await this.userRepository.findOne({
      where: { id },
      select: ['id', 'username', 'email'],
    });
  }

  async findByEmail(email: string) {
    return await this.userRepository.findOne({
      where: { email },
      select: ['id', 'username', 'email'],
    });
  }

  async update(id: string, account: UpdateUserDto) {
    const existUser = await this.find(id);

    if (!existUser) {
      throw new ConflictException('The account does not exist');
    }

    if (account.password && account.password_repeat) {
      if (account.password !== account.password_repeat) {
        throw new ConflictException('Passwords do not match');
      }
      existUser.password = await bcrypt.hash(account.password, 10);
    }
    ['email', 'username'].forEach((field) => {
      if (account[field]) {
        existUser[field] = account[field];
      }
    });
    return await this.userRepository.update(id, existUser);
  }

  async updatePassword(id: string, password: string) {
    const account = await this.find(id);

    if (!account) {
      throw new ConflictException('The account does not exist');
    }

    const hash = await bcrypt.hash(password, 10);

    account.password = hash;

    return await this.userRepository.update(id, account);
  }

  async remove(id: string) {
    return await this.userRepository.softDelete(id);
  }
}
