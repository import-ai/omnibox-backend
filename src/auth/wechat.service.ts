import { DataSource, EntityManager } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import generateId from 'omniboxd/utils/generate-id';
import { UserService } from 'omniboxd/user/user.service';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { WechatCheckResponseDto } from './dto/wechat-login.dto';
import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly openAppId: string;
  private readonly openAppSecret: string;
  private readonly qrCodeStates = new Map<
    string,
    {
      createdAt: number;
      expiresIn: number;
      type: 'weixin' | 'open_weixin';
      userInfo?: WechatCheckResponseDto['user'];
    }
  >();

  private readonly minUsernameLength = 2;
  private readonly maxUsernameLength = 32;

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly namespaceService: NamespacesService,
    private readonly dataSource: DataSource,
  ) {
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

  private cleanExpiresState() {
    const now = Date.now();
    for (const [state, info] of this.qrCodeStates.entries()) {
      if (now - info.createdAt > info.expiresIn) {
        this.qrCodeStates.delete(state);
      }
    }
  }

  private setState(type: 'weixin' | 'open_weixin') {
    const state = generateId();
    this.qrCodeStates.set(state, {
      type,
      createdAt: Date.now(),
      expiresIn: 5 * 60 * 1000, // Expires in 5 minutes
    });
    return state;
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

  generateSuffix(): string {
    return (
      '_' +
      generateId(4, 'useandomTPXpxJACKVERYMINDBUSHWOLFGQZbfghjklqvwyzrict')
    );
  }

  async getValidUsername(
    nickname: string,
    manager: EntityManager,
  ): Promise<string> {
    let username = nickname;

    if (username.length > this.maxUsernameLength) {
      username = nickname.slice(0, this.maxUsernameLength);
    }
    if (username.length >= this.minUsernameLength) {
      const user = await this.userService.findByUsername(username, manager);
      if (!user) {
        return username;
      }
    }

    username = nickname.slice(0, this.maxUsernameLength - 5);
    for (let i = 0; i < 5; i++) {
      const suffix = this.generateSuffix();
      const user = await this.userService.findByUsername(
        username + suffix,
        manager,
      );
      if (!user) {
        return username + suffix;
      }
    }

    throw new InternalServerErrorException(
      'Unable to generate a valid username',
    );
  }

  async handleCallback(code: string, state: string): Promise<any> {
    const stateInfo = this.qrCodeStates.get(state);
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
