import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(
    private readonly mailerService: MailerService,
    private readonly i18n: I18nService,
  ) {}

  async sendSignUpEmail(
    email: string,
    resetUrl: string,
    lang?: string,
  ): Promise<void> {
    let subject = 'Continue completing account registration';
    let template = 'sign-up';
    if (lang?.split('-')?.at(0) === 'zh') {
      subject = '继续完成账号注册';
      template = 'sign-up-zh';
    }
    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template,
        context: {
          resetUrl,
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

  async sendPasswordEmail(
    email: string,
    resetUrl: string,
    lang?: string,
  ): Promise<void> {
    let subject = 'Password Reset Request';
    let template = 'password';
    if (lang?.split('-')?.at(0) === 'zh') {
      subject = '密码重置请求';
      template = 'password-zh';
    }
    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template,
        context: {
          resetUrl,
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
    lang?: string,
  ): Promise<void> {
    let subject = 'Email Verification';
    let template = 'email-verification';
    if (lang?.split('-')?.at(0) === 'zh') {
      subject = '邮箱验证';
      template = 'email-verification-zh';
    }
    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template,
        context: {
          code,
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
    lang?: string,
  ): Promise<void> {
    let subject = 'Invite you to join the space';
    let template = 'invite';
    if (lang?.split('-')?.at(0) === 'zh') {
      subject = '邀请您加入空间';
      template = 'invite-zh';
    }
    try {
      await this.mailerService.sendMail({
        to: email,
        subject,
        template,
        context: {
          resetUrl,
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
