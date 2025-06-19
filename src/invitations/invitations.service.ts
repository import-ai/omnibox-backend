import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Invitation } from './entities/invitation.entity';
import { Repository } from 'typeorm';
import { InvitationDto, ListRespDto } from './dto/list-resp.dto';
import { CreateInvitationReqDto } from './dto/create-invitation-req.dto';

@Injectable()
export class InvitationsService {
  constructor(
    @InjectRepository(Invitation)
    private readonly invitationsRepository: Repository<Invitation>,
  ) {}

  async listInvitations(namespaceId: string): Promise<ListRespDto> {
    const invitations = await this.invitationsRepository.find({
      where: {
        namespace: { id: namespaceId },
      },
      relations: ['group'],
    });
    const resp = new ListRespDto();
    for (const invitation of invitations) {
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
      resp.invitations.push(invitationDto);
    }
    return resp;
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

  async deleteInvitation(invitationId: string): Promise<void> {
    await this.invitationsRepository.delete(invitationId);
  }
}
