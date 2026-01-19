import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from 'omniboxd/common/cache.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { UserBinding } from 'omniboxd/user/entities/user-binding.entity';
import {
  SendSubscribeMessageDto,
  MiniProgramState,
} from './dto/send-subscribe-message.dto';

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  errcode?: number;
  errmsg?: string;
}

export interface SendMessageResponse {
  errcode: number;
  errmsg: string;
}

@Injectable()
export class SubscribeMessageService {
  private readonly logger = new Logger(SubscribeMessageService.name);

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly baseUrl: string;

  private static readonly CACHE_NAMESPACE = '/wechat';
  private static readonly ACCESS_TOKEN_KEY = 'miniprogram_access_token';
  private static readonly SEND_MESSAGE_URL =
    'https://api.weixin.qq.com/cgi-bin/message/subscribe/send';
  private static readonly ACCESS_TOKEN_URL =
    'https://api.weixin.qq.com/cgi-bin/token';

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    @InjectRepository(UserBinding)
    private readonly userBindingRepository: Repository<UserBinding>,
  ) {
    this.appId = this.configService.get<string>('OBB_MINI_PROGRAM_APP_ID', '');
    this.appSecret = this.configService.get<string>(
      'OBB_MINI_PROGRAM_APP_SECRET',
      '',
    );
    this.baseUrl = this.configService.get<string>('OBB_BASE_URL', '');
  }

  async getAccessToken(): Promise<string> {
    const cached = await this.cacheService.get<string>(
      SubscribeMessageService.CACHE_NAMESPACE,
      SubscribeMessageService.ACCESS_TOKEN_KEY,
    );

    if (cached) {
      return cached;
    }

    const url = `${SubscribeMessageService.ACCESS_TOKEN_URL}?grant_type=client_credential&appid=${this.appId}&secret=${this.appSecret}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new AppException(
        'Failed to get access token from WeChat',
        'WECHAT_ACCESS_TOKEN_FAILED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const data: AccessTokenResponse = await response.json();

    if (data.errcode) {
      this.logger.error(`WeChat access token error: ${data.errmsg}`);
      throw new AppException(
        `WeChat error: ${data.errmsg}`,
        'WECHAT_ACCESS_TOKEN_ERROR',
        HttpStatus.BAD_REQUEST,
      );
    }

    // Cache for expires_in - 300 seconds (5 minutes buffer)
    const ttl = (data.expires_in - 300) * 1000;
    await this.cacheService.set(
      SubscribeMessageService.CACHE_NAMESPACE,
      SubscribeMessageService.ACCESS_TOKEN_KEY,
      data.access_token,
      ttl,
    );

    return data.access_token;
  }

  async sendMessage(
    dto: SendSubscribeMessageDto,
  ): Promise<SendMessageResponse> {
    if (!this.appId || !this.appSecret) {
      throw new AppException(
        'WeChat MiniProgram is not configured',
        'MINIPROGRAM_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const userBinding = await this.userBindingRepository.findOne({
      where: { userId: dto.userId, loginType: 'wechat' },
    });

    if (!userBinding) {
      throw new AppException(
        'User has not bound WeChat',
        'USER_NOT_BOUND_WECHAT',
        HttpStatus.BAD_REQUEST,
      );
    }

    const metadata = userBinding.metadata as Record<string, any>;
    const miniprogramOpenid = metadata?.miniprogram_openid;

    if (!miniprogramOpenid) {
      throw new AppException(
        'User has not logged in via MiniProgram',
        'USER_NOT_LOGGED_IN_MINIPROGRAM',
        HttpStatus.BAD_REQUEST,
      );
    }

    const accessToken = await this.getAccessToken();

    const url = `${SubscribeMessageService.SEND_MESSAGE_URL}?access_token=${accessToken}`;

    const body: Record<string, any> = {
      touser: miniprogramOpenid,
      template_id: dto.templateId,
      miniprogram_state: dto.miniprogram_state || MiniProgramState.FORMAL,
      lang: dto.lang || 'zh_CN',
      data: dto.data,
    };

    if (dto.resourceId && dto.namespaceId && this.baseUrl) {
      const baseUrlTrimmed = 'https://test.omnibox.pro/m/';

      const h5Url = `${baseUrlTrimmed}details?id=${dto.resourceId}&namespaceId=${dto.namespaceId}&title=${encodeURIComponent(dto.title || '')}`;

      body.page = `pages/webview/index?url=${encodeURIComponent(h5Url)}`;
    } else if (dto.page) {
      body.page = dto.page;
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new AppException(
        'Failed to send subscribe message',
        'WECHAT_SEND_MESSAGE_FAILED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const result: SendMessageResponse = await response.json();

    if (result.errcode !== 0) {
      this.logger.error(`WeChat send message error: ${result.errmsg}`);
      throw new AppException(
        `WeChat error: ${result.errmsg}`,
        'WECHAT_SEND_MESSAGE_ERROR',
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }
}
