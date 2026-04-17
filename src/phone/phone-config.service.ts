import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PhoneConfigService {
  private readonly allowedCountries: string[];

  constructor(private readonly configService: ConfigService) {
    const countriesEnv = this.configService.get<string>(
      'OBB_PHONE_ALLOWED_COUNTRIES',
      'CN',
    );
    this.allowedCountries = countriesEnv
      .split(',')
      .map((c) => c.trim().toUpperCase())
      .filter((c) => c.length === 2);
  }

  getAllowedCountries(): string[] {
    return this.allowedCountries;
  }

  isCountryAllowed(countryCode: string): boolean {
    return this.allowedCountries.includes(countryCode.toUpperCase());
  }
}
