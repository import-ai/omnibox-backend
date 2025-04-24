import { Body, Controller, Post, Req } from '@nestjs/common';
import { WizardService } from 'src/wizard/wizard.service';
import { CollectRequestDto } from 'src/wizard/dto/collect-request.dto';

@Controller('api/v1/wizard')
export class WizardController {
  constructor(private readonly wizardService: WizardService) {}

  @Post('collect')
  async collect(@Req() req, @Body() data: CollectRequestDto) {
    return await this.wizardService.collect(req.user, data);
  }
}
