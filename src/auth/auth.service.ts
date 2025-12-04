import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { User } from 'omniboxd/user/entities/user.entity';
import { DataSource } from 'typeorm';
import { MailService } from 'omniboxd/mail/mail.service';
import { UserService } from 'omniboxd/user/user.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { CreateUserDto } from 'omniboxd/user/dto/create-user.dto';
import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { GroupsService } from 'omniboxd/groups/groups.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { InvitePayloadDto } from './dto/invite-payload.dto';
import { UserInvitationDto } from './dto/invitation.dto';
import { SignUpPayloadDto } from './dto/signup-payload.dto';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { isEmail } from 'class-validator';
import { OtpService } from './otp.service';
import { SocialService } from './social.service';
import { SendEmailOtpResponseDto } from './dto/email-otp.dto';
import { appendQueryParams, appendTokenToUrl } from 'omniboxd/utils/url-utils';
import { Transaction, transaction } from 'omniboxd/utils/transaction-utils';

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
    const magicLink = appendTokenToUrl(baseUrl, magicToken);

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
    const magicLink = appendTokenToUrl(baseUrl, magicToken);

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
    return this.handleAuthenticationOrRegistration(email, lang);
  }

  /**
   * Verify magic link token and complete registration or login
   */
  async verifyMagicLink(token: string, lang?: string) {
    // Verify the magic link token and get email
    const email = await this.otpService.verifyMagicToken(token);
    return this.handleAuthenticationOrRegistration(email, lang);
  }

  /**
   * Handle authentication for existing users or registration for new users
   * Used by both OTP and magic link authentication flows
   */
  private async handleAuthenticationOrRegistration(
    email: string,
    lang?: string,
  ) {
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
    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;

      // Extract username from email
      const emailUsername = email.split('@')[0];

      // Generate valid username (handles conflicts)
      const username = await this.socialService.getValidUsername(
        emailUsername,
        manager,
      );

      // Create user with empty password
      const user = await this.userService.create(
        {
          email,
          username,
          password: '',
          lang,
        },
        manager,
      );

      // Create user namespace
      await this.namespaceService.createUserNamespace(
        user.id,
        user.username,
        tx,
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
    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;

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
        tx,
      );
      if (payload.invitation) {
        await this.handleUserInvitation(user.id, payload.invitation, tx);
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

    // Fetch sender and namespace information
    const senders = await this.userService.findByIds([userId]);
    const sender = senders[0];
    const namespace = await this.namespaceService.getNamespace(
      data.namespaceId,
    );

    if (!sender || !namespace) {
      this.logger.error(
        `Failed to fetch sender or namespace: sender=${!!sender}, namespace=${!!namespace}`,
      );
      throw new AppException(
        'Failed to fetch sender or namespace information',
        'INVITE_INFO_FETCH_FAILED',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const senderUsername = sender.username;
    const namespaceName = namespace.name;

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

      // Get receiver's language preference
      const receiverLangOption = await this.userService.getOption(
        account.id,
        'language',
      );
      const receiverLang = receiverLangOption?.value;

      const inviteUrl = appendQueryParams(data.inviteUrl, {
        user: userId,
        namespace: data.namespaceId,
        token,
      });
      await this.mailService.sendInviteEmail(
        email,
        inviteUrl,
        senderUsername,
        namespaceName,
        account.username,
        true,
        receiverLang,
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
    const mailSendUri = appendTokenToUrl(data.registerUrl, token);
    await this.mailService.sendInviteEmail(
      email,
      mailSendUri,
      senderUsername,
      namespaceName,
      undefined,
      false,
    );
  }

  async inviteConfirm(token: string, currentUserId: string): Promise<void> {
    const payload: InvitePayloadDto = this.jwtVerify(token);

    // Validate that the logged-in user matches the invited user
    if (payload.userId !== currentUserId) {
      const invitedUser = await this.userService.find(payload.userId);
      const message = this.i18n.t('auth.errors.inviteUserMismatch', {
        args: { username: invitedUser.username },
      });
      throw new AppException(
        message,
        'INVITE_USER_MISMATCH',
        HttpStatus.FORBIDDEN,
      );
    }

    const user = await this.userService.find(payload.userId);
    await transaction(this.dataSource.manager, async (tx) => {
      await this.handleUserInvitation(user.id, payload.invitation, tx);
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
      await transaction(this.dataSource.manager, async (tx) => {
        await this.handleUserInvitation(existingUser.id, invitation, tx);
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
    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;

      // Extract username from email (e.g., foo@example.com -> foo)
      const emailUsername = email.split('@')[0];

      // Generate valid username (handles conflicts)
      const username = await this.socialService.getValidUsername(
        emailUsername,
        manager,
      );

      // Create user with empty password (invited users)
      const user = await this.userService.create(
        {
          email,
          username,
          password: '',
          lang,
        },
        manager,
      );

      // Create user's personal namespace
      await this.namespaceService.createUserNamespace(
        user.id,
        user.username,
        tx,
      );

      // Add user to the invited namespace
      await this.handleUserInvitation(user.id, invitation, tx);

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
    tx?: Transaction,
  ) {
    if (!tx) {
      return await transaction(this.dataSource.manager, (tx) =>
        this.handleUserInvitation(userId, invitation, tx),
      );
    }

    const manager = tx.entityManager;

    await this.namespaceService.addMember(
      invitation.namespaceId,
      userId,
      invitation.namespaceRole,
      getRootPermission(invitation),
      tx,
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
