import { JwtService } from '@nestjs/jwt';
import { User } from 'src/user/entities/user.entity';
import { DataSource, EntityManager } from 'typeorm';
import { MailService } from 'src/mail/mail.service';
import { UserService } from 'src/user/user.service';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ResourcePermission } from 'src/permissions/resource-permission.enum';
import { GroupsService } from 'src/groups/groups.service';
import { PermissionsService } from 'src/permissions/permissions.service';
import { InvitePayloadDto } from './dto/invite-payload.dto';
import { UserInvitationDto } from './dto/invitation.dto';
import { SignUpPayloadDto } from './dto/signup-payload.dto';
import { LoginPayloadDto } from './dto/login-payload.dto';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';

@Injectable()
export class AuthService {
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
      throw new ForbiddenException(
        'No account found for the provided email. Please register first.',
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

  async signUp(url: string, email: string) {
    const token: string = await this.getSignUpToken(email);
    const mailSendUri = `${url}?token=${token}`;
    await this.mailService.sendSignUpEmail(email, mailSendUri);
  }

  async signUpConfirm(
    token: string,
    data: {
      username: string;
      password: string;
      password_repeat: string;
    },
  ) {
    const payload: SignUpPayloadDto = await this.jwtVerify(token);
    const account = await this.userService.findByEmail(payload.email);
    if (account) {
      throw new BadRequestException(
        'The email is already registered. Please log in directly.',
      );
    }
    return await this.dataSource.transaction(async (manager) => {
      const user = await this.userService.create(
        {
          email: payload.email,
          username: data.username,
          password: data.password,
          password_repeat: data.password_repeat,
        },
        manager,
      );
      await this.namespaceService.createAndJoinNamespace(
        user.id,
        `${user.username}'s Namespace`,
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
    await this.mailService.sendPasswordEmail(user.email!, mailSendUri);
    // return { url: mailSendUri };
  }

  async resetPassword(
    token: string,
    password: string,
    password_repeat: string,
  ): Promise<void> {
    if (password !== password_repeat) {
      throw new BadRequestException('The passwords entered do not match.');
    }
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userService.find(payload.sub);
      if (!user) {
        throw new NotFoundException('User not found.');
      }
      await this.userService.updatePassword(user.id, password);
    } catch (e) {
      console.error(e);
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }

  async invite(
    user_id: string,
    email: string,
    data: {
      inviteUrl: string;
      registerUrl: string;
      namespaceId: string;
      role: NamespaceRole;
      resourceId?: string;
      permissionLevel?: ResourcePermission;
      groupId?: string;
    },
  ) {
    const invitation: UserInvitationDto = {
      namespaceId: data.namespaceId,
      namespaceRole: data.role,
      resourceId: data.resourceId,
      permissionLevel: data.permissionLevel,
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
        `${data.inviteUrl}?user=${user_id}&namespace=${data.namespaceId}&token=${token}`,
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
    const mailSendUri = `${data.registerUrl}?user=${user_id}&namespace=${data.namespaceId}&token=${token}`;
    await this.mailService.sendInviteEmail(email, mailSendUri);
    // return { url: mailSendUri };
  }

  async inviteConfirm(token: string): Promise<void> {
    const payload: InvitePayloadDto = await this.jwtVerify(token);
    const user = await this.userService.find(payload.userId);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    await this.dataSource.transaction(async (manager) => {
      await this.handleUserInvitation(user.id, payload.invitation, manager);
    });
  }

  async inviteGroup(
    namespaceId: string,
    resourceId: string,
    groupTitles: string[],
    permissionLevel: ResourcePermission,
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
        permissionLevel,
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
      getRootPermissionLevel(invitation),
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
    if (invitation.resourceId && invitation.permissionLevel) {
      await this.permissionsService.updateUserPermission(
        invitation.namespaceId,
        invitation.resourceId,
        userId,
        invitation.permissionLevel,
        manager,
      );
    }
  }

  jwtVerify(token: string) {
    try {
      return this.jwtService.verify(token);
    } catch (e) {
      console.error(e);
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }
}

function getRootPermissionLevel(
  invitation: UserInvitationDto,
): ResourcePermission {
  if (invitation.groupId || invitation.resourceId) {
    return ResourcePermission.NO_ACCESS;
  }
  return invitation.permissionLevel || ResourcePermission.FULL_ACCESS;
}
