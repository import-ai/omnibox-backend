import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { User } from 'omniboxd/user/entities/user.entity';
import { DataSource, EntityManager } from 'typeorm';
import { MailService } from 'omniboxd/mail/mail.service';
import { UserService } from 'omniboxd/user/user.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { CreateUserDto } from 'omniboxd/user/dto/create-user.dto';
import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { GroupsService } from 'omniboxd/groups/groups.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { InvitePayloadDto } from './dto/invite-payload.dto';
import { UserInvitationDto } from './dto/invitation.dto';
import { SignUpPayloadDto } from './dto/signup-payload.dto';
import { LoginPayloadDto } from './dto/login-payload.dto';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { isEmail } from 'class-validator';
import { OtpService } from './otp.service';
import { SocialService } from './social.service';
import { SendEmailOtpResponseDto } from './dto/email-otp.dto';

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly knownErrors = [JsonWebTokenError, TokenExpiredError];

  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly namespaceService: NamespacesService,
    private readonly groupsService: GroupsService,
    private readonly permissionsService: PermissionsService,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly otpService: OtpService,
    private readonly socialService: SocialService,
  ) {}

  async verify(email: string, password: string): Promise<any> {
    const user = await this.userService.verify(email, password);
    if (!user) {
      if (isEmail(email)) {
        const userUseEmail = await this.userService.findByEmail(email);
        if (!userUseEmail) {
          const message = this.i18n.t('auth.errors.userNotFoundToSignUp');
          throw new AppException(
            message,
            'USER_NOT_FOUND',
            HttpStatus.NOT_FOUND,
          );
        }
      }
      const message = this.i18n.t('auth.errors.invalidCredentials');
      throw new AppException(
        message,
        'INVALID_CREDENTIALS',
        HttpStatus.FORBIDDEN,
      );
    }
    return {
      id: user.id,
      email: user.email,
      username: user.username,
    };
  }

  login(user: User) {
    return {
      id: user.id,
      access_token: this.jwtService.sign({
        sub: user.id,
        username: user.username,
      }),
    };
  }

  /**
   * Send OTP to email for login only
   * Does NOT send email if user doesn't exist
   */
  async sendOTP(
    email: string,
    baseUrl: string,
  ): Promise<SendEmailOtpResponseDto> {
    const account = await this.userService.findByEmail(email);
    const exists = !!account;

    // Don't send email for unregistered users (login only)
    if (!exists) {
      return { exists: false, sent: false };
    }

    // Generate OTP code and magic link token
    const { code, magicToken } = await this.otpService.generateOtp(email);

    // Build magic link URL
    const separator = baseUrl.includes('?') ? '&' : '?';
    const magicLink = `${baseUrl}${separator}token=${magicToken}`;

    // Send email with both code and link
    await this.mailService.sendOTPEmail(email, code, magicLink);

    return { exists: true, sent: true };
  }

  /**
   * Send OTP to email for signup only
   */
  async sendSignupOTP(
    email: string,
    baseUrl: string,
  ): Promise<SendEmailOtpResponseDto> {
    const account = await this.userService.findByEmail(email);

    if (account) {
      // User already exists, should login instead
      return { exists: true, sent: false };
    }

    // Generate OTP code and magic link token for new user
    const { code, magicToken } = await this.otpService.generateOtp(email);

    // Build magic link URL
    const separator = baseUrl.includes('?') ? '&' : '?';
    const magicLink = `${baseUrl}${separator}token=${magicToken}`;

    // Send email with both code and link
    await this.mailService.sendOTPEmail(email, code, magicLink);

    return { exists: false, sent: true };
  }

  /**
   * Verify OTP and complete registration or login
   */
  async verifyOTP(email: string, code: string, lang?: string) {
    // Verify the OTP code
    await this.otpService.verifyOtp(email, code);

    // Check if user already exists
    const existingUser = await this.userService.findByEmail(email);

    if (existingUser) {
      // User exists - login
      return {
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
      };
    }

    // User doesn't exist - register
    return await this.dataSource.transaction(async (manager) => {
      // Extract username from email (e.g., foo@example.com -> foo)
      const emailUsername = email.split('@')[0];

      // Generate valid username (handles conflicts)
      const username = await this.socialService.getValidUsername(
        emailUsername,
        manager,
      );

      // Generate a random password for OTP-registered users
      const randomPassword = Math.random().toString(36).slice(-12) + 'Aa1';

      // Create user with generated username and random password
      const user = await this.userService.create(
        {
          email,
          username,
          password: randomPassword,
          lang,
        },
        manager,
      );

      // Create user namespace
      await this.namespaceService.createUserNamespace(
        user.id,
        user.username,
        manager,
      );

      return {
        id: user.id,
        access_token: this.jwtService.sign({
          sub: user.id,
          username: user.username,
        }),
      };
    });
  }

  /**
   * Verify magic link token and complete registration or login
   */
  async verifyMagicLink(token: string, lang?: string) {
    // Verify the magic link token and get email
    const email = await this.otpService.verifyMagicToken(token);

    // Check if user already exists
    const existingUser = await this.userService.findByEmail(email);

    if (existingUser) {
      // User exists - login
      return {
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
      };
    }

    // User doesn't exist - register
    return await this.dataSource.transaction(async (manager) => {
      // Extract username from email
      const emailUsername = email.split('@')[0];

      // Generate valid username (handles conflicts)
      const username = await this.socialService.getValidUsername(
        emailUsername,
        manager,
      );

      // Generate a random password for OTP-registered users
      const randomPassword = Math.random().toString(36).slice(-12) + 'Aa1';

      // Create user
      const user = await this.userService.create(
        {
          email,
          username,
          password: randomPassword,
          lang,
        },
        manager,
      );

      // Create user namespace
      await this.namespaceService.createUserNamespace(
        user.id,
        user.username,
        manager,
      );

      return {
        id: user.id,
        access_token: this.jwtService.sign({
          sub: user.id,
          username: user.username,
        }),
      };
    });
  }

  private async getSignUpToken(email: string) {
    const account = await this.userService.findByEmail(email);
    if (account) {
      const message = this.i18n.t('auth.errors.emailAlreadyExists');
      throw new AppException(message, 'EMAIL_EXISTS', HttpStatus.BAD_REQUEST);
    }
    const payload: SignUpPayloadDto = { email };
    return this.jwtService.sign(payload, { expiresIn: '1h' });
  }

  async signUpConfirm(
    token: string,
    data: {
      username: string;
      password: string;
      lang?: string;
    },
  ) {
    const payload: SignUpPayloadDto = this.jwtVerify(token);
    const account = await this.userService.findByEmail(payload.email);
    if (account) {
      const message = this.i18n.t('auth.errors.emailAlreadyExists');
      throw new AppException(message, 'EMAIL_EXISTS', HttpStatus.BAD_REQUEST);
    }
    if (data.username.length < 2 || data.username.length > 32) {
      const message = this.i18n.t('auth.errors.usernameLength');
      throw new AppException(
        message,
        'INVALID_USERNAME_LENGTH',
        HttpStatus.BAD_REQUEST,
      );
    }
    return await this.dataSource.transaction(async (manager) => {
      const user = await this.userService.create(
        {
          email: payload.email,
          username: data.username,
          password: data.password,
          lang: data.lang,
        },
        manager,
      );
      await this.namespaceService.createUserNamespace(
        user.id,
        user.username,
        manager,
      );
      if (payload.invitation) {
        await this.handleUserInvitation(user.id, payload.invitation, manager);
      }
      return {
        id: user.id,
        access_token: this.jwtService.sign({
          sub: user.id,
        }),
      };
    });
  }

  async signUpWithoutConfirm(createUser: CreateUserDto) {
    const token: string = await this.getSignUpToken(createUser.email);
    return this.signUpConfirm(token, createUser);
  }

  async password(url: string, email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      const message = this.i18n.t('auth.errors.userNotFound');
      throw new AppException(message, 'USER_NOT_FOUND', HttpStatus.NOT_FOUND);
    }
    const payload: LoginPayloadDto = { email: user.email!, sub: user.id };
    const token = this.jwtService.sign(payload, {
      expiresIn: '1h',
    });
    const mailSendUri = `${url}?token=${token}`;
    await this.mailService.sendPasswordEmail(user.email!, mailSendUri);
    // return { url: mailSendUri };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userService.find(payload.sub);
      await this.userService.updatePassword(user.id, password);
    } catch (error) {
      this.logger.error({ error });
      const message = this.i18n.t('auth.errors.tokenInvalid');
      throw new AppException(message, 'INVALID_TOKEN', HttpStatus.UNAUTHORIZED);
    }
  }

  async invite(
    userId: string,
    email: string,
    data: {
      inviteUrl: string;
      registerUrl: string;
      namespaceId: string;
      role: NamespaceRole;
      resourceId?: string;
      permission?: ResourcePermission;
      groupId?: string;
    },
  ) {
    const invitation: UserInvitationDto = {
      namespaceId: data.namespaceId,
      namespaceRole: data.role,
      resourceId: data.resourceId,
      permission: data.permission,
      groupId: data.groupId,
    };
    const account = await this.userService.findByEmail(email);
    if (account) {
      const namespaceMembers = await this.namespaceService.listMembers(
        data.namespaceId,
      );
      const userInNamespace = namespaceMembers.find(
        (member) => `${member.userId}` === account.id,
      );
      if (userInNamespace) {
        // User already in namespace
        return;
      }
      const payload: InvitePayloadDto = {
        userId: account.id,
        invitation,
      };
      const token = this.jwtService.sign(payload, {
        expiresIn: '1h',
      });
      await this.mailService.sendInviteEmail(
        email,
        `${data.inviteUrl}?user=${userId}&namespace=${data.namespaceId}&token=${token}`,
      );
      return;
    }
    const payload: SignUpPayloadDto = {
      email,
      invitation,
    };
    const token = this.jwtService.sign(payload, {
      expiresIn: '7d',
    });
    const mailSendUri = `${data.registerUrl}?token=${token}`;
    await this.mailService.sendInviteEmail(email, mailSendUri);
  }

  async inviteConfirm(token: string): Promise<void> {
    const payload: InvitePayloadDto = this.jwtVerify(token);
    const user = await this.userService.find(payload.userId);
    await this.dataSource.transaction(async (manager) => {
      await this.handleUserInvitation(user.id, payload.invitation, manager);
    });
  }

  async acceptInvite(token: string, lang?: string) {
    // Verify and decode the JWT token
    const payload: SignUpPayloadDto = this.jwtVerify(token);

    if (!payload.email || !payload.invitation) {
      const message = this.i18n.t('auth.errors.tokenInvalid');
      throw new AppException(message, 'INVALID_TOKEN', HttpStatus.UNAUTHORIZED);
    }

    const { email, invitation } = payload;

    // Check if user already exists
    const existingUser = await this.userService.findByEmail(email);

    if (existingUser) {
      // User exists - just add to namespace
      await this.dataSource.transaction(async (manager) => {
        await this.handleUserInvitation(existingUser.id, invitation, manager);
      });

      return {
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
        namespaceId: invitation.namespaceId,
      };
    }

    // User doesn't exist - create account and add to namespace
    return await this.dataSource.transaction(async (manager) => {
      // Extract username from email (e.g., foo@example.com -> foo)
      const emailUsername = email.split('@')[0];

      // Generate valid username (handles conflicts)
      const username = await this.socialService.getValidUsername(
        emailUsername,
        manager,
      );

      // Generate a random password for invited users
      const randomPassword = Math.random().toString(36).slice(-12) + 'Aa1';

      // Create user with generated username and random password
      const user = await this.userService.create(
        {
          email,
          username,
          password: randomPassword,
          lang,
        },
        manager,
      );

      // Create user's personal namespace
      await this.namespaceService.createUserNamespace(
        user.id,
        user.username,
        manager,
      );

      // Add user to the invited namespace
      await this.handleUserInvitation(user.id, invitation, manager);

      return {
        id: user.id,
        access_token: this.jwtService.sign({
          sub: user.id,
          username: user.username,
        }),
        namespaceId: invitation.namespaceId,
      };
    });
  }

  async inviteGroup(
    namespaceId: string,
    resourceId: string,
    groupTitles: string[],
    permission: ResourcePermission,
  ): Promise<void> {
    const groups = await this.groupsService.getGroupsByTitles(
      namespaceId,
      groupTitles,
    );
    for (const group of groups) {
      await this.permissionsService.updateGroupPermission(
        namespaceId,
        resourceId,
        group.id,
        permission,
      );
    }
  }

  async handleUserInvitation(
    userId: string,
    invitation: UserInvitationDto,
    manager?: EntityManager,
  ) {
    if (!manager) {
      manager = this.dataSource.manager;
    }
    await this.namespaceService.addMember(
      invitation.namespaceId,
      userId,
      invitation.namespaceRole,
      getRootPermission(invitation),
      manager,
    );
    if (invitation.groupId) {
      await this.groupsService.addGroupUser(
        invitation.namespaceId,
        invitation.groupId,
        userId,
        manager,
      );
    }
    if (invitation.resourceId && invitation.permission) {
      await this.permissionsService.updateUserPermission(
        invitation.namespaceId,
        invitation.resourceId,
        userId,
        invitation.permission,
        manager,
      );
    }
  }

  jwtVerify(token: string) {
    if (!token) {
      const message = this.i18n.t('auth.errors.noToken');
      throw new AppException(message, 'NO_TOKEN', HttpStatus.UNAUTHORIZED);
    }
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      if (!this.knownErrors.some((cls) => error instanceof cls)) {
        this.logger.error({ error });
      }
      const message = this.i18n.t('auth.errors.tokenInvalid');
      throw new AppException(message, 'INVALID_TOKEN', HttpStatus.UNAUTHORIZED);
    }
  }
}

function getRootPermission(invitation: UserInvitationDto): ResourcePermission {
  if (invitation.groupId || invitation.resourceId) {
    return ResourcePermission.NO_ACCESS;
  }
  return invitation.permission || ResourcePermission.FULL_ACCESS;
}
