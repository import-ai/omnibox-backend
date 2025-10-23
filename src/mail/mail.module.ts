import * as path from 'path';
import { Module } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { MailService } from 'omniboxd/mail/mail.service';
import { MailerModule } from '@nestjs-modules/mailer';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { HandlebarsAdapter } from '@nestjs-modules/mailer/dist/adapters/handlebars.adapter';

@Module({
  exports: [MailService],
  providers: [MailService],
  imports: [
    MailerModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService, I18nService],
      useFactory: (config: ConfigService, i18n: I18nService) => ({
        transport: config.get('OBB_MAIL_TRANSPORT'),
        defaults: {
          from: config.get('OBB_MAIL_FROM'),
        },
        template: {
          dir: path.join(__dirname, '/templates'),
          adapter: new HandlebarsAdapter({ t: i18n.hbsHelper }),
          options: {
            strict: true,
          },
        },
      }),
    }),
  ],
})
export class MailModule {}
