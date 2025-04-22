import { Injectable } from '@nestjs/common';
import { MailerService } from '@nestjs-modules/mailer';

@Injectable()
export class MailService {
  constructor(private readonly mailerService: MailerService) {}

  async sendPasswordResetEmail(email: string, resetUrl: string): Promise<void> {
    try {
      await this.mailerService.sendMail({
        to: email,
        subject: '重置密码请求',
        template: './password-reset',
        context: {
          resetUrl,
        },
      });
    } catch (error) {
      console.error('发送邮件失败:', error);
      throw new Error('无法发送重置密码邮件');
    }
  }
}
