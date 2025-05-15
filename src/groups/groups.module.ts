import { Module } from '@nestjs/common';
import { GroupsService } from './groups.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Group } from './entities/group.entity';
import { GroupUser } from './entities/group-user.entity';
import { NamespacesModule } from 'src/namespaces/namespaces.module';
import { GroupsController } from './groups.controller';

@Module({
  providers: [GroupsService],
  exports: [GroupsService],
  controllers: [GroupsController],
  imports: [
    TypeOrmModule.forFeature([Group]),
    TypeOrmModule.forFeature([GroupUser]),
    NamespacesModule,
  ],
})
export class GroupsModule {}
