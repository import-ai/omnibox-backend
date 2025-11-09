import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { CacheService } from 'omniboxd/common/cache.service';

type DeliveryChannel = 'email' | 'sms';

interface OtpRecord {
  code: string;
  contact: string; // email or phone number
  channel: DeliveryChannel;
  expiresAt: number;
  attempts: number;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

@Injectable()
export class OtpService {
  // Namespaces for cache keys
  private readonly otpNamespace = '/otp/codes';
  private readonly rateLimitNamespace = '/otp/rate-limits';

  // Configuration
  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ATTEMPTS = 5;
  private readonly RATE_LIMIT_MAX = 3; // max sends per window
  private readonly RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAGIC_LINK_EXPIRY = '5m'; // JWT expiry

  constructor(
    private jwtService: JwtService,
    private cacheService: CacheService,
  ) {}

  /**
   * Generate a 6-digit numeric OTP code
   */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Check rate limiting for contact (email or phone)
   */
  private async checkRateLimit(contact: string): Promise<void> {
    const now = Date.now();
    const record = await this.cacheService.get<RateLimitRecord>(
      this.rateLimitNamespace,
      contact,
    );

    if (!record || now > record.resetAt) {
      // Create new rate limit window
      const newRecord: RateLimitRecord = {
        count: 1,
        resetAt: now + this.RATE_LIMIT_WINDOW_MS,
      };
      await this.cacheService.set(
        this.rateLimitNamespace,
        contact,
        newRecord,
        this.RATE_LIMIT_WINDOW_MS,
      );
      return;
    }

    if (record.count >= this.RATE_LIMIT_MAX) {
      const remainingMinutes = Math.ceil((record.resetAt - now) / 60000);
      throw new BadRequestException(
        `Too many OTP requests. Please try again in ${remainingMinutes} minutes.`,
      );
    }

    // Increment count
    record.count++;
    const ttl = record.resetAt - now;
    await this.cacheService.set(this.rateLimitNamespace, contact, record, ttl);
  }

  /**
   * Generate and store OTP for contact (email or phone)
   * Returns the OTP code and magic link token
   */
  async generateOtp(
    contact: string,
    channel: DeliveryChannel = 'email',
  ): Promise<{ code: string; magicToken: string }> {
    await this.checkRateLimit(contact);

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
      throw new BadRequestException('Invalid or expired verification code');
    }

    const now = Date.now();

    // Check expiration
    if (now > record.expiresAt) {
      await this.cacheService.delete(this.otpNamespace, contact);
      throw new BadRequestException('Verification code has expired');
    }

    // Check max attempts
    if (record.attempts >= this.MAX_ATTEMPTS) {
      await this.cacheService.delete(this.otpNamespace, contact);
      throw new BadRequestException(
        'Too many failed attempts. Please request a new code.',
      );
    }

    // Verify code
    if (record.code !== code) {
      record.attempts++;
      const ttl = record.expiresAt - now;
      await this.cacheService.set(this.otpNamespace, contact, record, ttl);
      throw new BadRequestException(
        `Invalid verification code. ${this.MAX_ATTEMPTS - record.attempts} attempts remaining.`,
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
  }
}
