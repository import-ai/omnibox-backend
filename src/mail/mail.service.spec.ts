import { MailerService } from '@nestjs-modules/mailer';
import { I18nService } from 'nestjs-i18n';

import { MailService } from './mail.service';

describe('MailService', () => {
  const sendMail = jest.fn();
  const i18n = {
    t: jest.fn().mockReturnValue('Email change notification'),
  };
  const service = new MailService(
    { sendMail } as unknown as MailerService,
    i18n as unknown as I18nService,
  );

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(Date.parse('2025-12-15T06:11:00Z'));
    sendMail.mockReset().mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('formats the change time in China Standard Time', async () => {
    await service.sendEmailChangeNotification(
      'old@example.com',
      'old@example.com',
      'new@example.com',
      'user',
      'zh',
    );

    expect(sendMail).toHaveBeenCalledWith(
      expect.objectContaining({
        context: expect.objectContaining({
          changeTime: '2025年12月15日 中国标准时间 14:11',
        }),
      }),
    );
  });
});
