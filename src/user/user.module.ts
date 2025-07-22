import { Module } from '@nestjs/common';
import { MailModule } from 'src/mail/mail.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserService } from 'src/user/user.service';
import { User } from 'src/user/entities/user.entity';
import { UserController } from 'src/user/user.controller';
import { UserOption } from 'src/user/entities/user-option.entity';
import { UserBinding } from 'src/user/entities/user-binding.entity';

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
