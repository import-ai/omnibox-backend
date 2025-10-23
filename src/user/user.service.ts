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
import { UpdateUserBindingDto } from 'omniboxd/user/dto/update-user-binding.dto';
import { CreateUserBindingDto } from 'omniboxd/user/dto/create-user-binding.dto';
import { Injectable, HttpStatus } from '@nestjs/common';
import { isUsernameBlocked } from 'omniboxd/utils/blocked-usernames';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

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
    private readonly i18n: I18nService,
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

  async validatePassword(password: string) {
    if (!password || password.length < 8) {
      const message = this.i18n.t('user.errors.passwordTooShort');
      throw new AppException(
        message,
        'PASSWORD_TOO_SHORT',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (!this.alphaRegex.test(password) || !this.numberRegex.test(password)) {
      const message = this.i18n.t('user.errors.passwordRequirements');
      throw new AppException(
        message,
        'PASSWORD_REQUIREMENTS',
        HttpStatus.BAD_REQUEST,
      );
    }
    return true;
  }

  async create(account: CreateUserDto, manager?: EntityManager) {
    if (account.username && isUsernameBlocked(account.username)) {
      const message = this.i18n.t('user.errors.accountAlreadyExists');
      throw new AppException(
        message,
        'ACCOUNT_ALREADY_EXISTS',
        HttpStatus.CONFLICT,
      );
    }
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    const existingUser = await repo.findOne({
      where: [{ username: account.username }, { email: account.email }],
    });

    if (existingUser) {
      const message = this.i18n.t('user.errors.accountAlreadyExists');
      throw new AppException(
        message,
        'ACCOUNT_ALREADY_EXISTS',
        HttpStatus.CONFLICT,
      );
    }

    await this.validatePassword(account.password);

    const hash = await bcrypt.hash(account.password, 10);
    const newUser = repo.create({
      ...account,
      password: hash,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...reset } = await repo.save(newUser);

    if (account.lang) {
      await this.createOptionIfNotSet(
        reset.id,
        'language',
        account.lang,
        manager,
      );
    }
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

  async findBindingByLoginType(userId: string, loginType: string) {
    const repo = this.userBindingRepository;
    return await repo.findOne({
      where: { userId, loginType },
    });
  }

  async unbindByLoginType(userId: string, loginType: string) {
    const repo = this.userBindingRepository;
    const binding = await repo.findOne({
      where: { userId, loginType },
    });
    if (!binding) {
      return;
    }
    await repo.remove(binding);
  }

  async updateBinding(oldUnionid: string, newUnionid: string) {
    // Unbind the associated new account
    const existBinding = await this.userBindingRepository.findOne({
      where: { loginId: newUnionid },
    });
    if (existBinding) {
      await this.userBindingRepository.remove(existBinding);
    }
    // Bind to old account
    const binding = await this.userBindingRepository.findOne({
      where: { loginId: oldUnionid },
    });
    if (binding) {
      await this.userBindingRepository.update(binding.id, {
        loginId: newUnionid,
      });
    }
  }

  async listBinding(userId: string) {
    const repo = this.userBindingRepository;
    return await repo.find({
      where: { userId },
    });
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
      email: userData.email,
      username: userData.username,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...reset } = await repo.save(newUser);
    if (userData.lang) {
      await this.createOptionIfNotSet(
        reset.id,
        'language',
        userData.lang,
        manager,
      );
    }

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

  async bindingExistUser(userData: UpdateUserBindingDto): Promise<User> {
    const bindingRepo = this.userBindingRepository;
    const newBinding = bindingRepo.create({
      userId: userData.userId,
      loginId: userData.loginId,
      loginType: userData.loginType,
    });

    await bindingRepo.save(newBinding);

    return await this.find(userData.userId);
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
    const user = await this.userRepository.findOne({
      where: { id },
      select: ['id', 'username', 'email'],
    });
    if (!user) {
      const message = this.i18n.t('user.errors.userNotFound');
      throw new AppException(message, 'USER_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    return user;
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

  async validateEmail(userId: string, email: string) {
    if (!isEmail(email)) {
      const message = this.i18n.t('user.errors.invalidEmailFormat');
      throw new AppException(
        message,
        'INVALID_EMAIL_FORMAT',
        HttpStatus.BAD_REQUEST,
      );
    }

    const userExists = await this.findByEmail(email);
    if (userExists) {
      const message = this.i18n.t('user.errors.emailAlreadyInUse');
      throw new AppException(
        message,
        'EMAIL_ALREADY_IN_USE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const code = generateId(6, '0123456789');

    this.emailStates.set(email, {
      code,
      createdAt: Date.now(),
      expiresIn: 5 * 60 * 1000,
    });

    this.cleanExpiresState();

    await this.mailService.validateEmail(email, code);

    return { email };
  }

  async update(id: string, account: UpdateUserDto) {
    if (account.username && isUsernameBlocked(account.username)) {
      const message = this.i18n.t('user.errors.accountAlreadyExists');
      throw new AppException(
        message,
        'ACCOUNT_ALREADY_EXISTS',
        HttpStatus.CONFLICT,
      );
    }
    const existUser = await this.find(id);
    if (account.password) {
      existUser.password = await bcrypt.hash(account.password, 10);
    }
    if (account.username && existUser.username !== account.username) {
      existUser.username = account.username;
    }
    if (account.email && existUser.email !== account.email) {
      if (!account.code) {
        const message = this.i18n.t('user.errors.provideVerificationCode');
        throw new AppException(
          message,
          'VERIFICATION_CODE_REQUIRED',
          HttpStatus.BAD_REQUEST,
        );
      }
      const emailState = this.emailStates.get(account.email);
      if (!emailState) {
        const message = this.i18n.t('user.errors.pleaseVerifyEmail');
        throw new AppException(
          message,
          'EMAIL_NOT_VERIFIED',
          HttpStatus.BAD_REQUEST,
        );
      }
      if (emailState.code !== account.code) {
        const message = this.i18n.t('user.errors.incorrectVerificationCode');
        throw new AppException(
          message,
          'INCORRECT_VERIFICATION_CODE',
          HttpStatus.BAD_REQUEST,
        );
      }
      this.emailStates.delete(account.email);
      existUser.email = account.email;
    }
    return await this.userRepository.update(id, existUser);
  }

  async updatePassword(id: string, password: string) {
    const account = await this.find(id);
    account.password = await bcrypt.hash(password, 10);

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

  async createOptionIfNotSet(
    userId: string,
    name: string,
    value: string,
    entityManager?: EntityManager,
  ) {
    const repo = entityManager
      ? entityManager.getRepository(UserOption)
      : this.userOptionRepository;
    const count = await repo.countBy({ userId, name });
    if (count > 0) {
      return;
    }
    await repo.save(repo.create({ userId, name, value }));
  }

  async getOption(userId: string, name: string, entityManager?: EntityManager) {
    const repo = entityManager
      ? entityManager.getRepository(UserOption)
      : this.userOptionRepository;
    const option = await repo.findOneBy({
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
