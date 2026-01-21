import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CacheService } from 'omniboxd/common/cache.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { UserBinding } from 'omniboxd/user/entities/user-binding.entity';
import { SendSubscribeMessageRequestDto } from './dto/send-subscribe-message-request.dto';
import { Requests } from 'omniboxd/utils/requests';

interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
  errcode?: number;
  errmsg?: string;
}

export interface SendMessageResponseDto {
  errcode: number;
  errmsg: string;
}

@Injectable()
export class SubscribeMessageService {
  private readonly logger = new Logger(SubscribeMessageService.name);

  private readonly appId: string;
  private readonly appSecret: string;
  private readonly mini_program_state: string;

  private static readonly CACHE_NAMESPACE = '/wechat';
  private static readonly ACCESS_TOKEN_KEY = 'mini_program_access_token';
  private static readonly SEND_MESSAGE_URL =
    'https://api.weixin.qq.com/cgi-bin/message/subscribe/send';
  private static readonly ACCESS_TOKEN_URL =
    'https://api.weixin.qq.com/cgi-bin/stable_token';

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
    private readonly i18n: I18nService,
    @InjectRepository(UserBinding)
    private readonly userBindingRepository: Repository<UserBinding>,
  ) {
    this.appId = this.configService.get<string>('OBB_MINI_PROGRAM_APP_ID', '');
    this.appSecret = this.configService.get<string>(
      'OBB_MINI_PROGRAM_APP_SECRET',
      '',
    );
    this.mini_program_state = this.configService.get<string>(
      'OBB_MINI_PROGRAM_STATE',
      'formal',
    );
  }

  async getAccessToken(): Promise<string> {
    const cached = await this.cacheService.get<string>(
      SubscribeMessageService.CACHE_NAMESPACE,
      SubscribeMessageService.ACCESS_TOKEN_KEY,
    );

    if (cached) {
      return cached;
    }

    const response = await Requests.post(
      SubscribeMessageService.ACCESS_TOKEN_URL,
      {
        grant_type: 'client_credential',
        appid: this.appId,
        secret: this.appSecret,
      },
    );

    if (!response.ok) {
      throw new AppException(
        'Failed to get access token from WeChat',
        'WECHAT_ACCESS_TOKEN_FAILED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const data: AccessTokenResponse = await response.json();

    if (data.errcode) {
      this.logger.error({
        message: 'get wechat access token error',
        response: data,
      });
      throw new AppException(
        data.errmsg || 'unknown WeChat error',
        data.errcode.toString(),
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
    dto: SendSubscribeMessageRequestDto,
  ): Promise<SendMessageResponseDto> {
    if (!this.appId || !this.appSecret) {
      throw new AppException(
        'WeChat MiniProgram is not configured',
        'MINI_PROGRAM_NOT_CONFIGURED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const userBinding = await this.userBindingRepository.findOne({
      where: { userId: dto.userId, loginType: 'wechat' },
    });

    if (!userBinding) {
      throw new AppException(
        this.i18n.t('auth.errors.userNotBoundWechat'),
        'USER_NOT_BOUND_WECHAT',
        HttpStatus.BAD_REQUEST,
      );
    }

    const metadata = userBinding.metadata as Record<string, any>;
    const miniProgramOpenId = metadata?.mini_program_openid;

    if (!miniProgramOpenId) {
      throw new AppException(
        this.i18n.t('auth.errors.userNotLoggedInMiniProgram'),
        'USER_NOT_LOGGED_IN_MINI_PROGRAM',
        HttpStatus.BAD_REQUEST,
      );
    }

    const accessToken = await this.getAccessToken();

    const url = `${SubscribeMessageService.SEND_MESSAGE_URL}?access_token=${accessToken}`;

    const body: Record<string, any> = {
      touser: miniProgramOpenId,
      template_id: dto.templateId,
      wechat_mini_program_state: this.mini_program_state,
      lang: dto.lang || 'zh_CN',
      data: dto.data,
    };

    if (dto.resourceId && dto.namespaceId) {
      const deepLink = `omnibox://details?id=${dto.resourceId}&namespaceId=${dto.namespaceId}&title=${encodeURIComponent(dto.title || '')}`;
      body.page = `pages/webview/index?url=${encodeURIComponent(deepLink)}`;
    } else if (dto.page) {
      body.page = dto.page;
    }

    const response = await Requests.post(url, body);

    if (!response.ok) {
      throw new AppException(
        'Failed to send subscribe message',
        'WECHAT_SEND_MESSAGE_FAILED',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }

    const result: SendMessageResponseDto = await response.json();

    if (result.errcode !== 0) {
      this.logger.error({
        message: 'WeChat send message error',
        response: result.errmsg,
      });
      throw new AppException(
        result.errmsg || 'unknown WeChat send message error',
        result.errcode.toString(),
        HttpStatus.BAD_REQUEST,
      );
    }

    return result;
  }
}
