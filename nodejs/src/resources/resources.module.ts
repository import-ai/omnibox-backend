import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Resource } from 'src/resources/resources.entity';
import { ResourcesService } from 'src/resources/resources.service';
import { ResourcesController } from 'src/resources/resources.controller';
import { NamespacesModule } from 'src/namespaces/namespaces.module';

@Module({
  exports: [ResourcesService],
  providers: [ResourcesService],
  controllers: [ResourcesController],
  imports: [NamespacesModule, TypeOrmModule.forFeature([Resource])],
})
export class ResourcesModule {}
