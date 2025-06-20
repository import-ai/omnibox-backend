import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Invitation } from './entities/invitation.entity';
import { FindOptionsWhere, IsNull, Not, Repository } from 'typeorm';
import { InvitationDto } from './dto/invitation.dto';
import { CreateInvitationReqDto } from './dto/create-invitation-req.dto';
import { NamespaceRole } from 'src/namespaces/entities/namespace-member.entity';
import { PermissionLevel } from 'src/permissions/permission-level.enum';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationsRepository: Repository<Invitation>,
  ) {}

  async listInvitations(
    namespaceId: string,
    type?: string,
  ): Promise<InvitationDto[]> {
    const where: FindOptionsWhere<Invitation> = {
      namespace: { id: namespaceId },
    };
    if (type === 'group') {
      where.group = Not(IsNull());
    } else if (type === 'namespace') {
      where.group = IsNull();
    }
    const invitations = await this.invitationsRepository.find({
      where,
      relations: ['group'],
    });
    return invitations.map((invitation) => {
      const invitationDto: InvitationDto = {
        id: invitation.id,
        namespaceRole: invitation.namespaceRole,
        rootPermissionLevel: invitation.rootPermissionLevel,
      };
      if (invitation.group) {
        invitationDto.group = {
          id: invitation.group.id,
          namespaceId,
          title: invitation.group.title,
        };
      }
      return invitationDto;
    });
  }

  async getInvitation(
    namespaceId: string,
    groupId?: string,
  ): Promise<InvitationDto | null> {
    const invitation = await this.invitationsRepository.findOne({
      where: {
        namespace: { id: namespaceId },
        group: groupId ? { id: groupId } : undefined,
      },
      relations: ['group'],
    });
    if (!invitation) {
      return null;
    }
    const invitationDto: InvitationDto = {
      id: invitation.id,
      namespaceRole: invitation.namespaceRole,
      rootPermissionLevel: invitation.rootPermissionLevel,
    };
    if (invitation.group) {
      invitationDto.group = {
        id: invitation.group.id,
        namespaceId,
        title: invitation.group.title,
      };
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
      req.rootPermissionLevel = PermissionLevel.NO_ACCESS;
    }
    if (!req.namespaceRole || !req.rootPermissionLevel) {
      throw new UnprocessableEntityException(
        'Namespace role and root permission level are required',
      );
    }
    const invitation = await this.invitationsRepository.save(
      this.invitationsRepository.create({
        namespace: { id: namespaceId },
        namespaceRole: req.namespaceRole,
        rootPermissionLevel: req.rootPermissionLevel,
        group: req.groupId ? { id: req.groupId } : null,
      }),
    );
    const invitationDto: InvitationDto = {
      id: invitation.id,
      namespaceRole: invitation.namespaceRole,
      rootPermissionLevel: invitation.rootPermissionLevel,
    };
    return invitationDto;
  }

  async deleteInvitation(
    namespaceId: string,
    invitationId: string,
  ): Promise<void> {
    await this.invitationsRepository.delete({
      id: invitationId,
      namespace: { id: namespaceId },
    });
  }
}
