import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { NamespacesController } from 'src/namespaces/namespaces.controller';
import { Namespace } from './entities/namespace.entity';
import { NamespaceMember } from './entities/namespace-member.entity';

@Module({
  exports: [NamespacesService],
  providers: [NamespacesService],
  controllers: [NamespacesController],
  imports: [
    UserModule,
    TypeOrmModule.forFeature([Namespace]),
    TypeOrmModule.forFeature([NamespaceMember]),
  ],
})
export class NamespacesModule {}
