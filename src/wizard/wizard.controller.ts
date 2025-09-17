import {
  Body,
  Controller,
  Param,
  Post,
  Req,
  Sse,
  UseInterceptors,
} from '@nestjs/common';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { CollectRequestDto } from 'omniboxd/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omniboxd/wizard/dto/collect-response.dto';
import { AgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { RequestId } from 'omniboxd/decorators/request-id.decorators';
import { UserId } from 'omniboxd/decorators/user-id.decorator';
import { ValidateShareInterceptor } from 'omniboxd/interceptor/validate-share.interceptor';
import { CookieAuth } from 'omniboxd/auth';
import {
  ValidatedShare,
  ValidateShare,
} from 'omniboxd/decorators/validate-share.decorator';
import { Share } from 'omniboxd/shares/entities/share.entity';

@Controller('api/v1/namespaces/:namespaceId/wizard')
export class WizardController {
  constructor(private readonly wizardService: WizardService) {}

  @Post('collect')
  async collect(
    @Param('namespaceId') namespaceId: string,
    @UserId() userId: string,
    @Body() data: CollectRequestDto,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.collect(namespaceId, userId, data);
  }

  @Post('ask')
  @Sse()
  async ask(
    @Param('namespaceId') namespaceId: string,
    @Req() req,
    @RequestId() requestId: string,
    @Body() body: AgentRequestDto,
  ) {
    return await this.wizardService.streamService.createUserAgentStream(
      namespaceId,
      req.user,
      body,
      requestId,
      'ask',
    );
  }

  @Post('write')
  @Sse()
  async write(
    @Param('namespaceId') namespaceId: string,
    @Req() req,
    @RequestId() requestId: string,
    @Body() body: AgentRequestDto,
  ) {
    return await this.wizardService.streamService.createUserAgentStream(
      namespaceId,
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
}
