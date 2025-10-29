import { Module } from '@nestjs/common';
import { MailModule } from 'omniboxd/mail/mail.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from 'omniboxd/user/user.service';
import { User } from 'omniboxd/user/entities/user.entity';
import { UserController } from 'omniboxd/user/user.controller';
import { UserOption } from 'omniboxd/user/entities/user-option.entity';
import { UserBinding } from 'omniboxd/user/entities/user-binding.entity';
import { CacheService } from 'omniboxd/common/cache.service';

@Module({
  exports: [UserService],
  providers: [UserService, CacheService],
  controllers: [UserController],
  imports: [
    TypeOrmModule.forFeature([User, UserOption, UserBinding]),
    MailModule,
  ],
})
export class UserModule {}
