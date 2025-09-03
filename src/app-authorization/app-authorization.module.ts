import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppAuthorization } from './app-authorization.entity';
import { AppAuthorizationService } from './app-authorization.service';
import { AppAuthorizationController } from './app-authorization.controller';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';

@Module({
  providers: [AppAuthorizationService],
  controllers: [AppAuthorizationController],
  exports: [AppAuthorizationService],
  imports: [TypeOrmModule.forFeature([AppAuthorization]), NamespacesModule],
})
export class AppAuthorizationModule {}
