import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import generateId from 'src/utils/generate-id';
import { UserService } from 'src/user/user.service';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  WechatCheckResponseDto,
  WechatQrcodeResponseDto,
} from './dto/wechat-login.dto';

@Injectable()
export class WechatService {
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

  generateQrCode(): WechatQrcodeResponseDto {
    const state = this.setState('open_weixin');
    this.cleanExpiresState();
    return {
      state,
      data: `https://open.weixin.qq.com/connect/qrconnect?appid=${this.openAppId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`,
    };
  }

  checkQrCodeStatus(state: string): WechatCheckResponseDto {
    const stateInfo = this.qrCodeStates.get(state);

    if (!stateInfo) {
      return { status: 'expired' };
    }

    if (Date.now() - stateInfo.createdAt > stateInfo.expiresIn) {
      this.qrCodeStates.delete(state);
      return { status: 'expired' };
    }

    if (!stateInfo.userInfo) {
      return { status: 'pending' };
    }

    return {
      status: 'success',
      user: stateInfo.userInfo,
    };
  }

  getWechatAuthUrl(): string {
    const state = this.setState('weixin');
    this.cleanExpiresState();
    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
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
    const userDataResponse = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${accessTokenData.access_token}&openid=${accessTokenData.openid}&lang=zh_CN`,
    );
    if (!userDataResponse.ok) {
      throw new UnauthorizedException('Failed to get WeChat user info');
    }
    const userData = await userDataResponse.json();

    if (!userData.unionid) {
      throw new UnauthorizedException(
        'Failed to get WeChat UnionID, please make sure you have followed the official account',
      );
    }

    const wechatUser = await this.userService.findByLoginId(
      userData.unionidinId,
    );
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
      const wechatUser = await this.userService.createUserBinding(
        {
          loginType: 'wechat',
          username: userData.nickname,
          loginId: userData.unionidinId,
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
