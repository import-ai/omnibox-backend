import * as bcrypt from 'bcrypt';
import { isEmail } from 'class-validator';
import generateId from 'omniboxd/utils/generate-id';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'omniboxd/user/entities/user.entity';
import { MailService } from 'omniboxd/mail/mail.service';
import { EntityManager, In, Like, Repository } from 'typeorm';
import { CreateUserDto } from 'omniboxd/user/dto/create-user.dto';
import { UpdateUserDto } from 'omniboxd/user/dto/update-user.dto';
import { UserOption } from 'omniboxd/user/entities/user-option.entity';
import { UserBinding } from 'omniboxd/user/entities/user-binding.entity';
import { CreateUserOptionDto } from 'omniboxd/user/dto/create-user-option.dto';
import { CreateUserBindingDto } from 'omniboxd/user/dto/create-user-binding.dto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';

@Injectable()
export class UserService {
  private readonly emailStates = new Map<
    string,
    {
      code: string;
      createdAt: number;
      expiresIn: number;
    }
  >();

  private readonly alphaRegex = /[a-zA-Z]/;
  private readonly numberRegex = /\d/;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserOption)
    private userOptionRepository: Repository<UserOption>,
    @InjectRepository(UserBinding)
    private userBindingRepository: Repository<UserBinding>,
    private readonly mailService: MailService,
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

  validatePassword(password: string) {
    if (!password || password.length < 8) {
      throw new BadRequestException(
        'Password must be at least 6 characters long',
      );
    }
    if (!this.alphaRegex.test(password) || !this.numberRegex.test(password)) {
      throw new BadRequestException(
        'Password must contain at least one letter and one number',
      );
    }
    return true;
  }

  async create(account: CreateUserDto, manager?: EntityManager) {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    const existingUser = await repo.findOne({
      where: [{ username: account.username }, { email: account.email }],
    });

    if (existingUser) {
      throw new ConflictException('The account already exists');
    }

    this.validatePassword(account.password);

    const hash = await bcrypt.hash(account.password, 10);
    const newUser = repo.create({
      ...account,
      password: hash,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...reset } = await repo.save(newUser);
    return reset;
  }

  async findByLoginId(loginId: string, manager?: EntityManager) {
    const repo = manager
      ? manager.getRepository(UserBinding)
      : this.userBindingRepository;
    const binding = await repo.findOne({
      where: { loginId },
    });
    if (!binding) {
      return;
    }
    return await this.find(binding.userId);
  }

  async findByUsername(
    username: string,
    manager?: EntityManager,
  ): Promise<User | null> {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    return await repo.findOne({
      where: { username },
      select: ['id', 'username', 'email'],
    });
  }

  async createUserBinding(
    userData: CreateUserBindingDto,
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    const hash = await bcrypt.hash(Math.random().toString(36), 10);
    const newUser = repo.create({
      password: hash,
      username: userData.username,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...reset } = await repo.save(newUser);

    const bindingRepo = manager
      ? manager.getRepository(UserBinding)
      : this.userBindingRepository;

    const newBinding = bindingRepo.create({
      userId: reset.id,
      loginId: userData.loginId,
      loginType: userData.loginType,
    });

    await bindingRepo.save(newBinding);

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

  async find(id: string) {
    return await this.userRepository.findOne({
      where: { id },
      select: ['id', 'username', 'email'],
    });
  }

  async findByIds(ids: string[]): Promise<User[]> {
    return await this.userRepository.find({
      where: { id: In(ids) },
      select: ['id', 'username', 'email'],
    });
  }

  async findByEmail(email: string) {
    return await this.userRepository.findOne({
      where: { email },
      select: ['id', 'username', 'email'],
    });
  }

  private cleanExpiresState() {
    const now = Date.now();
    for (const [state, info] of this.emailStates.entries()) {
      if (now - info.createdAt > info.expiresIn) {
        this.emailStates.delete(state);
      }
    }
  }

  async validateEmail(email: string) {
    if (!isEmail(email)) {
      throw new BadRequestException('Invalid email format');
    }

    const userExists = await this.findByEmail(email);
    if (userExists) {
      throw new BadRequestException(
        'This email is already in use, please use a different email',
      );
    }

    const code = generateId(6);

    this.emailStates.set(email, {
      code,
      createdAt: Date.now(),
      expiresIn: 5 * 60 * 1000,
    });

    this.cleanExpiresState();

    await this.mailService.validateEmail(email, code);

    return { code, email };
  }

  async update(id: string, account: UpdateUserDto) {
    const existUser = await this.find(id);
    if (!existUser) {
      throw new ConflictException('The account does not exist');
    }
    if (account.password) {
      existUser.password = await bcrypt.hash(account.password, 10);
    }
    if (account.username && existUser.username !== account.username) {
      existUser.username = account.username;
    }
    if (account.email && existUser.email !== account.email) {
      if (!account.code) {
        throw new BadRequestException(
          'Please provide the email verification code',
        );
      }
      const emailState = this.emailStates.get(account.email);
      if (!emailState) {
        throw new BadRequestException('Please verify your email first');
      }
      if (emailState.code !== account.code) {
        throw new BadRequestException('Incorrect email verification code');
      }
      this.emailStates.delete(account.email);
      existUser.email = account.email;
    }
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

  async createOption(userId: string, createOptionDto: CreateUserOptionDto) {
    const option = this.userOptionRepository.create({
      userId,
      ...createOptionDto,
    });
    await this.userOptionRepository.save(option);
  }

  async getOption(userId: string, name: string) {
    const option = await this.userOptionRepository.findOneBy({
      name,
      userId,
    });
    return option;
  }

  async updateOption(userId: string, name: string, value: string) {
    const option = await this.userOptionRepository.findOneOrFail({
      where: { userId, name },
    });
    option.value = value;
    return await this.userOptionRepository.save(option);
  }
}
