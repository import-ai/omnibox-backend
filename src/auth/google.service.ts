import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SocialService } from './social.service';
import { UserService } from 'omniboxd/user/user.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import {
  Logger,
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';

interface GoogleTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
  scope: string;
  token_type: string;
  id_token?: string;
}

interface GoogleUserInfo {
  id: string;
  email: string;
  verified_email: boolean;
  name: string;
  given_name: string;
  family_name: string;
  picture?: string;
  locale?: string;
}

@Injectable()
export class GoogleService extends SocialService {
  private readonly logger = new Logger(GoogleService.name);

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    protected readonly userService: UserService,
    private readonly namespaceService: NamespacesService,
    private readonly dataSource: DataSource,
  ) {
    super(userService);
    this.clientId = this.configService.get<string>('OBB_GOOGLE_CLIENT_ID', '');
    this.clientSecret = this.configService.get<string>(
      'OBB_GOOGLE_CLIENT_SECRET',
      '',
    );
    this.redirectUri = this.configService.get<string>(
      'OBB_GOOGLE_REDIRECT_URI',
      '',
    );
  }

  getGoogleAuthUrl(): string {
    const state = this.setState('google');
    this.cleanExpiresState();

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid profile email',
      state: state,
      access_type: 'offline',
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(code: string, state: string): Promise<any> {
    const stateInfo = this.getState(state);
    if (!stateInfo) {
      throw new UnauthorizedException('Invalid state identifier');
    }

    // 使用授权码获取访问令牌
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: this.clientId,
        client_secret: this.clientSecret,
        code: code,
        grant_type: 'authorization_code',
        redirect_uri: this.redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      throw new UnauthorizedException('Failed to get Google access token');
    }

    const tokenData: GoogleTokenResponse = await tokenResponse.json();

    if (!tokenData.access_token) {
      throw new BadRequestException('Invalid token response from Google');
    }

    // 使用访问令牌获取用户信息
    const userInfoResponse = await fetch(
      `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenData.access_token}`,
    );

    if (!userInfoResponse.ok) {
      throw new UnauthorizedException('Failed to get Google user info');
    }

    const userData: GoogleUserInfo = await userInfoResponse.json();

    if (!userData.id || !userData.email) {
      throw new BadRequestException('Invalid user data from Google');
    }

    // 检查用户是否已存在
    const existingUser = await this.userService.findByLoginId(userData.id);
    if (existingUser) {
      const returnValue = {
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
        }),
      };
      stateInfo.userInfo = returnValue;
      return returnValue;
    }
    return await this.dataSource.transaction(async (manager) => {
      const nickname = userData.name || userData.email.split('@')[0];
      const username = await this.getValidUsername(nickname, manager);
      this.logger.debug({ nickname, username });
      const googleUser = await this.userService.createUserBinding(
        {
          username,
          loginType: 'google',
          loginId: userData.id,
        },
        manager,
      );

      await this.namespaceService.createAndJoinNamespace(
        googleUser.id,
        `${googleUser.username}'s Namespace`,
        manager,
      );

      const returnValue = {
        id: googleUser.id,
        access_token: this.jwtService.sign({
          sub: googleUser.id,
        }),
      };
      stateInfo.userInfo = returnValue;
      return returnValue;
    });
  }
}
