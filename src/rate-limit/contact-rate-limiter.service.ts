import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectThrottlerStorage, ThrottlerStorage } from '@nestjs/throttler';
import { I18nService } from 'nestjs-i18n';

import {
  CONTACT_RATE_LIMIT_MAX,
  CONTACT_RATE_LIMIT_NAME,
  CONTACT_RATE_LIMIT_WINDOW_MS,
} from './rate-limit.constants';

/**
 * Fixed-window OTP send limit per contact (email address or phone number),
 * counted in the same throttler storage as the per-IP limit. Unlike the guard
 * it does not fail open: storage errors propagate to the caller.
 */
@Injectable()
export class ContactRateLimiter {
  constructor(
    @InjectThrottlerStorage() private readonly storage: ThrottlerStorage,
    private readonly i18n: I18nService,
  ) {}

  /** Record one send for `contact`; throws once the window is exhausted. */
  async consume(contact: string): Promise<void> {
    const hit = await this.storage.increment(
      `${CONTACT_RATE_LIMIT_NAME}:${contact}`,
      CONTACT_RATE_LIMIT_WINDOW_MS,
      CONTACT_RATE_LIMIT_MAX,
      CONTACT_RATE_LIMIT_WINDOW_MS,
      CONTACT_RATE_LIMIT_NAME,
    );
    if (!hit.isBlocked) {
      return;
    }
    // The storage reports the remaining block time in seconds.
    const minutes = Math.max(1, Math.ceil(hit.timeToBlockExpire / 60));
    throw new BadRequestException(
      this.i18n.t('auth.errors.tooManyOtpRequests', { args: { minutes } }),
    );
  }
}
