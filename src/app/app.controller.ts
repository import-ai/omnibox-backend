import { Controller, Get } from '@nestjs/common';
import { Public } from 'src/auth/decorators/public.decorator';

@Controller('api/v1/health')
export class AppController {
  @Public()
  @Get()
  healthCheck() {
    return '';
  }
}
