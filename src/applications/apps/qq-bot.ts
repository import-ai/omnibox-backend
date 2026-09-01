import { Injectable, Logger } from '@nestjs/common';
import { CreateApplicationsDto } from 'omniboxd/applications/applications.dto';
import { BotBase } from 'omniboxd/applications/apps/bot-base';

@Injectable()
export class QQBot extends BotBase {
  public static readonly appId = 'qq_bot';

  private readonly logger = new Logger(QQBot.name);

  protected override removeBindingCredentials(
    attrs: Record<string, any>,
  ): Record<string, any> {
    const attrsWithoutKey = super.removeBindingCredentials(attrs);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { url_link: _, ...rest } = attrsWithoutKey;
    return rest;
  }

  async getAttrs(
    namespaceId: string,
    userId: string,
    createDto: CreateApplicationsDto,
  ): Promise<{ key: string; url_link?: string } & Record<string, any>> {
    const attrs = await super.getAttrs(namespaceId, userId, createDto);
    const baseUrl = process.env.OBBOT_BASE_URL?.replace(/\/+$/, '');

    if (!baseUrl) {
      this.logger.warn('QQ binding link generation is not configured');
      return attrs;
    }

    try {
      const response = await fetch(`${baseUrl}/api/v1/qq/binding-link`, {
        signal: AbortSignal.timeout(5000),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ key: attrs.key }),
      });

      if (!response.ok) {
        throw new Error('QQ binding link request failed');
      }

      const data = (await response.json()) as {
        url_link?: unknown;
      };

      if (
        typeof data.url_link !== 'string' ||
        !data.url_link.startsWith('https://')
      ) {
        throw new Error('QQ binding link response is invalid');
      }

      return {
        ...attrs,
        url_link: data.url_link,
      };
    } catch {
      this.logger.warn('QQ binding link generation failed');
      return attrs;
    }
  }
}
