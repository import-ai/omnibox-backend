import { Injectable, Logger } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private readonly mailerService: MailerService) {}

  async sendSignUpEmail(email: string, resetUrl: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Continue completing account registration',
        template: 'sign-up',
        context: {
          resetUrl,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error('Unable to send email');
    }
  }

  async sendPasswordEmail(email: string, resetUrl: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Password Reset Request',
        template: 'password',
        context: {
          resetUrl,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error('Unable to send email');
    }
  }

  async validateEmail(email: string, code: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Email Verification',
        template: 'email-verification',
        context: {
          code,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error('Unable to send email');
    }
  }

  async sendInviteEmail(email: string, resetUrl: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: 'Invite you to join the space',
        template: 'invite',
        context: {
          resetUrl,
        },
      });
    } catch (error) {
      this.logger.error(error);
      throw new Error('Unable to send email');
    }
  }
}
