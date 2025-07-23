import { Body, Controller, Post, Req, Sse } from '@nestjs/common';
import { WizardService } from 'omnibox-backend/wizard/wizard.service';
import { CollectRequestDto } from 'omnibox-backend/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'omnibox-backend/wizard/dto/collect-response.dto';
import { AgentRequestDto } from 'omnibox-backend/wizard/dto/agent-request.dto';
import { RequestId } from 'omnibox-backend/decorators/request-id.decorators';

@Controller('api/v1/wizard')
export class WizardController {
  constructor(private readonly wizardService: WizardService) {}

  @Post('collect')
  async collect(
    @Req() req,
    @Body() data: CollectRequestDto,
  ): Promise<CollectResponseDto> {
    return await this.wizardService.collect(req.user, data);
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

  @Post('*')
  async proxy(@Req() req: Request): Promise<Record<string, any>> {
    return await this.wizardService.wizardApiService.proxy(req);
  }
}
