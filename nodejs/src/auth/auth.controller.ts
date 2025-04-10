import { AuthService } from 'src/auth/auth.service';
import { LocalAuthGuard } from 'src/auth/local-auth.guard';
import { Public } from 'src/auth/decorators/public.decorator';
import { Controller, Request, Post, UseGuards } from '@nestjs/common';

@Controller('api/auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @UseGuards(LocalAuthGuard)
  @Public()
  @Post()
  async login(@Request() req) {
    return await this.authService.login(req.user.email);
  }
}
