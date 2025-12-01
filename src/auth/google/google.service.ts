import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SocialService } from 'omniboxd/auth/social.service';
import { UserService } from 'omniboxd/user/user.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { CreateUserBindingDto } from 'omniboxd/user/dto/create-user-binding.dto';
import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { fetchWithRetry } from 'omniboxd/utils/fetch-with-retry';
import { transaction } from 'omniboxd/utils/transaction-utils';

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
export class GoogleService {
  private readonly logger = new Logger(GoogleService.name);

  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectUri: string;
  private readonly googleOAuthAPIBaseUrl: string;
  private readonly googleAPIBaseUrl: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly namespaceService: NamespacesService,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly socialService: SocialService,
  ) {
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

  async authUrl(): Promise<string> {
    const state = await this.socialService.generateState('google');

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
    const stateInfo = await this.socialService.getState(state);
    if (!stateInfo) {
      const message = this.i18n.t('auth.errors.invalidStateIdentifier');
      throw new AppException(
        message,
        'INVALID_STATE_IDENTIFIER',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const tokenResponse = await fetchWithRetry(
      `${this.googleOAuthAPIBaseUrl}/token`,
      {
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
      },
    );

    if (!tokenResponse.ok) {
      const providerName = this.i18n.t('auth.providers.google');
      const message = this.i18n.t('auth.errors.oauthFailed', {
        args: { provider: providerName },
      });
      throw new AppException(message, 'OAUTH_FAILED', HttpStatus.UNAUTHORIZED);
    }

    const tokenData: GoogleTokenResponse = await tokenResponse.json();

    if (!tokenData.id_token) {
      const providerName = this.i18n.t('auth.providers.google');
      const message = this.i18n.t('auth.errors.invalidTokenResponse', {
        args: { provider: providerName },
      });
      throw new AppException(
        message,
        'INVALID_TOKEN_RESPONSE',
        HttpStatus.BAD_REQUEST,
      );
    }

    const userInfoResponse = await fetchWithRetry(
      `${this.googleAPIBaseUrl}/oauth2/v3/userinfo`,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );

    if (!userInfoResponse.ok) {
      const providerName = this.i18n.t('auth.providers.google');
      const message = this.i18n.t('auth.errors.failedToGetUserInfo', {
        args: { provider: providerName },
      });
      throw new AppException(
        message,
        'FAILED_TO_GET_USER_INFO',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const userData: GoogleUserInfo = await userInfoResponse.json();

    if (!userData.sub || !userData.email) {
      const providerName = this.i18n.t('auth.providers.google');
      const message = this.i18n.t('auth.errors.invalidUserData', {
        args: { provider: providerName },
      });
      throw new AppException(
        message,
        'INVALID_USER_DATA',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (userId) {
      const googleUser = await this.userService.findByLoginId(userData.sub);
      if (googleUser) {
        if (googleUser.id !== userId) {
          const providerName = this.i18n.t('auth.providers.google');
          const message = this.i18n.t('auth.errors.invalidProviderData', {
            args: { provider: providerName },
          });
          throw new AppException(
            message,
            'ACCOUNT_ALREADY_BOUND',
            HttpStatus.BAD_REQUEST,
          );
        }
        const returnValue = {
          id: googleUser.id,
          access_token: this.jwtService.sign({
            sub: googleUser.id,
          }),
        };
        stateInfo.userInfo = returnValue;
        await this.socialService.updateState(state, stateInfo);
        return returnValue;
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
      await this.socialService.updateState(state, stateInfo);
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
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    }
    // The email has already been used https://wqjowq8l2hl.feishu.cn/record/T8zVrlZjReK0HeceZ7icyh8qnze
    const linkedAccount = await this.userService.findByEmail(userData.email);
    if (linkedAccount) {
      const existingUser = await this.userService.bindingExistUser({
        userId: linkedAccount.id,
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
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    }

    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;

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
      const username = await this.socialService.getValidUsername(
        nickname,
        manager,
      );
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
        tx,
      );

      const returnValue = {
        id: googleUser.id,
        access_token: this.jwtService.sign({
          sub: googleUser.id,
        }),
      };
      stateInfo.userInfo = returnValue;
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    });
  }

  async unbind(userId: string) {
    const canDo = await this.socialService.canUnBinding(userId);
    if (!canDo) {
      const message = this.i18n.t('auth.errors.unbindingNotAllowed');
      throw new AppException(
        message,
        'UNBINDING_NOT_ALLOWED',
        HttpStatus.FORBIDDEN,
      );
    }
    await this.userService.unbindByLoginType(userId, 'google');
  }
}
