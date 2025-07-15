import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Invitation } from './entities/invitation.entity';
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { InvitationDto } from './dto/invitation.dto';
import { CreateInvitationReqDto } from './dto/create-invitation-req.dto';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { ResourcePermission } from 'src/permissions/resource-permission.enum';
import { AuthService } from 'src/auth/auth.service';
import { UserInvitationDto as AuthInvitationDto } from 'src/auth/dto/invitation.dto';
import { GroupsService } from '../groups/groups.service';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationsRepository: Repository<Invitation>,
    private readonly authService: AuthService,
    private readonly groupsService: GroupsService,
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
          rootPermissionLevel: invitation.rootPermission,
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
      rootPermissionLevel: invitation.rootPermission,
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
      throw new UnprocessableEntityException('Invitation already exists');
    }
    if (req.groupId) {
      req.namespaceRole = NamespaceRole.MEMBER;
      req.rootPermissionLevel = ResourcePermission.NO_ACCESS;
    }
    if (!req.namespaceRole || !req.rootPermissionLevel) {
      throw new UnprocessableEntityException(
        'Namespace role and root permission level are required',
      );
    }
    const invitation = await this.invitationsRepository.save(
      this.invitationsRepository.create({
        namespaceId,
        namespaceRole: req.namespaceRole,
        rootPermission: req.rootPermissionLevel,
        groupId: req.groupId,
      }),
    );
    const invitationDto: InvitationDto = {
      id: invitation.id,
      namespaceRole: invitation.namespaceRole,
      rootPermissionLevel: invitation.rootPermission,
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
      throw new UnprocessableEntityException('Invitation not found');
    }
    const invitationDto: AuthInvitationDto = {
      namespaceId,
      namespaceRole: invitation.namespaceRole,
      permissionLevel: invitation.rootPermission,
      groupId: invitation.groupId,
    };
    await this.authService.handleUserInvitation(userId, invitationDto);
  }
}
