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

  async sendSignUpEmail(email: string, resetUrl: string): Promise<void> {
    const subject = this.i18n.t('mail.subjects.signUp');

    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template: 'sign-up',
        context: {
          resetUrl,
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

  async sendPasswordEmail(email: string, resetUrl: string): Promise<void> {
    const subject = this.i18n.t('mail.subjects.passwordReset');
    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template: 'password',
        context: {
          resetUrl,
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

  async validateEmail(email: string, code: string): Promise<void> {
    const subject = this.i18n.t('mail.subjects.emailVerification');

    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template: 'email-verification',
        context: {
          code,
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

  async sendInviteEmail(email: string, resetUrl: string): Promise<void> {
    const subject = this.i18n.t('mail.subjects.invite');

    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template: 'invite',
        context: {
          resetUrl,
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
}
