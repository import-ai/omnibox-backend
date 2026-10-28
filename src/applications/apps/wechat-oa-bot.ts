import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomBytes } from 'crypto';
import { I18nService } from 'nestjs-i18n';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { Applications } from 'omniboxd/applications/applications.entity';
import { BotBase } from 'omniboxd/applications/apps/bot-base';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';
import { Repository } from 'typeorm';

const QRCODE_URL_PREFIXES = [
  'http://weixin.qq.com/q/',
  'https://weixin.qq.com/q/',
];

/**
 * WeChat Official Account assistant. Every binding gets its own temporary
 * parametric QR code from the bot; following (or scanning while already
 * following) the account pushes the binding key back through the bot callback.
 *
 * The key travels in the QR scene, and a temporary QR code stays scannable for
 * up to 30 days after its binding completed or was cancelled. A 6-digit key
 * would be drawn again for someone else's later binding, letting the old QR
 * code bind into that namespace, so this key is a 128-bit random token that
 * never repeats.
 */
@Injectable()
export class WechatOaBot extends BotBase {
  public static readonly appId = 'wechat_oa_bot';
  private readonly logger = new Logger(WechatOaBot.name);
  private readonly obbotBaseUrl: string;

  constructor(
    applicationsRepository: Repository<Applications>,
    apiKeyService: APIKeyService,
    namespacesService: NamespacesService,
    i18n: I18nService,
    private readonly configService: ConfigService,
  ) {
    super(applicationsRepository, apiKeyService, namespacesService, i18n);
    this.obbotBaseUrl = this.configService
      .get<string>('OBBOT_BASE_URL', '')
      .replace(/\/+$/, '');
  }

  override generateUniqueKey(): Promise<string> {
    return Promise.resolve(randomBytes(16).toString('hex'));
  }

  protected override removeBindingCredentials(
    attrs: Record<string, any>,
  ): Record<string, any> {
    const attrsWithoutKey = super.removeBindingCredentials(attrs);
    const {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      qrcode_content: _content,
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      qrcode_expires_at: _expiresAt,
      ...rest
    } = attrsWithoutKey;
    return rest;
  }

  async getAttrs(): Promise<
    {
      key: string;
      qrcode_content: string;
      qrcode_expires_at: string;
    } & Record<string, any>
  > {
    const attrs = await super.getAttrs();

    try {
      if (!this.obbotBaseUrl) {
        throw new Error('OBBOT_BASE_URL is not configured');
      }

      const response = await fetch(
        `${this.obbotBaseUrl}/api/v1/wechat_oa/binding-qrcode`,
        {
          signal: AbortSignal.timeout(5000),
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: attrs.key }),
        },
      );

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = (await response.json()) as {
        qrcode_content?: unknown;
        qrcode_expires_at?: unknown;
      };

      const qrcodeContent = data.qrcode_content;
      const qrcodeExpiresAt = data.qrcode_expires_at;
      if (
        typeof qrcodeContent !== 'string' ||
        !QRCODE_URL_PREFIXES.some((prefix) => qrcodeContent.startsWith(prefix))
      ) {
        throw new Error('Invalid qrcode_content');
      }
      if (
        typeof qrcodeExpiresAt !== 'string' ||
        Number.isNaN(Date.parse(qrcodeExpiresAt))
      ) {
        throw new Error('Invalid qrcode_expires_at');
      }

      return {
        ...attrs,
        qrcode_content: qrcodeContent,
        qrcode_expires_at: new Date(qrcodeExpiresAt).toISOString(),
      };
    } catch (error) {
      this.logger.warn(
        `WeChat official account QR code generation failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
      const message = this.i18n.t('application.errors.bindingRequestFailed');
      throw new AppException(
        message,
        'BINDING_REQUEST_FAILED',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
