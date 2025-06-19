import { Controller, Get, Post } from '@nestjs/common';
import { InvitationsService } from './invitations.service';

@Controller('api/v1/namespaces/:namespaceId')
export class InvitationsController {
  constructor(private readonly invitationsService: InvitationsService) {}

  @Get('invitation_links')
  async listInvitationLinks() {}

  @Post('invitation_links')
  async createInvitationLink() {}
}
