import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { NamespacesController } from 'src/namespaces/namespaces.controller';
import { Namespace } from './entities/namespace.entity';
import { NamespaceMember } from './entities/namespace-member.entity';
import { ResourcesModule } from 'src/resources/resources.module';

@Module({
  exports: [NamespacesService],
  providers: [NamespacesService],
  controllers: [NamespacesController],
  imports: [
    UserModule,
    ResourcesModule,
    TypeOrmModule.forFeature([Namespace]),
    TypeOrmModule.forFeature([NamespaceMember]),
  ],
})
export class NamespacesModule {}
