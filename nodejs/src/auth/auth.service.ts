import { JwtService } from '@nestjs/jwt';
import { UserService } from 'src/user/user.service';
import { Injectable, BadRequestException } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    private userService: UserService,
    private jwtService: JwtService,
  ) {}

  async verify(email: string, password: string): Promise<any> {
    const user = await this.userService.verify(email, password);
    if (!user) {
      throw new BadRequestException('User not found');
    }
    return {
      email: user.email,
      user_id: user.user_id,
      username: user.username,
    };
  }

  async login(email: string) {
    const account = await this.userService.findByEmail(email);
    if (!account) {
      throw new BadRequestException('User not found');
    }
    return {
      access_token: this.jwtService.sign({
        sub: account.user_id,
        email: account.email,
      }),
    };
  }
}
