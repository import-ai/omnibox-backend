import {
  Body,
  Controller,
  HttpStatus,
  Param,
  Post,
  Sse,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { I18nService } from 'nestjs-i18n';
import { CookieAuth } from 'omniboxd/auth';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { RequestId } from 'omniboxd/decorators/request-id.decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { CheckNamespaceReadonly } from 'omniboxd/namespaces/decorators/check-storage-quota.decorator';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { AgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { CompressedCollectRequestDto } from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
import {
  CollectUrlRequestDto,
  CollectUrlResponseDto,
} from 'omniboxd/wizard/dto/collect-url-request.dto';
import { StreamService } from 'omniboxd/wizard/stream.service';
import { WizardService } from 'omniboxd/wizard/wizard.service';

@Controller('api/v1/wizard')
export class CollectController {
  constructor(private readonly wizardService: WizardService) {}

  @Post('collect/gzip')
  @CheckNamespaceReadonly()
  @UseInterceptors(FileInterceptor('html'))
  async collectGzip(
    @UserId() userId: string,
    @Body() data: CompressedCollectRequestDto,
    @Body('namespace_id', new ValidationPipe()) namespaceId: string,
    @UploadedFile() zHtml: Express.Multer.File,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.compressedCollect(
      namespaceId,
      userId,
      data,
      zHtml,
    );
  }
}

@Controller('api/v1/namespaces/:namespaceId/wizard')
export class WizardController {
  constructor(
    private readonly wizardService: WizardService,
    private readonly streamService: StreamService,
    private readonly i18n: I18nService,
  ) {}

  @Post('collect/gzip')
  @CheckNamespaceReadonly()
  @UseInterceptors(FileInterceptor('html'))
  async collectGzip(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Body() data: CompressedCollectRequestDto,
    @UploadedFile() compressedHtml: Express.Multer.File,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.compressedCollect(
      namespaceId,
      userId,
      data,
      compressedHtml,
    );
  }

  @Post('ask')
  @Sse()
  async ask(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @RequestId() requestId: string,
    @Body() body: AgentRequestDto,
  ) {
    return await this.streamService.createUserAgentStream(
      userId,
      namespaceId,
      body,
      requestId,
      'ask',
    );
  }

  @Post('write')
  @Sse()
  async write(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @RequestId() requestId: string,
    @Body() body: AgentRequestDto,
  ) {
    return await this.streamService.createUserAgentStream(
      userId,
      namespaceId,
      body,
      requestId,
      'write',
    );
  }

  @Post('stream/resume')
  @Sse()
  resume(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body('conversation_id', new ValidationPipe()) conversationId: string,
  ) {
    return this.streamService.resumeUserAgentStream(
      userId,
      namespaceId,
      conversationId,
    );
  }

  @Post('stream/cancel')
  async cancel(
    @UserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body('conversation_id', new ValidationPipe()) conversationId: string,
  ) {
    await this.streamService.cancelUserAgentStream(
      userId,
      namespaceId,
      conversationId,
    );
    return { success: true };
  }

  @Post('collect/url')
  @CheckNamespaceReadonly()
  async collectUrl(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Body() data: CollectUrlRequestDto,
  ): Promise<CollectUrlResponseDto> {
    if (!namespaceId || !data.parentId || !data.url) {
      const message = this.i18n.t('wizard.errors.missingRequiredFields');
      throw new AppException(
        message,
        'MISSING_REQUIRED_FIELDS',
        HttpStatus.BAD_REQUEST,
      );
    }
    return await this.wizardService.collectUrl(
      namespaceId,
      userId,
      data.url,
      data.parentId,
    );
  }
}

@Controller('api/v1/shares/:shareId/wizard')
@UseInterceptors(ValidateShareInterceptor)
export class SharedWizardController {
  constructor(private readonly streamService: StreamService) {}

  @Post('ask')
  @Sse()
  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  async ask(
    @ValidatedShare() share: Share,
    @RequestId() requestId: string,
    @Body() body: AgentRequestDto,
  ) {
    return await this.streamService.createShareAgentStream(
      share,
      body,
      requestId,
      'ask',
    );
  }

  @Post('write')
  @Sse()
  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  async write(
    @ValidatedShare() share: Share,
    @RequestId() requestId: string,
    @Body() body: AgentRequestDto,
  ) {
    return await this.streamService.createShareAgentStream(
      share,
      body,
      requestId,
      'write',
    );
  }

  @Post('stream/resume')
  @Sse()
  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  resume(
    @ValidatedShare() share: Share,
    @Body('conversation_id', new ValidationPipe()) conversationId: string,
  ) {
    return this.streamService.resumeShareAgentStream(share, conversationId);
  }

  @Post('stream/cancel')
  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  async cancel(
    @ValidatedShare() share: Share,
    @Body('conversation_id', new ValidationPipe()) conversationId: string,
  ) {
    await this.streamService.cancelShareAgentStream(share, conversationId);
    return { success: true };
  }
}
