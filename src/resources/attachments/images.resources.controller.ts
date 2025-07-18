import { Controller, Get, Param, Res } from '@nestjs/common';
import { ResourceAttachmentsService } from 'src/resources/attachments/attachments.resources.service';
import { Response } from 'express';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller(':namespaceId/:resourceId/:attachmentId')
export class ResourceImagesController {
  constructor(
    private readonly resourceAttachmentsService: ResourceAttachmentsService,
  ) {}

  @Public()
  @Get()
  async downloadAttachment(
    @Res() res: Response,
    @Param('namespaceId') namespaceId: string,
    @Param('resourceId') resourceId: string,
    @Param('attachmentId') attachmentId: string,
  ) {
    return await this.resourceAttachmentsService.displayImage(
      namespaceId,
      resourceId,
      attachmentId,
      res,
    );
  }
}
