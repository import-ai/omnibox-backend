import { Injectable, HttpStatus } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Invitation } from './entities/invitation.entity';
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { InvitationDto } from './dto/invitation.dto';
import { CreateInvitationReqDto } from './dto/create-invitation-req.dto';
import { NamespaceRole } from 'omniboxd/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'omniboxd/permissions/resource-permission.enum';
import { AuthService } from 'omniboxd/auth/auth.service';
import { UserInvitationDto as AuthInvitationDto } from 'omniboxd/auth/dto/invitation.dto';
import { GroupsService } from '../groups/groups.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationsRepository: Repository<Invitation>,
    private readonly authService: AuthService,
    private readonly groupsService: GroupsService,
    private readonly i18n: I18nService,
  ) {}

  async listInvitations(
    namespaceId: string,
    type?: string,
  ): Promise<InvitationDto[]> {
    const where: FindOptionsWhere<Invitation> = {
      namespaceId,
    };
    if (type === 'group') {
      where.groupId = Not(IsNull());
    } else if (type === 'namespace') {
      where.groupId = IsNull();
    }
    const invitations = await this.invitationsRepository.find({
      where,
    });
    return Promise.all(
      invitations.map(async (invitation) => {
        const invitationDto: InvitationDto = {
          id: invitation.id,
          namespaceRole: invitation.namespaceRole,
          rootPermission: invitation.rootPermission,
        };
        if (invitation.groupId) {
          const group = await this.groupsService.get(invitation.groupId);
          if (group) {
            invitationDto.group = {
              id: group.id,
              namespaceId,
              title: group.title,
            };
          }
        }
        return invitationDto;
      }),
    );
  }

  async getInvitation(
    namespaceId: string,
    groupId?: string,
  ): Promise<InvitationDto | null> {
    const invitation = await this.invitationsRepository.findOne({
      where: {
        namespaceId,
        groupId: groupId || IsNull(),
      },
    });
    if (!invitation) {
      return null;
    }
    const invitationDto: InvitationDto = {
      id: invitation.id,
      namespaceRole: invitation.namespaceRole,
      rootPermission: invitation.rootPermission,
    };
    if (invitation.groupId) {
      const group = await this.groupsService.get(invitation.groupId);
      if (group) {
        invitationDto.group = {
          id: group.id,
          namespaceId,
          title: group.title,
        };
      }
    }
    return invitationDto;
  }

  async createInvitation(
    namespaceId: string,
    req: CreateInvitationReqDto,
  ): Promise<InvitationDto> {
    if (await this.getInvitation(namespaceId, req.groupId)) {
      const message = this.i18n.t('invitation.errors.invitationAlreadyExists');
      throw new AppException(
        message,
        'INVITATION_ALREADY_EXISTS',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    if (req.groupId) {
      req.namespaceRole = NamespaceRole.MEMBER;
      req.rootPermission = ResourcePermission.NO_ACCESS;
    }
    if (!req.namespaceRole || !req.rootPermission) {
      const message = this.i18n.t(
        'invitation.errors.roleAndPermissionRequired',
      );
      throw new AppException(
        message,
        'ROLE_PERMISSION_REQUIRED',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const invitation = await this.invitationsRepository.save(
      this.invitationsRepository.create({
        namespaceId,
        namespaceRole: req.namespaceRole,
        rootPermission: req.rootPermission,
        groupId: req.groupId,
      }),
    );
    const invitationDto: InvitationDto = {
      id: invitation.id,
      namespaceRole: invitation.namespaceRole,
      rootPermission: invitation.rootPermission,
    };
    return invitationDto;
  }

  async deleteInvitation(
    namespaceId: string,
    invitationId: string,
  ): Promise<void> {
    await this.invitationsRepository.delete({
      id: invitationId,
      namespaceId,
    });
  }

  async acceptInvitation(
    userId: string,
    namespaceId: string,
    invitationId: string,
  ) {
    const invitation = await this.invitationsRepository.findOne({
      where: {
        id: invitationId,
        namespaceId,
      },
    });
    if (!invitation) {
      const message = this.i18n.t('invitation.errors.invitationNotFound');
      throw new AppException(
        message,
        'INVITATION_NOT_FOUND',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    // Validate namespace is still active before processing
    await this.authService.validateNamespaceHasMembers(namespaceId);

    const invitationDto: AuthInvitationDto = {
      namespaceId,
      namespaceRole: invitation.namespaceRole,
      permission: invitation.rootPermission,
      groupId: invitation.groupId,
    };
    await this.authService.handleUserInvitation(userId, invitationDto);
  }
}
