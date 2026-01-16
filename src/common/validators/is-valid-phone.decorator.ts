import {
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { validatePhone } from './phone.validator';

export interface IsValidPhoneOptions {
  allowedCountries?: string[];
}

/**
 * Custom validator decorator that validates phone numbers using libphonenumber-js.
 * Ensures the phone is in valid E.164 format and optionally restricts to specific countries.
 *
 * @param options - Optional configuration
 * @param options.allowedCountries - Array of ISO 3166-1 alpha-2 country codes (e.g., ['CN', 'US'])
 * @param validationOptions - Standard class-validator options
 *
 * @example
 * // Accept any valid E.164 phone number
 * @IsValidPhone()
 * phone: string;
 *
 * @example
 * // Only accept Chinese phone numbers
 * @IsValidPhone({ allowedCountries: ['CN'] })
 * phone: string;
 */
export function IsValidPhone(
  options?: IsValidPhoneOptions,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isValidPhone',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [options],
      validator: {
        validate(value: unknown, args: ValidationArguments) {
          if (typeof value !== 'string') {
            return false;
          }
          const [opts] = args.constraints as [IsValidPhoneOptions | undefined];
          return validatePhone(value, opts?.allowedCountries);
        },
        defaultMessage(args: ValidationArguments) {
          const [opts] = args.constraints as [IsValidPhoneOptions | undefined];
          if (opts?.allowedCountries && opts.allowedCountries.length > 0) {
            return 'validation.errors.phone.invalidForCountry';
          }
          return 'validation.errors.phone.invalid';
        },
      },
    });
  };
}
