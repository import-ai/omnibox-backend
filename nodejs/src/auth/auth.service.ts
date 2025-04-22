import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/mail/mail.service';
import { UserService } from 'src/user/user.service';
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

  async register(url: string, email: string) {
    const account = await this.userService.findByEmail(email);
    if (account) {
      throw new BadRequestException('当前邮箱已注册，请直接登录');
    }
    const token = this.jwtService.sign(
      { email, sub: 0 },
      {
        expiresIn: '1h',
      },
    );
    await this.mailService.sendRegisterEmail(email, `${url}?token=${token}`);
  }

  async registerComfirm(
    token: string,
    data: {
      username: string;
      password: string;
      password_repeat: string;
    },
  ) {
    try {
      const payload = this.jwtService.verify(token);
      const account = await this.userService.findByEmail(payload.email);
      if (account) {
        throw new BadRequestException('当前邮箱已注册，请直接登录');
      }
      const user = await this.userService.create({
        email: payload.email,
        username: data.username,
        password: data.password,
        password_repeat: data.password_repeat,
      });

      return {
        id: user.id,
        username: user.username,
        access_token: this.jwtService.sign({
          sub: user.id,
          email: user.email,
        }),
      };
    } catch (e) {
      console.log(e);
      throw new UnauthorizedException('无效或过期的token');
    }
  }

  async requestPasswordReset(url: string, email: string): Promise<void> {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('用户不存在');
    }
    const token = this.jwtService.sign(
      { email: user.email, sub: user.id },
      {
        expiresIn: '1h',
      },
    );
    await this.mailService.sendPasswordResetEmail(
      user.email,
      `${url}?token=${token}`,
    );
  }

  async resetPassword(
    token: string,
    password: string,
    password_repeat: string,
  ): Promise<void> {
    if (password !== password_repeat) {
      throw new BadRequestException('两次输入的密码不一致');
    }
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
