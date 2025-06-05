import { Body, Controller, Post, Req, Sse } from '@nestjs/common';
import { WizardService } from 'src/wizard/wizard.service';
import { CollectRequestDto } from 'src/wizard/dto/collect-request.dto';
import { CollectResponseDto } from 'src/wizard/dto/collect-response.dto';
import { AgentRequestDto } from 'src/wizard/dto/agent-request.dto';

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

  @Post('chat/stream')
  @Sse()
  chat(@Body() body: Record<string, any>) {
    return this.wizardService.streamService.chatStream(body);
  }

  @Post('ask')
  @Sse()
  async ask(@Req() req, @Body() body: AgentRequestDto) {
    return await this.wizardService.streamService.agentStreamWrapper(
      req.user,
      body,
    );
  }

  @Post('*')
  async proxy(@Req() req: Request): Promise<Record<string, any>> {
    return await this.wizardService.wizardApiService.proxy(req);
  }
}
