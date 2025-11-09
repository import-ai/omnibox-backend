import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nContext, I18nService } from 'nestjs-i18n';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly i18n: I18nService,
  ) {}

  async sendOTPEmail(
    email: string,
    code: string,
    magicLink: string,
  ): Promise<void> {
    const subject = this.i18n.t('mail.subjects.emailOtp');

    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template: 'email-otp',
        context: {
          code,
          magicLink,
          i18nLang: I18nContext.current()?.lang,
        },
      });
    } catch (error) {
      this.logger.error({ error });
      const message = this.i18n.t('mail.errors.unableToSendEmail');
      throw new AppException(
        message,
        'UNABLE_TO_SEND_EMAIL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async validateEmail(
    email: string,
    code: string,
    username?: string,
    userLang?: string,
  ): Promise<void> {
    const lang = userLang || I18nContext.current()?.lang;
    const subject = this.i18n.t('mail.subjects.emailChangeVerification', {
      lang,
    });

    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template: 'email-verification',
        context: {
          code,
          username,
          i18nLang: lang,
        },
      });
    } catch (error) {
      this.logger.error({ error });
      const message = this.i18n.t('mail.errors.unableToSendEmail');
      throw new AppException(
        message,
        'UNABLE_TO_SEND_EMAIL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async sendEmailChangeNotification(
    email: string,
    oldEmail: string,
    newEmail: string,
    username?: string,
    userLang?: string,
  ): Promise<void> {
    const lang = userLang || I18nContext.current()?.lang;
    const subject = this.i18n.t('mail.subjects.emailChangeNotification', {
      lang,
    });

    const changeTime = new Date().toLocaleString(
      lang === 'zh' ? 'zh-CN' : 'en-US',
      {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZoneName: 'short',
      },
    );

    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template: 'email-change-notification',
        context: {
          username,
          oldEmail,
          newEmail,
          changeTime,
          i18nLang: lang,
        },
      });
    } catch (error) {
      this.logger.error({ error });
      const message = this.i18n.t('mail.errors.unableToSendEmail');
      throw new AppException(
        message,
        'UNABLE_TO_SEND_EMAIL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async sendInviteEmail(
    email: string,
    resetUrl: string,
    senderUsername: string,
    namespaceName: string,
    receiverUsername?: string,
    isExistingUser?: boolean,
    receiverLang?: string,
  ): Promise<void> {
    const lang = receiverLang || I18nContext.current()?.lang;
    const subject = this.i18n.t('mail.subjects.invite', {
      lang,
      args: { senderUsername, namespaceName },
    });

    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template: 'invite',
        context: {
          resetUrl,
          senderUsername,
          namespaceName,
          receiverUsername,
          isExistingUser: isExistingUser || false,
          i18nLang: lang,
        },
      });
    } catch (error) {
      this.logger.error({ error });
      const message = this.i18n.t('mail.errors.unableToSendEmail');
      throw new AppException(
        message,
        'UNABLE_TO_SEND_EMAIL',
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
