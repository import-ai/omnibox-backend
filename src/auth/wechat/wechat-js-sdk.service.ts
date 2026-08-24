import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'crypto';
import { CacheService } from 'omniboxd/common/cache.service';

interface WechatAccessTokenResponse {
  access_token?: string;
  errcode?: number;
  errmsg?: string;
  expires_in?: number;
}

interface WechatTicketResponse {
  errcode?: number;
  errmsg?: string;
  expires_in?: number;
  ticket?: string;
}

export interface WechatJsSdkSignature {
  appId: string;
  nonceStr: string;
  signature: string;
  timestamp: number;
}

const CACHE_NAMESPACE = '/wechat-js-sdk';
const CACHE_TTL_MARGIN_SECONDS = 300;
const DEFAULT_ALLOWED_HOSTS =
  'test.omnibox.pro,pre.omnibox.pro,www.omnibox.pro';

@Injectable()
export class WechatJsSdkService {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly allowedHosts: Set<string>;

  constructor(
    private readonly configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    this.appId = this.configService.get<string>('OBB_WECHAT_APP_ID', '');
    this.appSecret = this.configService.get<string>(
      'OBB_WECHAT_APP_SECRET',
      '',
    );
    this.allowedHosts = new Set(
      this.configService
        .get<string>('OBB_WECHAT_JS_SDK_ALLOWED_HOSTS', DEFAULT_ALLOWED_HOSTS)
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
  }

  /** Creates the WeChat JS-SDK signature for a public conversation-share URL. */
  async createSignature(pageUrl: string): Promise<WechatJsSdkSignature> {
    if (!this.appId || !this.appSecret) {
      throw new ServiceUnavailableException(
        'WeChat JS-SDK credentials are not configured',
      );
    }

    const normalizedUrl = this.normalizeShareUrl(pageUrl);
    const ticket = await this.getJsApiTicket();
    const nonceStr = randomBytes(16).toString('hex');
    const timestamp = Math.floor(Date.now() / 1000);
    const signatureSource = [
      `jsapi_ticket=${ticket}`,
      `noncestr=${nonceStr}`,
      `timestamp=${timestamp}`,
      `url=${normalizedUrl}`,
    ].join('&');

    return {
      appId: this.appId,
      nonceStr,
      signature: createHash('sha1').update(signatureSource).digest('hex'),
      timestamp,
    };
  }

  private normalizeShareUrl(pageUrl: string): string {
    const withoutFragment = pageUrl?.trim().split('#', 1)[0];
    let parsed: URL;

    try {
      parsed = new URL(withoutFragment);
    } catch {
      throw new BadRequestException('Invalid WeChat JS-SDK page URL');
    }

    const isAllowedProtocol = parsed.protocol === 'https:';
    const isAllowedHost = this.allowedHosts.has(parsed.hostname.toLowerCase());
    const isSharePage =
      /^\/[a-z]{2}(?:-[a-z]{2})?\/conversation-share\/?$/.test(parsed.pathname);

    if (!isAllowedProtocol || !isAllowedHost || !isSharePage) {
      throw new BadRequestException('WeChat JS-SDK page URL is not allowed');
    }

    return withoutFragment;
  }

  private async getJsApiTicket(): Promise<string> {
    const cachedTicket = await this.cacheService.get<string>(
      CACHE_NAMESPACE,
      'jsapi-ticket',
    );
    if (cachedTicket) return cachedTicket;

    const accessToken = await this.getAccessToken();
    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/ticket/getticket?access_token=${encodeURIComponent(accessToken)}&type=jsapi`,
    );
    const result = (await response.json()) as WechatTicketResponse;

    if (!response.ok || result.errcode !== 0 || !result.ticket) {
      throw new ServiceUnavailableException(
        `Unable to obtain WeChat JSAPI ticket${result.errmsg ? `: ${result.errmsg}` : ''}`,
      );
    }

    await this.cacheService.set(
      CACHE_NAMESPACE,
      'jsapi-ticket',
      result.ticket,
      this.getCacheTtl(result.expires_in),
    );
    return result.ticket;
  }

  private async getAccessToken(): Promise<string> {
    const cachedToken = await this.cacheService.get<string>(
      CACHE_NAMESPACE,
      'access-token',
    );
    if (cachedToken) return cachedToken;

    const params = new URLSearchParams({
      appid: this.appId,
      grant_type: 'client_credential',
      secret: this.appSecret,
    });
    const response = await fetch(
      `https://api.weixin.qq.com/cgi-bin/token?${params.toString()}`,
    );
    const result = (await response.json()) as WechatAccessTokenResponse;

    if (!response.ok || !result.access_token) {
      throw new ServiceUnavailableException(
        `Unable to obtain WeChat access token${result.errmsg ? `: ${result.errmsg}` : ''}`,
      );
    }

    await this.cacheService.set(
      CACHE_NAMESPACE,
      'access-token',
      result.access_token,
      this.getCacheTtl(result.expires_in),
    );
    return result.access_token;
  }

  private getCacheTtl(expiresIn = 7200): number {
    return Math.max(expiresIn - CACHE_TTL_MARGIN_SECONDS, 60) * 1000;
  }
}
