import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const ALLOWED_EMAIL_DOMAINS = [
  'gmail.com',
  'outlook.com',
  '163.com',
  'qq.com',
];

/**
 * Check if an email domain is in the allowed list
 */
export function isAllowedEmailDomain(email: string): boolean {
  if (!email || !email.includes('@')) {
    return false;
  }
  const domain = email.split('@')[1];
  return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

@ValidatorConstraint({ async: false })
export class IsAllowedEmailDomainConstraint implements ValidatorConstraintInterface {
  validate(email: string) {
    return isAllowedEmailDomain(email);
  }

  defaultMessage() {
    return `Email domain is not allowed. Allowed domains: ${ALLOWED_EMAIL_DOMAINS.join(', ')}`;
  }
}

export function IsAllowedEmailDomain(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      constraints: [],
      validator: IsAllowedEmailDomainConstraint,
    });
  };
}
