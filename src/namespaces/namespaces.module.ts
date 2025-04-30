import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UserModule } from 'src/user/user.module';
import { Namespace } from 'src/namespaces/namespaces.entity';
import { NamespacesService } from 'src/namespaces/namespaces.service';
import { NamespacesController } from 'src/namespaces/namespaces.controller';
import { NamespaceMembersModule } from 'src/namespace-members/namespace-members.module';

@Module({
  exports: [NamespacesService],
  providers: [NamespacesService],
  controllers: [NamespacesController],
  imports: [
    UserModule,
    TypeOrmModule.forFeature([Namespace]),
    NamespaceMembersModule,
  ],
})
export class NamespacesModule {}
