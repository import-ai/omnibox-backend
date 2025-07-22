import { Module } from '@nestjs/common';
import { MailModule } from 'omnibox-backend/mail/mail.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from 'omnibox-backend/user/user.service';
import { User } from 'omnibox-backend/user/entities/user.entity';
import { UserController } from 'omnibox-backend/user/user.controller';
import { UserOption } from 'omnibox-backend/user/entities/user-option.entity';
import { UserBinding } from 'omnibox-backend/user/entities/user-binding.entity';

@Module({
  exports: [UserService],
  providers: [UserService],
  controllers: [UserController],
  imports: [
    TypeOrmModule.forFeature([User, UserOption, UserBinding]),
    MailModule,
  ],
})
export class UserModule {}
