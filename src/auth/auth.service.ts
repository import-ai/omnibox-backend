import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/mail/mail.service';
import { UserService } from 'src/user/user.service';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import {
  Injectable,
  ForbiddenException,
  BadRequestException,
  UnauthorizedException,
  NotFoundException,
} from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
  ) {}

  async verify(email: string, password: string): Promise<any> {
    const user = await this.userService.verify(email, password);
    if (!user) {
      throw new ForbiddenException('未发现邮箱对应的帐户，请先注册');
    }
    return {
      id: user.id,
      email: user.email,
      username: user.username,
    };
  }

  async login(email: string) {
    const account = await this.userService.findByEmail(email);
    if (!account) {
      throw new BadRequestException('User not found');
    }
    return {
      id: account.id,
      username: account.username,
      access_token: this.jwtService.sign({
        sub: account.id,
        email: account.email,
      }),
    };
  }

  async register(createUser: CreateUserDto) {
    const account = await this.userService.create(createUser);

    return {
      id: account.id,
      username: account.username,
      access_token: this.jwtService.sign({
        sub: account.id,
        email: account.email,
      }),
    };
  }

  async requestPasswordReset(url: string, email: string): Promise<void> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const payload = { email: user.email, sub: user.id };
    const token = this.jwtService.sign(payload, {
      expiresIn: '1h',
    });
    await this.mailService.sendPasswordResetEmail(
      user.email,
      `${url}?token=${token}`,
    );
  }

  async resetPassword(token: string, password: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userService.find(payload.sub);
      if (!user) {
        throw new NotFoundException('用户不存在');
      }
      await this.userService.updatePassword(user.id, password);
    } catch (e) {
      console.log(e);
      throw new UnauthorizedException('无效或过期的token');
    }
  }
}
