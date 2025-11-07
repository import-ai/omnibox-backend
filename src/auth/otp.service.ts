import { Injectable, BadRequestException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

interface OtpRecord {
  code: string;
  email: string;
  expiresAt: number;
  attempts: number;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

@Injectable()
export class OtpService {
  private otpStore = new Map<string, OtpRecord>();
  private rateLimitStore = new Map<string, RateLimitRecord>();

  // Configuration
  private readonly OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
  private readonly MAX_ATTEMPTS = 5;
  private readonly RATE_LIMIT_MAX = 3; // max sends per window
  private readonly RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
  private readonly MAGIC_LINK_EXPIRY = '5m'; // JWT expiry

  constructor(private jwtService: JwtService) {
    // Clean up expired entries every minute
    setInterval(() => this.cleanup(), 60 * 1000);
  }

  /**
   * Generate a 6-digit numeric OTP code
   */
  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  /**
   * Check rate limiting for email
   */
  private checkRateLimit(email: string): void {
    const now = Date.now();
    const record = this.rateLimitStore.get(email);

    if (!record || now > record.resetAt) {
      // Create new rate limit window
      this.rateLimitStore.set(email, {
        count: 1,
        resetAt: now + this.RATE_LIMIT_WINDOW_MS,
      });
      return;
    }

    if (record.count >= this.RATE_LIMIT_MAX) {
      const remainingMinutes = Math.ceil((record.resetAt - now) / 60000);
      throw new BadRequestException(
        `Too many OTP requests. Please try again in ${remainingMinutes} minutes.`,
      );
    }

    record.count++;
  }

  /**
   * Generate and store OTP for email
   * Returns the OTP code and magic link token
   */
  generateOtp(email: string): { code: string; magicToken: string } {
    this.checkRateLimit(email);

    const code = this.generateCode();
    const now = Date.now();

    // Store OTP
    this.otpStore.set(email, {
      code,
      email,
      expiresAt: now + this.OTP_EXPIRY_MS,
      attempts: 0,
    });

    // Generate magic link JWT token
    const magicToken = this.jwtService.sign(
      { email, code, type: 'otp-magic' },
      { expiresIn: this.MAGIC_LINK_EXPIRY },
    );

    return { code, magicToken };
  }

  /**
   * Verify OTP code for email
   * Returns true if valid, throws error if invalid
   */
  verifyOtp(email: string, code: string): boolean {
    const record = this.otpStore.get(email);

    if (!record) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    const now = Date.now();

    // Check expiration
    if (now > record.expiresAt) {
      this.otpStore.delete(email);
      throw new BadRequestException('Verification code has expired');
    }

    // Check max attempts
    if (record.attempts >= this.MAX_ATTEMPTS) {
      this.otpStore.delete(email);
      throw new BadRequestException(
        'Too many failed attempts. Please request a new code.',
      );
    }

    // Verify code
    if (record.code !== code) {
      record.attempts++;
      throw new BadRequestException(
        `Invalid verification code. ${this.MAX_ATTEMPTS - record.attempts} attempts remaining.`,
      );
    }

    // Success - remove the OTP (one-time use)
    this.otpStore.delete(email);
    return true;
  }

  /**
   * Verify magic link token
   * Returns email if valid, throws error if invalid
   */
  verifyMagicToken(token: string): string {
    const payload = this.jwtService.verify(token);

    if (payload.type !== 'otp-magic') {
      throw new BadRequestException('Invalid magic link');
    }

    // Verify the code still exists and matches
    const record = this.otpStore.get(payload.email);
    if (!record || record.code !== payload.code) {
      throw new BadRequestException(
        'Magic link has already been used or expired',
      );
    }

    // Success - remove the OTP (one-time use)
    this.otpStore.delete(payload.email);
    return payload.email;
  }

  /**
   * Clean up expired OTP records and rate limits
   */
  private cleanup(): void {
    const now = Date.now();

    // Clean expired OTPs
    for (const [email, record] of this.otpStore.entries()) {
      if (now > record.expiresAt) {
        this.otpStore.delete(email);
      }
    }

    // Clean expired rate limits
    for (const [email, record] of this.rateLimitStore.entries()) {
      if (now > record.resetAt) {
        this.rateLimitStore.delete(email);
      }
    }
  }

  /**
   * Get remaining time for OTP in seconds
   */
  getRemainingTime(email: string): number {
    const record = this.otpStore.get(email);
    if (!record) return 0;

    const remaining = Math.max(0, record.expiresAt - Date.now());
    return Math.ceil(remaining / 1000);
  }
}
