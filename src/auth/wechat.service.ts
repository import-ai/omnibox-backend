import * as QRCode from 'qrcode';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UserService } from 'src/user/user.service';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { Injectable, UnauthorizedException } from '@nestjs/common';
import {
  WechatCheckResponseDto,
  WechatQrcodeResponseDto,
} from './dto/wechat-login.dto';

interface WechatAccessTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  openid: string;
  scope: string;
  unionid?: string;
}

interface WechatUserInfoResponse {
  openid: string;
  nickname: string;
  sex: number;
  province: string;
  city: string;
  country: string;
  headimgurl: string;
  privilege: string[];
  unionid?: string;
}

@Injectable()
export class WechatService {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly redirectUri: string;
  private readonly qrCodeStates = new Map<
    string,
    {
      createdAt: number;
      userInfo?: any;
      expiresIn: number;
    }
  >();

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly userService: UserService,
    private readonly namespaceService: NamespacesService,
    private readonly dataSource: DataSource,
  ) {
    this.appId = this.configService.get<string>('WECHAT_APP_ID', '');
    this.appSecret = this.configService.get<string>('WECHAT_APP_SECRET', '');
    this.redirectUri = this.configService.get<string>(
      'WECHAT_REDIRECT_URI',
      '',
    );
  }

  async generateQrCode(): Promise<WechatQrcodeResponseDto> {
    const state = `wechat_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const qrcode = await QRCode.toDataURL(
      `https://open.weixin.qq.com/connect/qrconnect?appid=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=snsapi_login&state=${state}#wechat_redirect`,
      {
        width: 200,
        margin: 2,
      },
    );

    const expiresIn = 5 * 60; // Expires in 5 minutes
    this.qrCodeStates.set(state, {
      createdAt: Date.now(),
      expiresIn: expiresIn * 1000,
    });

    this.cleanExpiresState();

    return {
      state,
      qrcode,
      expiresIn,
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
    const state = `wechat_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
    const expiresIn = 5 * 60; // Expires in 5 minutes
    this.qrCodeStates.set(state, {
      createdAt: Date.now(),
      expiresIn: expiresIn * 1000,
    });

    this.cleanExpiresState();

    return `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${this.appId}&redirect_uri=${encodeURIComponent(this.redirectUri)}&response_type=code&scope=snsapi_userinfo&state=${state}#wechat_redirect`;
  }

  private cleanExpiresState() {
    const now = Date.now();
    for (const [state, info] of this.qrCodeStates.entries()) {
      if (now - info.createdAt > info.expiresIn) {
        this.qrCodeStates.delete(state);
      }
    }
  }

  async handleCallback(code: string, state: string): Promise<any> {
    const stateInfo = this.qrCodeStates.get(state);
    if (!stateInfo) {
      throw new UnauthorizedException('Invalid state identifier');
    }
    const accessTokenResponse = await fetch(
      `https://api.weixin.qq.com/sns/oauth2/access_token?appid=${this.appId}&secret=${this.appSecret}&code=${code}&grant_type=authorization_code`,
    );
    if (!accessTokenResponse.ok) {
      throw new UnauthorizedException('Failed to get WeChat access token');
    }
    const accessTokenData =
      (await accessTokenResponse.json()) as WechatAccessTokenResponse;
    const userDataResponse = await fetch(
      `https://api.weixin.qq.com/sns/userinfo?access_token=${accessTokenData.access_token}&openid=${accessTokenData.openid}&lang=zh_CN`,
    );
    if (!userDataResponse.ok) {
      throw new UnauthorizedException('Failed to get WeChat user info');
    }
    const userData = (await userDataResponse.json()) as WechatUserInfoResponse;

    stateInfo.userInfo = userData;

    if (!userData.unionid) {
      throw new UnauthorizedException(
        'Failed to get WeChat UnionID, please make sure you have followed the official account',
      );
    }

    const loginId = userData.unionid || '';
    const wechatUser = await this.userService.findByWechatUnionid(loginId);
    if (wechatUser) {
      return {
        id: wechatUser.id,
        username: wechatUser.username,
        access_token: this.jwtService.sign({
          sub: wechatUser.id,
          email: wechatUser.email,
        }),
      };
    }

    return await this.dataSource.transaction(async (manager) => {
      const newWechatUser = await this.userService.createWechatUser(
        {
          loginId,
          loginType: 'wechat',
        },
        manager,
      );
      await this.namespaceService.createAndJoinNamespace(
        newWechatUser.id,
        `${newWechatUser.username}'s Namespace`,
        manager,
      );
      return {
        id: newWechatUser.id,
        username: newWechatUser.username,
        access_token: this.jwtService.sign({
          sub: newWechatUser.id,
          email: newWechatUser.email,
        }),
      };
    });
  }
}
