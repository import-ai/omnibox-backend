import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { SocialService } from 'omniboxd/auth/social.service';
import { UserService } from 'omniboxd/user/user.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { CreateUserBindingDto } from 'omniboxd/user/dto/create-user-binding.dto';
import { Injectable, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { transaction } from 'omniboxd/utils/transaction-utils';
import * as appleSignin from 'apple-signin-auth';
import { nanoid } from 'nanoid';

interface AppleUserData {
  name?: {
    firstName: string;
    lastName: string;
  };
  email?: string;
}

@Injectable()
export class AppleService {
  private readonly clientId: string;
  private readonly mobileClientId: string;
  private readonly redirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly namespaceService: NamespacesService,
    private readonly dataSource: DataSource,
    private readonly i18n: I18nService,
    private readonly socialService: SocialService,
  ) {
    this.clientId = this.configService.get<string>('OBB_APPLE_CLIENT_ID', '');
    this.mobileClientId = this.configService.get<string>(
      'OBB_APPLE_MOBILE_CLIENT_ID',
      '',
    );
    this.redirectUri = this.configService.get<string>(
      'OBB_APPLE_REDIRECT_URI',
      '',
    );
  }

  available() {
    return {
      available: !!((this.clientId && this.redirectUri) || this.mobileClientId),
    };
  }

  async getAuthConfig(): Promise<{
    clientId: string;
    scope: string;
    redirectURI: string;
    state: string;
    nonce: string;
  }> {
    const nonce = nanoid(32);
    const state = await this.socialService.generateState('apple', '', nonce);

    return {
      clientId: this.clientId,
      scope: 'name email',
      redirectURI: this.redirectUri,
      state: state,
      nonce: nonce,
    };
  }

  async handleCallback(
    idToken: string,
    state: string,
    user: AppleUserData | undefined,
    userId: string | undefined,
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

    let appleUserId: string;
    let email: string | undefined;
    let emailVerified = false;

    try {
      const decodedToken = await appleSignin.verifyIdToken(idToken, {
        audience: this.clientId,
        nonce: stateInfo.nonce,
        ignoreExpiration: false,
      });

      appleUserId = decodedToken.sub;
      email = decodedToken.email;
      emailVerified = decodedToken.email_verified === 'true' || false;
    } catch {
      const providerName = this.i18n.t('auth.providers.apple');
      const message = this.i18n.t('auth.errors.invalidTokenResponse', {
        args: { provider: providerName },
      });
      throw new AppException(
        message,
        'INVALID_TOKEN_RESPONSE',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (userId) {
      const appleUser = await this.userService.findByLoginId(appleUserId);
      if (appleUser) {
        if (appleUser.id !== userId) {
          const providerName = this.i18n.t('auth.providers.apple');
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
          id: appleUser.id,
          access_token: this.jwtService.sign({
            sub: appleUser.id,
            username: appleUser.username,
          }),
        };
        stateInfo.userInfo = returnValue;
        await this.socialService.updateState(state, stateInfo);
        return returnValue;
      }

      const metadata: any = {
        sub: appleUserId,
        email,
        email_verified: emailVerified,
      };
      if (user?.name) {
        metadata.name = user.name;
      }

      const existingUser = await this.userService.bindingExistUser({
        userId,
        loginType: 'apple',
        loginId: appleUserId,
        metadata,
      });

      const returnValue = {
        isBinding: true,
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
      };
      stateInfo.userInfo = returnValue;
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    }

    const existingUser = await this.userService.findByLoginId(appleUserId);
    if (existingUser) {
      const returnValue = {
        id: existingUser.id,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
      };
      stateInfo.userInfo = returnValue;
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    }

    if (email) {
      const linkedAccount = await this.userService.findByEmail(email);
      if (linkedAccount) {
        const metadata: any = {
          sub: appleUserId,
          email,
          email_verified: emailVerified,
        };
        if (user?.name) {
          metadata.name = user.name;
        }

        const existingUser = await this.userService.bindingExistUser({
          userId: linkedAccount.id,
          loginType: 'apple',
          loginId: appleUserId,
          metadata,
        });

        const returnValue = {
          id: existingUser.id,
          access_token: this.jwtService.sign({
            sub: existingUser.id,
            username: existingUser.username,
          }),
        };
        stateInfo.userInfo = returnValue;
        await this.socialService.updateState(state, stateInfo);
        return returnValue;
      }
    }

    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;

      let nickname: string;
      if (user?.name) {
        nickname = this.socialService.formatName(
          user.name.firstName,
          user.name.lastName,
          lang,
        );
      } else if (email) {
        nickname = email.split('@')[0];
      } else {
        nickname = `user_${appleUserId.slice(0, 8)}`;
      }

      const username = await this.socialService.getValidUsername(
        nickname,
        manager,
      );

      const metadata: any = {
        sub: appleUserId,
        email,
        email_verified: emailVerified,
      };
      if (user?.name) {
        metadata.name = user.name;
      }

      const appleUser = await this.userService.createUserBinding(
        {
          username,
          loginType: 'apple',
          loginId: appleUserId,
          email: email || undefined,
          lang,
          metadata,
        } as CreateUserBindingDto,
        manager,
      );

      await this.namespaceService.createUserNamespace(
        appleUser.id,
        appleUser.username,
        tx,
      );

      const returnValue = {
        id: appleUser.id,
        access_token: this.jwtService.sign({
          sub: appleUser.id,
          username: appleUser.username,
        }),
      };
      stateInfo.userInfo = returnValue;
      await this.socialService.updateState(state, stateInfo);
      return returnValue;
    });
  }

  async handleMobileCallback(
    identityToken: string,
    authorizationCode: string,
    user: AppleUserData | undefined,
    clientUsername: string | undefined,
    userId: string | undefined,
    lang?: string,
  ): Promise<any> {
    let appleUserId: string;
    let email: string | undefined;
    let emailVerified = false;

    try {
      const decodedToken = await appleSignin.verifyIdToken(identityToken, {
        audience: this.mobileClientId || this.clientId,
        ignoreExpiration: false,
      });

      appleUserId = decodedToken.sub;
      email = decodedToken.email;
      emailVerified = decodedToken.email_verified === 'true' || false;
    } catch {
      const providerName = this.i18n.t('auth.providers.apple');
      const message = this.i18n.t('auth.errors.invalidTokenResponse', {
        args: { provider: providerName },
      });
      throw new AppException(
        message,
        'INVALID_TOKEN_RESPONSE',
        HttpStatus.UNAUTHORIZED,
      );
    }

    if (userId) {
      const appleUser = await this.userService.findByLoginId(appleUserId);
      if (appleUser) {
        if (appleUser.id !== userId) {
          const providerName = this.i18n.t('auth.providers.apple');
          const message = this.i18n.t('auth.errors.invalidProviderData', {
            args: { provider: providerName },
          });
          throw new AppException(
            message,
            'ACCOUNT_ALREADY_BOUND',
            HttpStatus.BAD_REQUEST,
          );
        }
        return {
          id: appleUser.id,
          username: appleUser.username,
          email: appleUser.email,
          access_token: this.jwtService.sign({
            sub: appleUser.id,
            username: appleUser.username,
          }),
        };
      }

      const metadata: any = {
        sub: appleUserId,
        email,
        email_verified: emailVerified,
        authorizationCode,
      };
      if (user?.name) {
        metadata.name = user.name;
      }

      const existingUser = await this.userService.bindingExistUser({
        userId,
        loginType: 'apple',
        loginId: appleUserId,
        metadata,
      });

      return {
        id: existingUser.id,
        username: existingUser.username,
        email: existingUser.email,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
      };
    }

    const existingUser = await this.userService.findByLoginId(appleUserId);
    if (existingUser) {
      return {
        id: existingUser.id,
        username: existingUser.username,
        email: existingUser.email,
        access_token: this.jwtService.sign({
          sub: existingUser.id,
          username: existingUser.username,
        }),
      };
    }

    if (email) {
      const linkedAccount = await this.userService.findByEmail(email);
      if (linkedAccount) {
        const metadata: any = {
          sub: appleUserId,
          email,
          email_verified: emailVerified,
          authorizationCode,
        };
        if (user?.name) {
          metadata.name = user.name;
        }

        const existingUser = await this.userService.bindingExistUser({
          userId: linkedAccount.id,
          loginType: 'apple',
          loginId: appleUserId,
          metadata,
        });

        return {
          id: existingUser.id,
          username: existingUser.username,
          email: existingUser.email,
          access_token: this.jwtService.sign({
            sub: existingUser.id,
            username: existingUser.username,
          }),
        };
      }
    }

    return await transaction(this.dataSource.manager, async (tx) => {
      const manager = tx.entityManager;

      let nickname: string;
      // Priority: client username > full name > email prefix > apple user id prefix
      if (clientUsername) {
        nickname = clientUsername;
      } else if (user?.name) {
        nickname = this.socialService.formatName(
          user.name.firstName,
          user.name.lastName,
          lang,
        );
      } else if (email) {
        nickname = email.split('@')[0];
      } else {
        nickname = `user_${appleUserId.slice(0, 8)}`;
      }

      const username = await this.socialService.getValidUsername(
        nickname,
        manager,
      );

      const metadata: any = {
        sub: appleUserId,
        email,
        email_verified: emailVerified,
        authorizationCode,
      };
      if (user?.name) {
        metadata.name = user.name;
      }

      const appleUser = await this.userService.createUserBinding(
        {
          username,
          loginType: 'apple',
          loginId: appleUserId,
          email: email || undefined,
          lang,
          metadata,
        } as CreateUserBindingDto,
        manager,
      );

      await this.namespaceService.createUserNamespace(
        appleUser.id,
        appleUser.username,
        tx,
      );

      return {
        id: appleUser.id,
        username: appleUser.username,
        email: appleUser.email,
        access_token: this.jwtService.sign({
          sub: appleUser.id,
          username: appleUser.username,
        }),
      };
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
    await this.userService.unbindByLoginType(userId, 'apple');
  }
}
