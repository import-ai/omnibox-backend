import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { trace } from '@opentelemetry/api';
import { createHash, randomBytes } from 'crypto';
import { CacheService } from 'omniboxd/common/cache.service';
import { ProxyAgent } from 'undici';

interface WechatApiResponse {
  errcode?: number;
  errmsg?: string;
}

interface WechatAccessTokenResponse extends WechatApiResponse {
  access_token?: string;
  expires_in?: number;
}

interface WechatTicketResponse extends WechatApiResponse {
  expires_in?: number;
  ticket?: string;
}

export interface WechatJsSdkSignature {
  appId: string;
  mobileAppId: string;
  nonceStr: string;
  signature: string;
  timestamp: number;
}

type WechatApiOperation = 'access_token' | 'jsapi_ticket';

const CACHE_NAMESPACE = '/wechat-js-sdk';
const CACHE_TTL_MARGIN_SECONDS = 300;
const DEFAULT_ALLOWED_HOSTS =
  'test.omnibox.pro,pre.omnibox.pro,www.omnibox.pro';
const WECHAT_API_TIMEOUT_MS = 5_000;

function recordWechatApiError(
  operation: WechatApiOperation,
  responseStatus: number,
  data: WechatApiResponse,
): void {
  trace.getActiveSpan()?.addEvent('wechat.api.error', {
    'wechat.api.operation': operation,
    'wechat.api.errcode': data.errcode ?? -1,
    'wechat.api.errmsg': data.errmsg ?? 'Invalid WeChat API response',
    'http.response.status_code': responseStatus,
  });
}

async function requestWechatApi<T extends WechatApiResponse>(
  operation: WechatApiOperation,
  url: string,
  proxyAgent?: ProxyAgent,
): Promise<{ data: T; response: Response }> {
  let response: Response | undefined;
  try {
    response = await fetch(url, {
      signal: AbortSignal.timeout(WECHAT_API_TIMEOUT_MS),
      ...(proxyAgent ? { dispatcher: proxyAgent } : {}),
    } as RequestInit);
    return { data: (await response.json()) as T, response };
  } catch (error) {
    recordWechatApiError(operation, response?.status ?? 0, {
      errmsg:
        error instanceof Error ? error.message : 'WeChat API request failed',
    });
    throw new ServiceUnavailableException(
      'Unable to communicate with the WeChat API',
    );
  }
}

@Injectable()
export class WechatJsSdkService {
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly mobileAppId: string;
  private readonly allowedHosts: Set<string>;
  private readonly proxyAgent?: ProxyAgent;
  private accessTokenPromise?: Promise<string>;
  private jsApiTicketPromise?: Promise<string>;

  constructor(
    configService: ConfigService,
    private readonly cacheService: CacheService,
  ) {
    this.appId = configService.get<string>('OBB_WECHAT_APP_ID', '');
    this.appSecret = configService.get<string>('OBB_WECHAT_APP_SECRET', '');
    this.mobileAppId = configService.get<string>(
      'OBB_WECHAT_APP_NATIVE_ID',
      '',
    );
    this.allowedHosts = new Set(
      configService
        .get<string>('OBB_WECHAT_JS_SDK_ALLOWED_HOSTS', DEFAULT_ALLOWED_HOSTS)
        .split(',')
        .map((host) => host.trim().toLowerCase())
        .filter(Boolean),
    );
    const proxyUrl = configService.get<string>('OB_STATIC_PROXY', '');
    if (proxyUrl) this.proxyAgent = new ProxyAgent(proxyUrl);
  }

  /** Creates a WeChat JS-SDK signature for an allowed public page URL. */
  async createSignature(
    pageUrl: string | undefined,
  ): Promise<WechatJsSdkSignature> {
    if (!this.appId || !this.appSecret || !this.mobileAppId) {
      throw new ServiceUnavailableException(
        'WeChat JS-SDK configuration is incomplete',
      );
    }

    const normalizedUrl = this.normalizePageUrl(pageUrl);
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
      mobileAppId: this.mobileAppId,
      nonceStr,
      signature: createHash('sha1').update(signatureSource).digest('hex'),
      timestamp,
    };
  }

  private normalizePageUrl(pageUrl: string | undefined): string {
    const withoutFragment = pageUrl?.trim().split('#', 1)[0] ?? '';
    try {
      const parsed = new URL(withoutFragment);
      const isAllowed =
        parsed.protocol === 'https:' &&
        !parsed.port &&
        !parsed.username &&
        !parsed.password &&
        this.allowedHosts.has(parsed.hostname.toLowerCase());
      if (!isAllowed) throw new Error('URL is not allowed');
      return withoutFragment;
    } catch {
      throw new BadRequestException('WeChat JS-SDK page URL is not allowed');
    }
  }

  private async getJsApiTicket(): Promise<string> {
    const cachedTicket = await this.cacheService.get<string>(
      CACHE_NAMESPACE,
      'jsapi-ticket',
    );
    if (cachedTicket) return cachedTicket;

    if (!this.jsApiTicketPromise) {
      this.jsApiTicketPromise = this.fetchAndCacheJsApiTicket().finally(() => {
        this.jsApiTicketPromise = undefined;
      });
    }
    return this.jsApiTicketPromise;
  }

  private async fetchAndCacheJsApiTicket(): Promise<string> {
    const params = new URLSearchParams({
      access_token: await this.getAccessToken(),
      type: 'jsapi',
    });
    const { data, response } = await requestWechatApi<WechatTicketResponse>(
      'jsapi_ticket',
      `https://api.weixin.qq.com/cgi-bin/ticket/getticket?${params}`,
      this.proxyAgent,
    );
    if (!response.ok || data.errcode !== 0 || !data.ticket) {
      recordWechatApiError('jsapi_ticket', response.status, data);
      throw new ServiceUnavailableException('Unable to obtain WeChat ticket');
    }

    await this.cacheService.set(
      CACHE_NAMESPACE,
      'jsapi-ticket',
      data.ticket,
      this.getCacheTtl(data.expires_in),
    );
    return data.ticket;
  }

  private async getAccessToken(): Promise<string> {
    const cachedToken = await this.cacheService.get<string>(
      CACHE_NAMESPACE,
      'access-token',
    );
    if (cachedToken) return cachedToken;

    if (!this.accessTokenPromise) {
      this.accessTokenPromise = this.fetchAndCacheAccessToken().finally(() => {
        this.accessTokenPromise = undefined;
      });
    }
    return this.accessTokenPromise;
  }

  private async fetchAndCacheAccessToken(): Promise<string> {
    const params = new URLSearchParams({
      appid: this.appId,
      grant_type: 'client_credential',
      secret: this.appSecret,
    });
    const { data, response } =
      await requestWechatApi<WechatAccessTokenResponse>(
        'access_token',
        `https://api.weixin.qq.com/cgi-bin/token?${params}`,
        this.proxyAgent,
      );
    if (!response.ok || data.errcode || !data.access_token) {
      recordWechatApiError('access_token', response.status, data);
      throw new ServiceUnavailableException(
        'Unable to obtain WeChat access token',
      );
    }

    await this.cacheService.set(
      CACHE_NAMESPACE,
      'access-token',
      data.access_token,
      this.getCacheTtl(data.expires_in),
    );
    return data.access_token;
  }

  private getCacheTtl(expiresIn = 7200): number {
    return Math.max(expiresIn - CACHE_TTL_MARGIN_SECONDS, 60) * 1000;
  }
}
