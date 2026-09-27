import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';

import { LocalDevice } from './entities/local-device.entity';
import {
  LocalExecution,
  LocalExecutionEvent,
} from './entities/local-execution.entity';
import {
  InternalLocalRuntimeController,
  LocalExecutionsController,
  LocalRuntimeController,
} from './local-runtime.controller';
import { LocalRuntimeService } from './local-runtime.service';
@Module({
  imports: [
    ConversationsModule,
    TypeOrmModule.forFeature([
      LocalDevice,
      LocalExecution,
      LocalExecutionEvent,
    ]),
  ],
  controllers: [
    LocalRuntimeController,
    LocalExecutionsController,
    InternalLocalRuntimeController,
  ],
  providers: [LocalRuntimeService],
  exports: [LocalRuntimeService],
})
export class LocalRuntimeModule {}
