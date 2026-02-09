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

  async authUrl(redirectUrl?: string): Promise<string> {
    const state = await this.socialService.generateState(
      'google',
      '',
      '',
      redirectUrl,
    );

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
    const startTime = Date.now();
    this.logger.debug(`[handleCallback] 开始处理 - state: ${state}`);

    // 1. 获取并验证 state
    const getStateStart = Date.now();
    const stateInfo = await this.socialService.getState(state);
    this.logger.debug(
      `[handleCallback] getState 完成 - 耗时: ${Date.now() - getStateStart}ms`,
    );

    if (!stateInfo) {
      const message = this.i18n.t('auth.errors.invalidStateIdentifier');
      throw new AppException(
        message,
        'INVALID_STATE_IDENTIFIER',
        HttpStatus.UNAUTHORIZED,
      );
    }

    // 2. 获取 Google access token
    const tokenRequestStart = Date.now();
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
    this.logger.debug(
      `[handleCallback] Google token 请求完成 - 耗时: ${Date.now() - tokenRequestStart}ms`,
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

    // 3. 获取 Google 用户信息
    const userInfoRequestStart = Date.now();
    const userInfoResponse = await fetchWithRetry(
      `${this.googleAPIBaseUrl}/oauth2/v3/userinfo`,
      {
        headers: { Authorization: `Bearer ${tokenData.access_token}` },
      },
    );
    this.logger.debug(
      `[handleCallback] Google 用户信息请求完成 - 耗时: ${Date.now() - userInfoRequestStart}ms`,
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

    // 4. 处理已登录用户的绑定场景
    if (userId) {
      this.logger.debug(
        `[handleCallback] 处理已登录用户绑定场景 - userId: ${userId}`,
      );

      const findByLoginIdStart = Date.now();
      const googleUser = await this.userService.findByLoginId(userData.sub);
      this.logger.debug(
        `[handleCallback] findByLoginId 完成 - 耗时: ${Date.now() - findByLoginIdStart}ms`,
      );

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
          isBinding: true,
          id: googleUser.id,
          access_token: this.jwtService.sign({
            sub: googleUser.id,
            username: googleUser.username,
          }),
          redirectUrl: stateInfo.redirectUrl,
        };
        stateInfo.userInfo = returnValue;

        const updateStateStart = Date.now();
        await this.socialService.updateState(state, stateInfo);
        this.logger.debug(
          `[handleCallback] updateState 完成 - 耗时: ${Date.now() - updateStateStart}ms`,
        );
        this.logger.debug(
          `[handleCallback] 总耗时: ${Date.now() - startTime}ms`,
        );
        return returnValue;
      }

      const bindingStart = Date.now();
      const existingUser = await this.userService.bindingExistUser({
        userId,
        loginType: 'google',
        loginId: userData.sub,
        metadata: userData,
      });
      this.logger.debug(
        `[handleCallback] bindingExistUser 完成 - 耗时: ${Date.now() - bindingStart}ms`,
      );

      const returnValue = {
        isBinding: true,
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
        redirectUrl: stateInfo.redirectUrl,
      };
      stateInfo.userInfo = returnValue;

      const updateStateStart = Date.now();
      await this.socialService.updateState(state, stateInfo);
      this.logger.debug(
        `[handleCallback] updateState 完成 - 耗时: ${Date.now() - updateStateStart}ms`,
      );
      this.logger.debug(`[handleCallback] 总耗时: ${Date.now() - startTime}ms`);
      return returnValue;
    }

    // 5. 检查是否是现有用户登录
    this.logger.debug(`[handleCallback] 检查现有用户登录场景`);
    const findExistingStart = Date.now();
    const existingUser = await this.userService.findByLoginId(userData.sub);
    this.logger.debug(
      `[handleCallback] findByLoginId (现有用户) 完成 - 耗时: ${Date.now() - findExistingStart}ms`,
    );

    if (existingUser) {
      const returnValue = {
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
        redirectUrl: stateInfo.redirectUrl,
      };
      stateInfo.userInfo = returnValue;

      const updateStateStart = Date.now();
      await this.socialService.updateState(state, stateInfo);
      this.logger.debug(
        `[handleCallback] updateState 完成 - 耗时: ${Date.now() - updateStateStart}ms`,
      );
      this.logger.debug(`[handleCallback] 总耗时: ${Date.now() - startTime}ms`);
      return returnValue;
    }

    // 6. 检查邮箱是否已被使用
    this.logger.debug(`[handleCallback] 检查邮箱关联账户`);
    const findByEmailStart = Date.now();
    const linkedAccount = await this.userService.findByEmail(userData.email);
    this.logger.debug(
      `[handleCallback] findByEmail 完成 - 耗时: ${Date.now() - findByEmailStart}ms`,
    );

    if (linkedAccount) {
      const bindingStart = Date.now();
      const existingUser = await this.userService.bindingExistUser({
        userId: linkedAccount.id,
        loginType: 'google',
        loginId: userData.sub,
        metadata: userData,
      });
      this.logger.debug(
        `[handleCallback] bindingExistUser (邮箱关联) 完成 - 耗时: ${Date.now() - bindingStart}ms`,
      );

      const returnValue = {
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
        redirectUrl: stateInfo.redirectUrl,
      };
      stateInfo.userInfo = returnValue;

      const updateStateStart = Date.now();
      await this.socialService.updateState(state, stateInfo);
      this.logger.debug(
        `[handleCallback] updateState 完成 - 耗时: ${Date.now() - updateStateStart}ms`,
      );
      this.logger.debug(`[handleCallback] 总耗时: ${Date.now() - startTime}ms`);
      return returnValue;
    }

    // 7. 创建新用户
    this.logger.debug(`[handleCallback] 开始创建新用户`);
    const createUserStart = Date.now();
    const result = await transaction(this.dataSource.manager, async (tx) => {
      const txStart = Date.now();
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

      const getValidUsernameStart = Date.now();
      const username = await this.socialService.getValidUsername(
        nickname,
        manager,
      );
      this.logger.debug(
        `[handleCallback] getValidUsername 完成 - 耗时: ${Date.now() - getValidUsernameStart}ms`,
      );
      this.logger.debug({ nickname, username });

      const createUserBindingStart = Date.now();
      const googleUser = await this.userService.createUserBinding(
        {
          username,
          loginType: 'google',
          loginId: userData.sub,
          email: userData.email,
          lang,
          metadata: userData,
        } as CreateUserBindingDto,
        manager,
      );
      this.logger.debug(
        `[handleCallback] createUserBinding 完成 - 耗时: ${Date.now() - createUserBindingStart}ms`,
      );

      const createNamespaceStart = Date.now();
      await this.namespaceService.createUserNamespace(
        googleUser.id,
        googleUser.username,
        tx,
      );
      this.logger.debug(
        `[handleCallback] createUserNamespace 完成 - 耗时: ${Date.now() - createNamespaceStart}ms`,
      );

      const returnValue = {
        id: googleUser.id,
        access_token: this.jwtService.sign({
          sub: googleUser.id,
          username: googleUser.username,
        }),
        redirectUrl: stateInfo.redirectUrl,
      };
      stateInfo.userInfo = returnValue;

      const updateStateStart = Date.now();
      await this.socialService.updateState(state, stateInfo);
      this.logger.debug(
        `[handleCallback] updateState (事务内) 完成 - 耗时: ${Date.now() - updateStateStart}ms`,
      );

      this.logger.debug(
        `[handleCallback] 事务总耗时: ${Date.now() - txStart}ms`,
      );
      return returnValue;
    });

    this.logger.debug(
      `[handleCallback] 创建新用户完成 - 耗时: ${Date.now() - createUserStart}ms`,
    );
    this.logger.debug(`[handleCallback] 总耗时: ${Date.now() - startTime}ms`);
    return result;
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
