import { GoogleService } from './google.service';
import { Public } from 'omniboxd/auth/decorators/public.decorator';
import { Get, Query, Controller } from '@nestjs/common';

@Controller('api/v1/google')
export class GoogleController {
  constructor(private readonly googleService: GoogleService) {}

  @Public()
  @Get('auth-url')
  getAuthUrl() {
    return this.googleService.getGoogleAuthUrl();
  }

  @Public()
  @Get('callback')
  async handleCallback(
    @Query('code') code: string,
    @Query('state') state: string,
  ) {
    return await this.googleService.handleCallback(code, state);
  }
}
