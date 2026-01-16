import {
  parsePhoneNumberFromString,
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
  if (!phone) {
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

    const parsed = parsePhoneNumberFromString(phone);
    if (!parsed || !parsed.country) {
      return false;
    }

    // If allowed countries are specified, check if the phone belongs to one
    if (allowedCountries && allowedCountries.length > 0) {
      if (!allowedCountries.includes(parsed.country)) {
        return false;
      }
    }

    // Chinese mobile number validation: 11 digits starting with 1[3-9]
    // Matches frontend validation in web/src/lib/validation-schemas.ts
    if (parsed.country === 'CN') {
      const nationalNumber = parsed.nationalNumber;
      if (!/^1[3-9]\d{9}$/.test(nationalNumber)) {
        return false;
      }
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
  if (!phone) {
    return null;
  }

  try {
    const parsed = parsePhoneNumberFromString(phone);
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
