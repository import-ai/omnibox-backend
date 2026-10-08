import { BadRequestException, HttpStatus, Injectable } from '@nestjs/common';
import { JsonWebTokenError, JwtService, TokenExpiredError } from '@nestjs/jwt';
import { I18nService } from 'nestjs-i18n';
import { CacheService } from 'omniboxd/common/cache.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { ContactRateLimiter } from 'omniboxd/rate-limit/contact-rate-limiter.service';

type DeliveryChannel = 'email' | 'sms';

interface OtpRecord {
  code: string;
  contact: string; // email or phone number
  channel: DeliveryChannel;
  expiresAt: number;
  attempts: number;
}

@Injectable()
export class OtpService {
  // Namespaces for cache keys
  private readonly otpNamespace = '/otp/codes';

  // Configuration
  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ATTEMPTS = 5;
  private readonly MAGIC_LINK_EXPIRY = '5m'; // JWT expiry

  constructor(
    private jwtService: JwtService,
    private cacheService: CacheService,
    private i18n: I18nService,
    private contactRateLimiter: ContactRateLimiter,
  ) {}

  /**
   * Generate a 6-digit numeric OTP code
   */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Generate and store OTP for contact (email or phone)
   * Returns the OTP code and magic link token
   */
  async generateOtp(
    contact: string,
    channel: DeliveryChannel = 'email',
  ): Promise<{ code: string; magicToken: string }> {
    await this.contactRateLimiter.consume(contact);

    const code = this.generateCode();
    const now = Date.now();

    // Store OTP with TTL
    const otpRecord: OtpRecord = {
      code,
      contact,
      channel,
      expiresAt: now + this.OTP_EXPIRY_MS,
      attempts: 0,
    };
    await this.cacheService.set(
      this.otpNamespace,
      contact,
      otpRecord,
      this.OTP_EXPIRY_MS,
    );

    // Generate magic link JWT token
    const magicToken = this.jwtService.sign(
      { contact, code, channel, type: 'otp-magic' },
      { expiresIn: this.MAGIC_LINK_EXPIRY },
    );

    return { code, magicToken };
  }

  /**
   * Verify OTP code for contact (email or phone)
   * Returns true if valid, throws error if invalid
   */
  async verifyOtp(contact: string, code: string): Promise<boolean> {
    const record = await this.cacheService.get<OtpRecord>(
      this.otpNamespace,
      contact,
    );

    if (!record) {
      throw new BadRequestException(
        this.i18n.t('auth.errors.invalidVerificationCode'),
      );
    }

    const now = Date.now();

    // Check expiration
    if (now > record.expiresAt) {
      await this.cacheService.delete(this.otpNamespace, contact);
      throw new BadRequestException(
        this.i18n.t('auth.errors.expiredVerificationCode'),
      );
    }

    // Check max attempts
    if (record.attempts >= this.MAX_ATTEMPTS) {
      await this.cacheService.delete(this.otpNamespace, contact);
      throw new BadRequestException(this.i18n.t('auth.errors.tooManyAttempts'));
    }

    // Verify code
    if (record.code !== code) {
      record.attempts++;
      const ttl = record.expiresAt - now;
      await this.cacheService.set(this.otpNamespace, contact, record, ttl);
      throw new BadRequestException(
        this.i18n.t('auth.errors.invalidVerificationCodeWithAttempts', {
          args: { remaining: this.MAX_ATTEMPTS - record.attempts },
        }),
      );
    }

    // Success - remove the OTP (one-time use)
    await this.cacheService.delete(this.otpNamespace, contact);
    return true;
  }

  /**
   * Verify magic link token
   * Returns contact (email or phone) if valid, throws error if invalid
   */
  async verifyMagicToken(token: string): Promise<string> {
    try {
      const payload = this.jwtService.verify(token);

      if (payload.type !== 'otp-magic') {
        throw new BadRequestException('Invalid magic link');
      }

      // Verify the code still exists and matches
      const record = await this.cacheService.get<OtpRecord>(
        this.otpNamespace,
        payload.contact,
      );
      if (!record || record.code !== payload.code) {
        throw new BadRequestException(
          'Magic link has already been used or expired',
        );
      }

      // Success - remove the OTP (one-time use)
      await this.cacheService.delete(this.otpNamespace, payload.contact);
      return payload.contact;
    } catch (error) {
      if (
        error instanceof TokenExpiredError ||
        error instanceof JsonWebTokenError
      ) {
        const message = this.i18n.t('auth.errors.invalidToken');
        throw new AppException(
          message,
          'INVALID_TOKEN',
          HttpStatus.UNAUTHORIZED,
        );
      }
      throw error;
    }
  }
}
