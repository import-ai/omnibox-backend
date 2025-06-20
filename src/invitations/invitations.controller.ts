import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { InvitationsService } from './invitations.service';
import { CreateInvitationReqDto } from './dto/create-invitation-req.dto';

@Controller('api/v1/namespaces/:namespaceId')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get('invitations')
  async listInvitations(
    @Param('namespaceId') namespaceId: string,
    @Query('type') type: string,
  ) {
    return await this.invitationsService.listInvitations(namespaceId);
  }

  @Post('invitations')
  async createInvitation(
    @Param('namespaceId') namespaceId: string,
    @Body() req: CreateInvitationReqDto,
  ) {
    return await this.invitationsService.createInvitation(namespaceId, req);
  }

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
}
