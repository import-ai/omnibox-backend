import { Controller, Get, Param, Res } from '@nestjs/common';
import { AttachmentsService } from 'src/resources/attachments/attachments.service';
import { Response } from 'express';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('api/v1/images/:attachmentId')
export class ImageAttachmentsController {
  constructor(private readonly attachmentsService: AttachmentsService) {}

  @Public()
  @Get()
  async downloadAttachment(
    @Res() res: Response,
    @Param('attachmentId') attachmentId: string,
  ) {
    return await this.attachmentsService.displayImage(attachmentId, res);
  }
}
