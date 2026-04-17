import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { CreateInvitationReqDto } from './dto/create-invitation-req.dto';
import { NamespaceAdmin } from 'omniboxd/namespaces/decorators/namespace-admin.decorator';

@Controller('api/v1/namespaces/:namespaceId')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @NamespaceAdmin()
  @Get('invitations')
  async listInvitations(
    @Param('namespaceId') namespaceId: string,
    @Query('type') type?: string,
  ) {
    return await this.invitationsService.listInvitations(namespaceId, type);
  }

  @NamespaceAdmin()
  @Post('invitations')
  async createInvitation(
    @Param('namespaceId') namespaceId: string,
    @Body() req: CreateInvitationReqDto,
  ) {
    return await this.invitationsService.createInvitation(namespaceId, req);
  }

  @NamespaceAdmin()
  @Delete('invitations/:invitationId')
  async deleteInvitation(
    @Param('namespaceId') namespaceId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return await this.invitationsService.deleteInvitation(
      namespaceId,
      invitationId,
    );
  }

  @Post('invitations/:invitationId/accept')
  async acceptInvitation(
    @Req() req: any,
    @Param('namespaceId') namespaceId: string,
    @Param('invitationId') invitationId: string,
  ) {
    return await this.invitationsService.acceptInvitation(
      req.user.id,
      namespaceId,
      invitationId,
    );
  }
}
