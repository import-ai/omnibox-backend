import {
  parsePhoneNumber,
  isValidPhoneNumber,
  getCountryCallingCode as getCallingCode,
  CountryCode,
} from 'libphonenumber-js';

export interface ParsedPhone {
  country: string;
  nationalNumber: string;
  e164: string;
}

/**
 * Validate if a phone number is valid E.164 format and optionally
 * check if it belongs to one of the allowed countries.
 */
export function validatePhone(
  phone: string,
  allowedCountries?: string[],
): boolean {
  if (!phone || typeof phone !== 'string') {
    return false;
  }

  // Must start with + for E.164 format
  if (!phone.startsWith('+')) {
    return false;
  }

  try {
    // Check if it's a valid phone number using libphonenumber-js
    if (!isValidPhoneNumber(phone)) {
      return false;
    }

    // If allowed countries are specified, check if the phone belongs to one
    if (allowedCountries && allowedCountries.length > 0) {
      const parsed = parsePhoneNumber(phone);
      if (!parsed || !parsed.country) {
        return false;
      }
      return allowedCountries.includes(parsed.country);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Parse a phone number and extract country and national number.
 * Returns null if the phone number is invalid.
 */
export function parsePhone(phone: string): ParsedPhone | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  try {
    const parsed = parsePhoneNumber(phone);
    if (!parsed || !parsed.country) {
      return null;
    }

    return {
      country: parsed.country,
      nationalNumber: parsed.nationalNumber,
      e164: parsed.format('E.164'),
    };
  } catch {
    return null;
  }
}

/**
 * Mask a phone number for display (e.g., +86 138****1234).
 * Works with any country's phone number.
 */
export function maskPhone(phone: string): string {
  const parsed = parsePhone(phone);
  if (!parsed) {
    // Fallback: mask the raw string if parsing fails
    if (phone.length > 8) {
      return phone.slice(0, 4) + '****' + phone.slice(-4);
    }
    return phone;
  }

  const { nationalNumber, country } = parsed;
  const countryCode = getCountryCallingCode(country);

  // Mask middle digits, show first 3 and last 4
  if (nationalNumber.length > 7) {
    const maskedNational =
      nationalNumber.slice(0, 3) + '****' + nationalNumber.slice(-4);
    return `+${countryCode} ${maskedNational}`;
  }

  // For shorter numbers, just mask middle portion
  if (nationalNumber.length > 4) {
    const visibleStart = Math.ceil(nationalNumber.length / 3);
    const visibleEnd = Math.ceil(nationalNumber.length / 3);
    const maskedNational =
      nationalNumber.slice(0, visibleStart) +
      '***' +
      nationalNumber.slice(-visibleEnd);
    return `+${countryCode} ${maskedNational}`;
  }

  return `+${countryCode} ${nationalNumber}`;
}

/**
 * Get the calling code for a country.
 */
function getCountryCallingCode(country: string): string {
  try {
    return getCallingCode(country as CountryCode);
  } catch {
    return '';
  }
}

/**
 * Normalize a phone number to E.164 format.
 * If the number doesn't start with +, attempts to parse with default country.
 */
export function normalizeToE164(
  phone: string,
  defaultCountry?: string,
): string | null {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove whitespace
  phone = phone.replace(/\s/g, '');

  // Already in E.164 format
  if (phone.startsWith('+')) {
    const parsed = parsePhone(phone);
    return parsed ? parsed.e164 : null;
  }

  // Try to parse with default country
  if (defaultCountry) {
    try {
      const parsed = parsePhoneNumber(phone, defaultCountry as CountryCode);
      if (parsed && parsed.isValid()) {
        return parsed.format('E.164');
      }
    } catch {
      // Fall through
    }
  }

  return null;
}
