import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CacheService } from 'omniboxd/common/cache.service';
import { MailModule } from 'omniboxd/mail/mail.module';
import { SmsModule } from 'omniboxd/sms/sms.module';
import { User } from 'omniboxd/user/entities/user.entity';
import { UserBinding } from 'omniboxd/user/entities/user-binding.entity';
import { UserOption } from 'omniboxd/user/entities/user-option.entity';
import { UserController } from 'omniboxd/user/user.controller';
import { UserService } from 'omniboxd/user/user.service';

@Module({
  exports: [UserService],
  providers: [UserService, CacheService],
  controllers: [UserController],
  imports: [
    TypeOrmModule.forFeature([User, UserOption, UserBinding]),
    MailModule,
    SmsModule,
  ],
})
export class UserModule {}
