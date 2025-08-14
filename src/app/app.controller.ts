import { Controller, Get } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import * as process from 'node:process';

@Controller('api/v1/health')
export class AppController {
  @Public()
  @Get()
  healthCheck() {
    return { uptime: process.uptime() };
  }
}
