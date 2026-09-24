import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AuthController } from 'omniboxd/auth/auth.controller';
import { CaptchaGuard } from 'omniboxd/captcha/captcha.guard';
import { UserController } from 'omniboxd/user/user.controller';

import { OtpThrottlerGuard } from './otp-throttler.guard';

const guardsOf = (proto: object, method: string): string[] => {
  const handler = (proto as Record<string, object>)[method];
  const guards = Reflect.getMetadata(GUARDS_METADATA, handler) as
    | Array<{ name: string }>
    | undefined;
  return (guards ?? []).map((guard) => guard.name);
};

describe('OTP send endpoint guard order', () => {
  // The IP limit must be evaluated before the captcha guard so that a flood is
  // rejected without spending a paid Aliyun verification. Nest executes handler
  // guards in registration order, so OtpThrottlerGuard has to come first in the
  // handler's guard metadata.
  it.each([
    ['auth/send-otp', AuthController.prototype, 'sendEmailOtp'],
    ['auth/send-signup-otp', AuthController.prototype, 'sendSignupOtp'],
    ['auth/send-phone-otp', AuthController.prototype, 'sendPhoneOtp'],
    [
      'auth/send-signup-phone-otp',
      AuthController.prototype,
      'sendSignupPhoneOtp',
    ],
    ['user/email/validate', UserController.prototype, 'validateEmail'],
    ['user/phone/send-code', UserController.prototype, 'sendPhoneCode'],
  ])(
    'registers the IP guard before the captcha guard on %s',
    (_route, proto, method) => {
      expect(guardsOf(proto, method)).toEqual([
        OtpThrottlerGuard.name,
        CaptchaGuard.name,
      ]);
    },
  );
});
