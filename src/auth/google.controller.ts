import { GoogleService } from './google.service';
import { Public } from 'omniboxd/auth/decorators/public.decorator';
import { Get, Body, Controller, Post } from '@nestjs/common';

@Controller('api/v1/google')
export class GoogleController {
  constructor(private readonly googleService: GoogleService) {}

  @Public()
  @Get('auth-url')
  getAuthUrl() {
    return this.googleService.getGoogleAuthUrl();
  }

  @Public()
  @Post('callback')
  async handleCallback(@Body() body: { code: string; state: string }) {
    return await this.googleService.handleCallback(body.code, body.state);
  }
}
