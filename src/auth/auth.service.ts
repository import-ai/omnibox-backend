import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { User } from 'omniboxd/user/entities/user.entity';
import { DataSource, EntityManager } from 'typeorm';
import { MailService } from 'omniboxd/mail/mail.service';
import { UserService } from 'omniboxd/user/user.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { CreateUserDto } from 'omniboxd/user/dto/create-user.dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { GroupsService } from 'omniboxd/groups/groups.service';
import { PermissionsService } from 'omniboxd/permissions/permissions.service';
import { InvitePayloadDto } from './dto/invite-payload.dto';
import { UserInvitationDto } from './dto/invitation.dto';
import { SignUpPayloadDto } from './dto/signup-payload.dto';
import { LoginPayloadDto } from './dto/login-payload.dto';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { isEmail } from 'class-validator';

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
  ) {}

  async verify(email: string, password: string): Promise<any> {
    const user = await this.userService.verify(email, password);
    if (!user) {
      if (isEmail(email)) {
        const userUseEmail = await this.userService.findByEmail(email);
        if (!userUseEmail) {
          throw new ForbiddenException(
            'No account found for the provided email. Please register first.',
          );
        }
      }
      throw new ForbiddenException('Wrong password, please check');
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
      }),
    };
  }

  private async getSignUpToken(email: string) {
    const account = await this.userService.findByEmail(email);
    if (account) {
      throw new BadRequestException(
        'The email is already registered. Please log in directly.',
      );
    }
    const payload: SignUpPayloadDto = { email };
    return this.jwtService.sign(payload, { expiresIn: '1h' });
  }

  async signUp(url: string, email: string, lang?: string) {
    const token: string = await this.getSignUpToken(email);
    const mailSendUri = `${url}?token=${token}`;
    await this.mailService.sendSignUpEmail(email, mailSendUri, lang);
  }

  async signUpConfirm(
    token: string,
    data: {
      username: string;
      password: string;
      lang?: string;
    },
  ) {
    const payload: SignUpPayloadDto = await this.jwtVerify(token);
    const account = await this.userService.findByEmail(payload.email);
    if (account) {
      throw new BadRequestException(
        'The email is already registered. Please log in directly.',
      );
    }
    if (data.username.length < 2 || data.username.length > 32) {
      throw new BadRequestException(
        'Username must be between 2 and 32 characters.',
      );
    }
    return await this.dataSource.transaction(async (manager) => {
      const user = await this.userService.create(
        {
          email: payload.email,
          username: data.username,
          password: data.password,
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
      throw new NotFoundException('User not found.');
    }
    const payload: LoginPayloadDto = { email: user.email!, sub: user.id };
    const token = this.jwtService.sign(payload, {
      expiresIn: '1h',
    });
    const mailSendUri = `${url}?token=${token}`;
    const lang = await this.userService.getOption(user.id, 'language');
    await this.mailService.sendPasswordEmail(
      user.email!,
      mailSendUri,
      lang?.value,
    );
    // return { url: mailSendUri };
  }

  async resetPassword(token: string, password: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userService.find(payload.sub);
      await this.userService.updatePassword(user.id, password);
    } catch (error) {
      this.logger.error({ error });
      throw new UnauthorizedException('Invalid or expired token.');
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
      const lang = await this.userService.getOption(account.id, 'language');
      await this.mailService.sendInviteEmail(
        email,
        `${data.inviteUrl}?user=${userId}&namespace=${data.namespaceId}&token=${token}`,
        lang?.value,
      );
      return;
    }
    const payload: SignUpPayloadDto = {
      email,
      invitation,
    };
    const token = this.jwtService.sign(payload, {
      expiresIn: '1h',
    });
    const mailSendUri = `${data.registerUrl}?user=${userId}&namespace=${data.namespaceId}&token=${token}`;
    const lang = await this.userService.getOption(userId, 'language');
    await this.mailService.sendInviteEmail(email, mailSendUri, lang?.value);
    // return { url: mailSendUri };
  }

  async inviteConfirm(token: string): Promise<void> {
    const payload: InvitePayloadDto = await this.jwtVerify(token);
    const user = await this.userService.find(payload.userId);
    await this.dataSource.transaction(async (manager) => {
      await this.handleUserInvitation(user.id, payload.invitation, manager);
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
      throw new UnauthorizedException('No token provided.');
    }
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      if (!this.knownErrors.some((cls) => error instanceof cls)) {
        this.logger.error({ error });
      }
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }
}

function getRootPermission(invitation: UserInvitationDto): ResourcePermission {
  if (invitation.groupId || invitation.resourceId) {
    return ResourcePermission.NO_ACCESS;
  }
  return invitation.permission || ResourcePermission.FULL_ACCESS;
}
