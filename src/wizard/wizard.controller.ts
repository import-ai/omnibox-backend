import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  Sse,
  UploadedFile,
  UseInterceptors,
  ValidationPipe,
  HttpStatus,
} from '@nestjs/common';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import {
  CollectRequestDto,
  CompressedCollectRequestDto,
} from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
import {
  CollectUrlRequestDto,
  CollectUrlResponseDto,
} from 'omniboxd/wizard/dto/collect-url-request.dto';
import { AgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { RequestId } from 'omniboxd/decorators/request-id.decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { FileInterceptor } from '@nestjs/platform-express';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { CookieAuth } from 'omniboxd/auth';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { Share } from 'omniboxd/shares/entities/share.entity';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';

@Controller('api/v1/wizard')
export class CollectController {
  constructor(private readonly wizardService: WizardService) {}

  @Post('collect')
  async collect(
    @UserId() userId: string,
    @Body() data: CollectRequestDto,
    @Body('namespace_id', new ValidationPipe()) namespaceId: string,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.collect(namespaceId, userId, data);
  }

  @Post('collect/gzip')
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
    private readonly i18n: I18nService,
  ) {}

  @Post('collect')
  async collect(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Body() data: CollectRequestDto,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.collect(namespaceId, userId, data);
  }

  @Post('collect/gzip')
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
    return await this.wizardService.streamService.createUserAgentStream(
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
    return await this.wizardService.streamService.createUserAgentStream(
      userId,
      namespaceId,
      body,
      requestId,
      'write',
    );
  }

  @Post('collect_url')
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

  @Post('*path')
  async proxy(@Req() req: Request): Promise<Record<string, any>> {
    return await this.wizardService.wizardApiService.proxy(req);
  }
}

@Controller('api/v1/shares/:shareId/wizard')
@UseInterceptors(ValidateShareInterceptor)
export class SharedWizardController {
  constructor(private readonly wizardService: WizardService) {}

  @Post('ask')
  @Sse()
  @CookieAuth({ onAuthFail: 'continue' })
  @ValidateShare()
  async ask(
    @ValidatedShare() share: Share,
    @RequestId() requestId: string,
    @Body() body: AgentRequestDto,
  ) {
    return await this.wizardService.streamService.createShareAgentStream(
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
    return await this.wizardService.streamService.createShareAgentStream(
      share,
      body,
      requestId,
      'write',
    );
  }
}
