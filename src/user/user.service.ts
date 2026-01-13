import * as bcrypt from 'bcrypt';
import { isEmail } from 'class-validator';
import generateId from 'omniboxd/utils/generate-id';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'omniboxd/user/entities/user.entity';
import { MailService } from 'omniboxd/mail/mail.service';
import { SmsService } from 'omniboxd/sms/sms.service';
import { DataSource, EntityManager, In, Like, Repository } from 'typeorm';
import {
  NamespaceMember,
  NamespaceRole,
} from 'omniboxd/namespaces/entities/namespace-member.entity';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { APIKey } from 'omniboxd/api-key/api-key.entity';
import { Applications } from 'omniboxd/applications/applications.entity';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { Invitation } from 'omniboxd/invitations/entities/invitation.entity';
import { Namespace } from 'omniboxd/namespaces/entities/namespace.entity';
import { CreateUserDto } from 'omniboxd/user/dto/create-user.dto';
import { UpdateUserDto } from 'omniboxd/user/dto/update-user.dto';
import { UserOption } from 'omniboxd/user/entities/user-option.entity';
import { UserBinding } from 'omniboxd/user/entities/user-binding.entity';
import { CreateUserOptionDto } from 'omniboxd/user/dto/create-user-option.dto';
import { UpdateUserBindingDto } from 'omniboxd/user/dto/update-user-binding.dto';
import { CreateUserBindingDto } from 'omniboxd/user/dto/create-user-binding.dto';
import { Injectable, HttpStatus } from '@nestjs/common';
import { isNameBlocked } from 'omniboxd/utils/blocked-names';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { CacheService } from 'omniboxd/common/cache.service';
import { filterEmoji } from 'omniboxd/utils/emoji';
import { appendTokenToUrl } from 'omniboxd/utils/url-utils';

interface EmailVerificationState {
  code: string;
  createdAt: number;
  expiresIn: number;
}

interface PhoneVerificationState {
  code: string;
  createdAt: number;
  expiresIn: number;
  attempts: number;
}

interface AccountDeletionState {
  userId: string;
  username: string;
  createdAt: number;
  expiresIn: number;
}

interface NamespaceOwnershipCheck {
  blocked: boolean;
  soloNamespaceIds: string[];
}

@Injectable()
export class UserService {
  private readonly namespace = '/user/email-verification';
  private readonly phoneNamespace = '/user/phone-verification';
  private readonly deletionNamespace = '/user/account-deletion';
  private readonly alphaRegex = /[a-zA-Z]/;
  private readonly numberRegex = /\d/;
  private readonly MAX_PHONE_ATTEMPTS = 5;

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(UserOption)
    private userOptionRepository: Repository<UserOption>,
    @InjectRepository(UserBinding)
    private userBindingRepository: Repository<UserBinding>,
    private readonly mailService: MailService,
    private readonly smsService: SmsService,
    private readonly i18n: I18nService,
    private readonly cacheService: CacheService,
    private readonly dataSource: DataSource,
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
    // Reject authentication if password is empty (OTP-only users)
    if (account.password === '') {
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
    // Filter emoji from username if provided
    if (account.username) {
      account.username = filterEmoji(account.username);
    }

    if (account.username && isNameBlocked(account.username)) {
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

    // Only validate and hash password if provided (skip for OTP-only users)
    let passwordHash = account.password;
    if (account.password) {
      this.validatePassword(account.password);
      passwordHash = await bcrypt.hash(account.password, 10);
    }

    const newUser = repo.create({
      ...account,
      password: passwordHash,
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

  async findUserBinding(
    userId: string,
    loginType: string,
  ): Promise<UserBinding | null> {
    return await this.userBindingRepository.findOne({
      where: { userId, loginType },
    });
  }

  async updateUserBindingWhenMetadataEmpty(
    userId: string,
    loginType: string,
    metadata: Record<string, any>,
  ) {
    const userBinding = await this.findUserBinding(userId, loginType);
    if (userBinding && !userBinding.metadata) {
      userBinding.metadata = metadata;
      await this.userBindingRepository.save(userBinding);
    }
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
    const bindings = await repo.find({
      where: { userId },
    });

    // Mask phone numbers - show only last 4 digits
    return bindings.map((binding) => {
      if (binding.loginType === 'phone' && binding.loginId) {
        // Strip country code if present for proper masking
        let nationalNumber = binding.loginId;
        if (nationalNumber.startsWith('+86')) {
          nationalNumber = nationalNumber.slice(3);
        }
        const masked =
          nationalNumber.length > 4
            ? '*'.repeat(nationalNumber.length - 4) + nationalNumber.slice(-4)
            : nationalNumber;
        return { ...binding, loginId: masked };
      }
      return binding;
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

    // Filter emoji from username
    const username = filterEmoji(userData.username);

    const newUser = repo.create({
      password: hash,
      email: userData.email,
      username: username,
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
      metadata: userData.metadata,
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
      metadata: userData.metadata,
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

  async findByPhone(phone: string): Promise<User | null> {
    const binding = await this.userBindingRepository.findOne({
      where: { loginType: 'phone', loginId: phone },
    });
    if (!binding) {
      return null;
    }
    return await this.userRepository.findOne({
      where: { id: binding.userId },
      select: ['id', 'username', 'email'],
    });
  }

  async createUserWithPhone(
    userData: {
      phone: string;
      username: string;
      lang?: string;
    },
    manager?: EntityManager,
  ) {
    const repo = manager ? manager.getRepository(User) : this.userRepository;
    const hash = await bcrypt.hash(Math.random().toString(36), 10);

    // Filter emoji from username
    const username = filterEmoji(userData.username);

    const newUser = repo.create({
      password: hash,
      email: null,
      username: username,
    });

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, ...result } = await repo.save(newUser);

    if (userData.lang) {
      await this.createOptionIfNotSet(
        result.id,
        'language',
        userData.lang,
        manager,
      );
    }

    const bindingRepo = manager
      ? manager.getRepository(UserBinding)
      : this.userBindingRepository;

    const newBinding = bindingRepo.create({
      userId: result.id,
      loginId: userData.phone,
      loginType: 'phone',
      metadata: { verified: true },
    });

    await bindingRepo.save(newBinding);

    return result;
  }

  async validateEmail(userId: string, email: string) {
    // Check if new email is same as current email
    const currentUser = await this.find(userId);
    if (currentUser.email?.toLowerCase() === email.toLowerCase()) {
      const message = this.i18n.t('user.errors.emailSameAsCurrent');
      throw new AppException(
        message,
        'EMAIL_SAME_AS_CURRENT',
        HttpStatus.BAD_REQUEST,
      );
    }

    const userExists = await this.findByEmail(email);
    if (userExists && userExists.id !== userId) {
      const message = this.i18n.t('user.errors.emailAlreadyInUse');
      throw new AppException(
        message,
        'EMAIL_ALREADY_IN_USE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const code = generateId(6, '0123456789');
    const expiresIn = 5 * 60 * 1000;

    await this.cacheService.set<EmailVerificationState>(
      this.namespace,
      email,
      {
        code,
        createdAt: Date.now(),
        expiresIn,
      },
      expiresIn,
    );

    // Get user info for personalization
    const userLangOption = await this.getOption(userId, 'language');
    const userLang = userLangOption?.value;
    await this.mailService.validateEmail(
      email,
      code,
      currentUser.username,
      userLang,
    );
    return { email };
  }

  async sendPhoneBindingCode(userId: string, phone: string) {
    // Check if phone is already bound to another user
    const existingBinding = await this.userBindingRepository.findOne({
      where: { loginType: 'phone', loginId: phone },
    });

    if (existingBinding && existingBinding.userId !== userId) {
      const message = this.i18n.t('user.errors.phoneAlreadyInUse');
      throw new AppException(
        message,
        'PHONE_ALREADY_IN_USE',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check if user already has this phone bound
    if (existingBinding && existingBinding.userId === userId) {
      const message = this.i18n.t('user.errors.phoneSameAsCurrent');
      throw new AppException(
        message,
        'PHONE_SAME_AS_CURRENT',
        HttpStatus.BAD_REQUEST,
      );
    }

    const code = generateId(6, '0123456789');
    const expiresIn = 5 * 60 * 1000; // 5 minutes

    await this.cacheService.set<PhoneVerificationState>(
      this.phoneNamespace,
      `${userId}:${phone}`,
      {
        code,
        createdAt: Date.now(),
        expiresIn,
        attempts: 0,
      },
      expiresIn,
    );

    // Send SMS with code
    await this.smsService.sendOtp(phone, code);

    return { phone };
  }

  async bindPhone(userId: string, phone: string, code: string) {
    const cacheKey = `${userId}:${phone}`;
    const phoneState = await this.cacheService.get<PhoneVerificationState>(
      this.phoneNamespace,
      cacheKey,
    );

    if (!phoneState) {
      const message = this.i18n.t('user.errors.pleaseVerifyPhone');
      throw new AppException(
        message,
        'PHONE_NOT_VERIFIED',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Check max attempts
    if (phoneState.attempts >= this.MAX_PHONE_ATTEMPTS) {
      await this.cacheService.delete(this.phoneNamespace, cacheKey);
      const message = this.i18n.t('user.errors.tooManyAttempts');
      throw new AppException(
        message,
        'TOO_MANY_ATTEMPTS',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (phoneState.code !== code) {
      // Increment attempts
      phoneState.attempts++;
      const ttl = phoneState.expiresIn - (Date.now() - phoneState.createdAt);
      await this.cacheService.set(
        this.phoneNamespace,
        cacheKey,
        phoneState,
        ttl,
      );

      const message = this.i18n.t('user.errors.incorrectVerificationCode');
      throw new AppException(
        message,
        'INCORRECT_VERIFICATION_CODE',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Delete the verification state
    await this.cacheService.delete(this.phoneNamespace, cacheKey);

    // Check if user already has a phone binding
    const existingUserBinding = await this.userBindingRepository.findOne({
      where: { userId, loginType: 'phone' },
    });

    if (existingUserBinding) {
      // Update existing binding
      existingUserBinding.loginId = phone;
      existingUserBinding.metadata = { verified: true };
      await this.userBindingRepository.save(existingUserBinding);
    } else {
      // Create new binding
      const newBinding = this.userBindingRepository.create({
        userId,
        loginId: phone,
        loginType: 'phone',
        metadata: { verified: true },
      });
      await this.userBindingRepository.save(newBinding);
    }

    return { success: true };
  }

  async update(id: string, account: UpdateUserDto) {
    // Filter emoji from username if provided
    if (account.username) {
      account.username = filterEmoji(account.username);
    }

    if (account.username && !account.username.trim().length) {
      const message = this.i18n.t('user.errors.userCannotbeEmptyStr');
      throw new AppException(
        message,
        'USERNAME_CANNOT_BE_EMPTY',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (account.username && isNameBlocked(account.username)) {
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
      // Check if the new username is already taken by another user
      const duplicateUser = await this.userRepository.findOne({
        where: { username: account.username },
      });

      if (duplicateUser && duplicateUser.id !== id) {
        const message = this.i18n.t('user.errors.usernameAlreadyExists');
        throw new AppException(
          message,
          'USERNAME_ALREADY_EXISTS',
          HttpStatus.CONFLICT,
        );
      }

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
      const emailState = await this.cacheService.get<EmailVerificationState>(
        this.namespace,
        account.email,
      );
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
      await this.cacheService.delete(this.namespace, account.email);

      // Store old email before updating
      const oldEmail = existUser.email;
      existUser.email = account.email;

      // Send notification to old email after successful update (only if old email exists)
      // Users from WeChat/OAuth signup may not have an email initially
      if (oldEmail) {
        const userLangOption = await this.getOption(id, 'language');
        const userLang = userLangOption?.value;

        // Send notification asynchronously (don't block the response)
        this.mailService
          .sendEmailChangeNotification(
            oldEmail,
            oldEmail,
            account.email,
            existUser.username || undefined,
            userLang,
          )
          .catch((error) => {
            // Log error but don't fail the update
            console.error('Failed to send email change notification:', error);
          });
      }
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

  async initiateAccountDeletion(
    userId: string,
    username: string,
    baseUrl: string,
  ) {
    // 1. Verify user exists and username matches
    const user = await this.find(userId);
    if (user.username !== username) {
      const message = this.i18n.t('user.errors.usernameMismatch');
      throw new AppException(
        message,
        'USERNAME_MISMATCH',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Check namespace ownership constraint first (403 takes precedence)
    const namespaceCheck = await this.checkNamespaceOwnershipConstraint(userId);
    if (namespaceCheck.blocked) {
      const message = this.i18n.t('user.errors.cannotDeleteOwnerWithMembers');
      throw new AppException(
        message,
        'CANNOT_DELETE_OWNER_WITH_MEMBERS',
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Check email exists (needed to send confirmation)
    if (!user.email) {
      const message = this.i18n.t('user.errors.emailRequiredForDeletion');
      throw new AppException(
        message,
        'EMAIL_REQUIRED_FOR_DELETION',
        HttpStatus.FORBIDDEN,
      );
    }

    // 4. Generate deletion token
    const token = generateId(32); // 32-char random token
    const expiresIn = 15 * 60 * 1000; // 15 minutes

    // 5. Store deletion state in cache
    await this.cacheService.set<AccountDeletionState>(
      this.deletionNamespace,
      token,
      {
        userId,
        username,
        createdAt: Date.now(),
        expiresIn,
      },
      expiresIn,
    );

    // 6. Build confirmation URL and send deletion confirmation email
    const confirmationUrl = appendTokenToUrl(baseUrl, token);
    const userLangOption = await this.getOption(userId, 'language');
    const userLang = userLangOption?.value;
    await this.mailService.sendAccountDeletionConfirmation(
      user.email,
      confirmationUrl,
      user.username,
      userLang,
    );

    return { message: this.i18n.t('user.success.deletionEmailSent') };
  }

  async checkNamespaceOwnershipConstraint(
    userId: string,
  ): Promise<NamespaceOwnershipCheck> {
    const namespaceMemberRepo = this.dataSource.getRepository(NamespaceMember);

    // Get all namespaces where user is an owner
    const ownerMemberships = await namespaceMemberRepo.find({
      where: { userId, role: NamespaceRole.OWNER },
    });

    const soloNamespaceIds: string[] = [];

    // For each owned namespace, check if there are other members
    for (const membership of ownerMemberships) {
      const membersCount = await namespaceMemberRepo.count({
        where: {
          namespaceId: membership.namespaceId,
        },
      });

      // If there are other members besides the owner (count > 1), block deletion
      if (membersCount > 1) {
        return { blocked: true, soloNamespaceIds: [] };
      } else if (membersCount === 1) {
        // User is sole member - namespace should be cleaned up
        soloNamespaceIds.push(membership.namespaceId);
      }
    }

    return { blocked: false, soloNamespaceIds };
  }

  async confirmAccountDeletion(token: string): Promise<void> {
    // 1. Retrieve and validate token
    const deletionState = await this.cacheService.get<AccountDeletionState>(
      this.deletionNamespace,
      token,
    );

    if (!deletionState) {
      const message = this.i18n.t('user.errors.invalidOrExpiredToken');
      throw new AppException(
        message,
        'INVALID_OR_EXPIRED_TOKEN',
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. Re-verify namespace constraint (in case it changed)
    const namespaceCheck = await this.checkNamespaceOwnershipConstraint(
      deletionState.userId,
    );
    if (namespaceCheck.blocked) {
      const message = this.i18n.t('user.errors.cannotDeleteOwnerWithMembers');
      throw new AppException(
        message,
        'CANNOT_DELETE_OWNER_WITH_MEMBERS',
        HttpStatus.FORBIDDEN,
      );
    }

    // 3. Execute cleanup in transaction
    await this.dataSource.transaction(async (manager) => {
      const shareRepo = manager.getRepository(Share);
      const apiKeyRepo = manager.getRepository(APIKey);
      const applicationsRepo = manager.getRepository(Applications);
      const taskRepo = manager.getRepository(Task);
      const invitationRepo = manager.getRepository(Invitation);
      const namespaceRepo = manager.getRepository(Namespace);
      const namespaceMemberRepo = manager.getRepository(NamespaceMember);

      // Disable all share links
      await shareRepo.update(
        { userId: deletionState.userId },
        { enabled: false },
      );

      // Soft delete API keys
      await apiKeyRepo.softDelete({ userId: deletionState.userId });

      // Soft delete applications
      await applicationsRepo.softDelete({ userId: deletionState.userId });

      // Soft delete user bindings (OAuth connections)
      await manager
        .getRepository(UserBinding)
        .softDelete({ userId: deletionState.userId });

      // Cancel pending tasks
      await taskRepo
        .createQueryBuilder()
        .update(Task)
        .set({ canceledAt: () => 'NOW()' })
        .where('userId = :userId', { userId: deletionState.userId })
        .andWhere('endedAt IS NULL')
        .andWhere('canceledAt IS NULL')
        .execute();

      // Clean up solo-owned namespaces
      for (const namespaceId of namespaceCheck.soloNamespaceIds) {
        // Soft delete all invitations for this namespace
        await invitationRepo.softDelete({ namespaceId });
        // Soft delete the namespace member record
        await namespaceMemberRepo.softDelete({
          namespaceId,
          userId: deletionState.userId,
        });
        // Soft delete the namespace itself
        await namespaceRepo.softDelete(namespaceId);
      }

      // Soft delete user's membership in all other namespaces (multi-member namespaces)
      await namespaceMemberRepo.softDelete({ userId: deletionState.userId });

      // Soft delete user
      await manager.getRepository(User).softDelete(deletionState.userId);
    });

    // 4. Clean up token from cache
    await this.cacheService.delete(this.deletionNamespace, token);
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

  async listOption(userId: string, entityManager?: EntityManager) {
    const repo = entityManager
      ? entityManager.getRepository(UserOption)
      : this.userOptionRepository;
    const optionList = await repo.findBy({
      userId,
    });
    return optionList;
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

  async isAutoTagEnabled(
    userId: string,
    entityManager?: EntityManager,
  ): Promise<boolean> {
    const option = await this.getOption(
      userId,
      'enable_ai_tag_extraction',
      entityManager,
    );
    if (!option) {
      return true; // Default: enabled
    }
    return option.value === 'true';
  }
}
