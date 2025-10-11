import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SocialService } from 'omniboxd/auth/social.service';
import { UserService } from 'omniboxd/user/user.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { CreateUserBindingDto } from 'omniboxd/user/dto/create-user-binding.dto';
import {
  BadRequestException,
  Injectable,
  Logger,
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
  sub: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  picture?: string;
  email?: string;
  email_verified?: boolean;
  locale?: string;
  hd?: string;
}

@Injectable()
export class GoogleService extends SocialService {
  private readonly logger = new Logger(GoogleService.name);

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly googleOAuthAPIBaseUrl: string;
  private readonly googleAPIBaseUrl: string;

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
    this.googleOAuthAPIBaseUrl = this.configService.get<string>(
      'OBB_GOOGLE_OAUTH_API_BASE_URL',
      'https://oauth2.googleapis.com',
    );
    this.googleAPIBaseUrl = this.configService.get<string>(
      'OBB_GOOGLE_API_BASE_URL',
      'https://www.googleapis.com',
    );
  }

  available() {
    return {
      available: !!(this.clientId && this.clientSecret && this.redirectUri),
    };
  }

  authUrl(): string {
    const state = this.setState('google');
    this.cleanExpiresState();

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state: state,
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async handleCallback(
    code: string,
    state: string,
    userId: string,
    lang?: string,
  ): Promise<any> {
    const stateInfo = this.getState(state);
    if (!stateInfo) {
      throw new UnauthorizedException('Invalid state identifier');
    }

    const tokenResponse = await fetch(`${this.googleOAuthAPIBaseUrl}/token`, {
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

    if (!tokenData.id_token) {
      throw new BadRequestException('Invalid token response from Google');
    }

    const userInfoResponse = await fetch(
      `${this.googleAPIBaseUrl}/oauth2/v3/userinfo`,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );

    if (!userInfoResponse.ok) {
      throw new UnauthorizedException('Failed to get Google user info');
    }

    const userData: GoogleUserInfo = await userInfoResponse.json();

    if (!userData.sub || !userData.email) {
      throw new BadRequestException('Invalid user data from Google');
    }

    if (userId) {
      const wechatUser = await this.userService.findByLoginId(userData.sub);
      if (wechatUser && wechatUser.id !== userId) {
        throw new BadRequestException(
          'This google account is already bound to another user',
        );
      }
      const existingUser = await this.userService.bindingExistUser({
        userId,
        loginType: 'google',
        loginId: userData.sub,
      });
      const returnValue = {
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
        }),
      };
      stateInfo.userInfo = returnValue;
      return returnValue;
    }

    const existingUser = await this.userService.findByLoginId(userData.sub);
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
      let nickname = userData.name;
      if (!nickname) {
        nickname = userData.given_name;
      }
      if (!nickname && userData.email) {
        nickname = userData.email.split('@')[0];
      }
      if (!nickname) {
        nickname = userData.sub;
      }
      const username = await this.getValidUsername(nickname, manager);
      this.logger.debug({ nickname, username });
      const googleUser = await this.userService.createUserBinding(
        {
          username,
          loginType: 'google',
          loginId: userData.sub,
          email: userData.email,
          lang,
        } as CreateUserBindingDto,
        manager,
      );

      await this.namespaceService.createUserNamespace(
        googleUser.id,
        googleUser.username,
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

  async unbind(userId: string) {
    await this.userService.unbindByLoginType(userId, 'google');
  }
}
