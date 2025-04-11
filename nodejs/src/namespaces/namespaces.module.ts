import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { NamespacesService } from './namespaces.service';
import { NamespacesController } from './namespaces.controller';
import { Namespace } from './namespaces.entity';
import { Resource } from 'src/resources/resources.entity';

@Module({
  imports: [TypeOrmModule.forFeature([Namespace, Resource])],
  providers: [NamespacesService],
  controllers: [NamespacesController],
})
export class NamespacesModule {}
