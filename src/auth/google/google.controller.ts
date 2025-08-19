import { Request } from 'express';
import { AuthService } from 'omniboxd/auth/auth.service';
import { GoogleService } from 'omniboxd/auth/google/google.service';
import { Req, Get, Body, Controller, Post } from '@nestjs/common';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { SocialController } from 'omniboxd/auth/social.controller';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

@Controller('api/v1/google')
export class GoogleController extends SocialController {
  constructor(
    private readonly googleService: GoogleService,
    protected readonly authService: AuthService,
  ) {
    super(authService);
  }

  @Public()
  @Get('available')
  available() {
    return this.googleService.available();
  }

  @Public()
  @Get('auth-url')
  getAuthUrl() {
    return this.googleService.authUrl();
  }

  @Public()
  @Post('callback')
  async handleCallback(
    @Req() req: Request,
    @Body() body: { code: string; state: string },
  ) {
    const userId = this.findUserId(req.headers.authorization);

    return await this.googleService.handleCallback(
      body.code,
      body.state,
      userId,
    );
  }

  @Post('unbind')
  unbind(@UserId() userId: string) {
    return this.googleService.unbind(userId);
  }
}
