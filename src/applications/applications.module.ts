import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Applications } from './applications.entity';
import { ApplicationsService } from './applications.service';
import { ApplicationsController } from './applications.controller';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { NamespacesService } from 'omniboxd/namespaces/namespaces.service';

@Module({
  providers: [ApplicationsService],
  controllers: [ApplicationsController],
  exports: [ApplicationsService],
  imports: [
    TypeOrmModule.forFeature([Applications]),
    APIKeyModule,
    NamespacesService,
  ],
})
export class ApplicationsModule {}
