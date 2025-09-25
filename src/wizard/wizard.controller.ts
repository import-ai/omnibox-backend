import {
  Body,
  Controller,
  Post,
  Req,
  Sse,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import {
  CollectRequestDto,
  CollectZRequestDto,
} from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
import { AgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { RequestId } from 'omniboxd/decorators/request-id.decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { FileInterceptor } from '@nestjs/platform-express';

@Controller('api/v1/wizard')
export class WizardController {
  constructor(private readonly wizardService: WizardService) {}

  @Post('collect')
  async collect(
    @UserId() userId: string,
    @Body() data: CollectRequestDto,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.collect(userId, data);
  }

  @Post('collect/gzip')
  @UseInterceptors(FileInterceptor('html'))
  async collectGzip(
    @UserId() userId: string,
    @Body() data: CollectZRequestDto,
    @UploadedFile() compressedHtml: Express.Multer.File,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.compressedCollect(
      userId,
      data,
      compressedHtml,
    );
  }

  @Post('ask')
  @Sse()
  async ask(
    @Req() req,
    @RequestId() requestId: string,
    @Body() body: AgentRequestDto,
  ) {
    return await this.wizardService.streamService.agentStreamWrapper(
      req.user,
      body,
      requestId,
      'ask',
    );
  }

  @Post('write')
  @Sse()
  async write(
    @Req() req,
    @RequestId() requestId: string,
    @Body() body: AgentRequestDto,
  ) {
    return await this.wizardService.streamService.agentStreamWrapper(
      req.user,
      body,
      requestId,
      'write',
    );
  }

  @Post('*path')
  async proxy(@Req() req: Request): Promise<Record<string, any>> {
    return await this.wizardService.wizardApiService.proxy(req);
  }
}
