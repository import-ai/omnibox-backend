import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'omniboxd/user/user.service';
import { SocialService } from 'omniboxd/auth/social.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import {
  Logger,
  Injectable,
  BadRequestException,
  UnauthorizedException,
} from '@nestjs/common';

export interface WechatUserInfo {
  unionid: string;
  nickname: string;
  openid: string;
}

@Injectable()
export class WechatService extends SocialService {
  private readonly logger = new Logger(WechatService.name);

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly openAppId: string;
  private readonly openAppSecret: string;
  private readonly oldAppId: string;
  private readonly oldAppSecret: string;
  private readonly oldOpenAppId: string;
  private readonly oldOpenAppSecret: string;
  private readonly redirectUri: string;
  private readonly migrationRedirectUri: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    protected readonly userService: UserService,
    private readonly namespaceService: NamespacesService,
    private readonly dataSource: DataSource,
  ) {
    super(userService);
    this.appId = this.configService.get<string>('OBB_WECHAT_APP_ID', '');
    this.appSecret = this.configService.get<string>(
      'OBB_WECHAT_APP_SECRET',
      '',
    );
    this.openAppId = this.configService.get<string>(
      'OBB_OPEN_WECHAT_APP_ID',
      '',
    );
    this.openAppSecret = this.configService.get<string>(
      'OBB_OPEN_WECHAT_APP_SECRET',
      '',
    );
    this.oldAppId = this.configService.get<string>('OBB_WECHAT_OLD_APP_ID', '');
    this.oldAppSecret = this.configService.get<string>(
      'OBB_WECHAT_OLD_APP_SECRET',
      '',
    );
    this.oldOpenAppId = this.configService.get<string>(
      'OBB_OPEN_WECHAT_OLD_APP_ID',
      '',
    );
    this.oldOpenAppSecret = this.configService.get<string>(
      'OBB_OPEN_WECHAT_OLD_APP_SECRET',
      '',
    );
    this.redirectUri = this.configService.get<string>(
      'OBB_WECHAT_REDIRECT_URI',
      '',
    );
    this.migrationRedirectUri = this.configService.get<string>(
      'OBB_WECHAT_MIGRATION_REDIRECT_URI',
      '',
    );
  }

  available() {
    return {
      available: !!(
        this.appId &&
        this.openAppId &&
        this.appSecret &&
        this.openAppSecret &&
        this.redirectUri
      ),
    };
  }

  getQrCodeParams() {
    const state = this.setState('open_weixin');
    this.cleanExpiresState();
    return {
      state,
      appId: this.openAppId,
      scope: 'snsapi_login',
      redirectUri: encodeURIComponent(this.redirectUri),
    };
  }

  authUrl(): string {
    const state = this.setState('weixin');
    this.cleanExpiresState();
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
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
    const isWeixin = stateInfo.type === 'weixin';
    const appId = isWeixin ? this.appId : this.openAppId;
    const appSecret = isWeixin ? this.appSecret : this.openAppSecret;
    const accessTokenResponse = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`,
    );
    if (!accessTokenResponse.ok) {
      throw new UnauthorizedException('Failed to get WeChat access token');
    }
    const accessTokenData = await accessTokenResponse.json();

    if (accessTokenData.errmsg) {
      throw new BadRequestException(accessTokenData.errmsg);
    }

    const userDataResponse = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${accessTokenData.access_token}&openid=${accessTokenData.openid}&lang=zh_CN`,
    );
    if (!userDataResponse.ok) {
      throw new UnauthorizedException('Failed to get WeChat user info');
    }
    const userData = await userDataResponse.json();

    if (userData.errmsg) {
      throw new BadRequestException(userData.errmsg);
    }

    if (userId) {
      const wechatUser = await this.userService.findByLoginId(userData.unionid);
      if (wechatUser && wechatUser.id !== userId) {
        throw new BadRequestException(
          'This wechat account is already bound to another user',
        );
      }
      const existingUser = await this.userService.bindingExistUser({
        userId,
        loginType: 'wechat',
        loginId: userData.unionid,
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
    const wechatUser = await this.userService.findByLoginId(userData.unionid);
    if (wechatUser) {
      const returnValue = {
        id: wechatUser.id,
        access_token: this.jwtService.sign({
          sub: wechatUser.id,
        }),
      };
      stateInfo.userInfo = returnValue;
      return returnValue;
    }
    return await this.dataSource.transaction(async (manager) => {
      const nickname: string = userData.nickname;
      const username: string = await this.getValidUsername(nickname, manager);
      this.logger.debug({ nickname, username });
      const wechatUser = await this.userService.createUserBinding(
        {
          username,
          loginType: 'wechat',
          loginId: userData.unionid,
          lang,
        },
        manager,
      );
      await this.namespaceService.createUserNamespace(
        wechatUser.id,
        wechatUser.username,
        manager,
      );
      const returnValue = {
        id: wechatUser.id,
        access_token: this.jwtService.sign({
          sub: wechatUser.id,
        }),
      };
      stateInfo.userInfo = returnValue;
      return returnValue;
    });
  }

  migrationQrCode(type: 'new' | 'old' = 'new') {
    const isOld = type === 'old';
    const state = this.setState('open_weixin', type);
    this.cleanExpiresState();
    return {
      state,
      appId: isOld ? this.oldOpenAppId : this.openAppId,
      scope: 'snsapi_login',
      redirectUri: encodeURIComponent(this.migrationRedirectUri),
    };
  }

  migrationAuthUrl(type: 'new' | 'old' = 'new'): string {
    const isOld = type === 'old';
    const state = this.setState('weixin', type);
    this.cleanExpiresState();
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${isOld ? this.oldAppId : this.appId}&redirect_uri=${encodeURIComponent(this.migrationRedirectUri)}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  }

  async migrationCallback(
    code: string,
    state: string,
  ): Promise<WechatUserInfo> {
    const stateInfo = this.getState(state);
    if (!stateInfo) {
      throw new UnauthorizedException('Invalid state identifier');
    }
    const isOld = state.startsWith('old_');
    const isWeixin = stateInfo.type === 'weixin';
    const rawAppid = isOld ? this.oldAppId : this.appId;
    const rawAppsecret = isOld ? this.oldAppSecret : this.appSecret;
    const rawOpenAppid = isOld ? this.oldOpenAppId : this.openAppId;
    const rawOpenAppsecret = isOld ? this.oldOpenAppSecret : this.openAppSecret;
    const appId = isWeixin ? rawAppid : rawOpenAppid;
    const appSecret = isWeixin ? rawAppsecret : rawOpenAppsecret;
    const accessTokenResponse = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${appId}&secret=${appSecret}&code=${code}&grant_type=authorization_code`,
    );
    if (!accessTokenResponse.ok) {
      throw new UnauthorizedException('Failed to get WeChat access token');
    }
    const accessTokenData = await accessTokenResponse.json();

    if (accessTokenData.errmsg) {
      throw new BadRequestException(accessTokenData.errmsg);
    }

    const userDataResponse = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${accessTokenData.access_token}&openid=${accessTokenData.openid}&lang=zh_CN`,
    );
    if (!userDataResponse.ok) {
      throw new UnauthorizedException('Failed to get WeChat user info');
    }
    const userData = await userDataResponse.json();

    if (userData.errmsg) {
      throw new BadRequestException(userData.errmsg);
    }

    return userData;
  }

  async migration(oldUnionid: string, newUnionid: string) {
    await this.userService.updateBinding(oldUnionid, newUnionid);
  }

  async unbind(userId: string) {
    await this.userService.unbindByLoginType(userId, 'wechat');
  }
}
