import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { APIKey } from './api-key.entity';

@Module({
  imports: [TypeOrmModule.forFeature([APIKey])],
})
export class APIKeyModule {}
