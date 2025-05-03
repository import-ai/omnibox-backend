import { JwtService } from '@nestjs/jwt';
import { MailService } from 'src/mail/mail.service';
import { UserService } from 'src/user/user.service';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { CreateUserDto } from 'src/user/dto/create-user.dto';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly mailService: MailService,
    private readonly namespaceService: NamespacesService,
    private readonly dataSource: DataSource,
  ) {}

  async verify(email: string, password: string): Promise<any> {
    const user = await this.userService.verify(email, password);
    if (!user) {
      throw new ForbiddenException(
        'No account found for the provided email. Please register first.',
      );
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

  async signUpWithoutConfirm(createUser: CreateUserDto) {
    const account = await this.userService.findByEmail(createUser.email);
    if (account) {
      throw new BadRequestException('Email already registered');
    }
    const user = await this.userService.create(createUser);
    return {
      id: user.id,
      username: user.username,
      access_token: this.jwtService.sign({
        sub: user.id,
        email: user.email,
      }),
    };
  }

  async signUp(url: string, email: string) {
    const account = await this.userService.findByEmail(email);
    if (account) {
      throw new BadRequestException(
        'The email is already registered. Please log in directly.',
      );
    }
    const token = this.jwtService.sign(
      { email, sub: 'register_user' },
      {
        expiresIn: '1h',
      },
    );
    const mailSendUri = `${url}?token=${token}`;
    await this.mailService.sendSignUpEmail(email, mailSendUri);
    // return { url: mailSendUri };
  }

  async signUpConfirm(
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
        throw new BadRequestException(
          'The email is already registered. Please log in directly.',
        );
      }
      return await this.dataSource.transaction(async (manager) => {
        const user = await this.userService.create(
          {
            email: payload.email,
            username: data.username,
            password: data.password,
            password_repeat: data.password_repeat,
          },
          manager,
        );

        // Invited user
        if (payload.role && payload.namespace) {
          const namespace = await this.namespaceService.get(
            payload.namespace,
            manager,
          );
          const field = payload.role === 'owner' ? 'owner_id' : 'collaborators';
          if (namespace[field].includes(user.id)) {
            return;
          }
          namespace[field].push(user.id);
          await this.namespaceService.update(
            payload.namespace,
            {
              [field]: namespace[field],
            },
            manager,
          );
        }

        await this.namespaceService.createAndInit(
          user.id,
          `${user.username}'s Namespace`,
          manager,
        );
        return {
          id: user.id,
          username: user.username,
          access_token: this.jwtService.sign({
            sub: user.id,
            email: user.email,
          }),
        };
      });
    } catch (e) {
      console.log(e);
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }

  async password(url: string, email: string) {
    const user = await this.userService.findByEmail(email);
    if (!user) {
      throw new NotFoundException('User not found.');
    }
    const token = this.jwtService.sign(
      { email: user.email, sub: user.id },
      {
        expiresIn: '1h',
      },
    );
    const mailSendUri = `${url}?token=${token}`;
    await this.mailService.sendPasswordEmail(user.email, mailSendUri);
    // return { url: mailSendUri };
  }

  async resetPassword(
    token: string,
    password: string,
    password_repeat: string,
  ): Promise<void> {
    if (password !== password_repeat) {
      throw new BadRequestException('The passwords entered do not match.');
    }
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userService.find(payload.sub);
      if (!user) {
        throw new NotFoundException('User not found.');
      }
      await this.userService.updatePassword(user.id, password);
    } catch (e) {
      console.log(e);
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }

  async invite(
    user_id: string,
    email: string,
    data: {
      inviteUrl: string;
      registerUrl: string;
      namespace: string;
      role: string;
    },
  ) {
    const account = await this.userService.findByEmail(email);
    if (account) {
      const token = this.jwtService.sign(
        {
          email,
          role: data.role,
          sub: account.id,
          namespace: data.namespace,
        },
        {
          expiresIn: '1h',
        },
      );
      await this.mailService.sendInviteEmail(
        email,
        `${data.inviteUrl}?user=${user_id}&namespace=${data.namespace}&token=${token}`,
      );
      return;
    }
    const token = this.jwtService.sign(
      { role: data.role, email, sub: 'invite_user', namespace: data.namespace },
      {
        expiresIn: '1h',
      },
    );
    const mailSendUri = `${data.registerUrl}?user=${user_id}&namespace=${data.namespace}&token=${token}`;
    await this.mailService.sendInviteEmail(email, mailSendUri);
    // return { url: mailSendUri };
  }

  async inviteConfirm(token: string): Promise<void> {
    try {
      const payload = this.jwtService.verify(token);
      const user = await this.userService.find(payload.sub);
      if (!user) {
        throw new NotFoundException('User not found.');
      }
      const namespace = await this.namespaceService.get(payload.namespace);
      const field = payload.role === 'owner' ? 'owner_id' : 'collaborators';
      if (namespace[field].includes(user.id)) {
        return;
      }
      namespace[field].push(user.id);
      await this.namespaceService.update(payload.namespace, {
        [field]: namespace[field],
      });
    } catch (e) {
      console.log(e);
      throw new UnauthorizedException('Invalid or expired token.');
    }
  }
}
