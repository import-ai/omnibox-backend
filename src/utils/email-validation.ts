import {
  registerDecorator,
  ValidationOptions,
  ValidatorConstraint,
  ValidatorConstraintInterface,
} from 'class-validator';

export const ALLOWED_EMAIL_DOMAINS = [
  'gmail.com',
  'outlook.com',
  'hotmail.com',
  '163.com',
  'qq.com',
  '126.com',
  'foxmail.com',
  'yeah.net',
  'sina.com',
  'yahoo.com',
  'sohu.com',
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
      constraints: [
        ALLOWED_EMAIL_DOMAINS.join(', '),
        ALLOWED_EMAIL_DOMAINS.join('、'),
      ],
      validator: IsAllowedEmailDomainConstraint,
    });
  };
}
