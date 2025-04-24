import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserRole } from 'src/user-role/user-role.entity';
import { UserRoleService } from 'src/user-role/user-role.service';
import { UserRoleController } from 'src/user-role/user-role.controller';

@Module({
  providers: [UserRoleService],
  controllers: [UserRoleController],
  imports: [TypeOrmModule.forFeature([UserRole])],
})
export class UserRoleModule {}
