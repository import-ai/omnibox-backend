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

@Injectable()
export class WechatService extends SocialService {
  private readonly logger = new Logger(WechatService.name);

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly openAppId: string;
  private readonly openAppSecret: string;

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
    this.redirectUri = this.configService.get<string>(
      'OBB_WECHAT_REDIRECT_URI',
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

  getWechatAuthUrl(): string {
    const state = this.setState('weixin');
    this.cleanExpiresState();
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  }

  async handleCallback(code: string, state: string): Promise<any> {
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
        },
        manager,
      );
      await this.namespaceService.createAndJoinNamespace(
        wechatUser.id,
        `${wechatUser.username}'s Namespace`,
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
}
