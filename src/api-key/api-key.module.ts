import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKey } from './api-key.entity';
import { APIKeyService } from 'omniboxd/api-key/api-key.service';
import { APIKeyController } from 'omniboxd/api-key/api-key.controller';

@Module({
  providers: [APIKeyService],
  controllers: [APIKeyController],
  imports: [TypeOrmModule.forFeature([APIKey])],
})
export class APIKeyModule {}
