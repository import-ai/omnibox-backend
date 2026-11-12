import { Global, Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TraceModule } from 'omniboxd/trace/trace.module';

import { BehaviorInterceptor } from './behavior.interceptor';
import { BehaviorService } from './behavior.service';
import { BehaviorAction } from './behavior-action.entity';
@Global()
@Module({
  imports: [TypeOrmModule.forFeature([BehaviorAction, Task]), TraceModule],
  providers: [
    BehaviorService,
    { provide: APP_INTERCEPTOR, useClass: BehaviorInterceptor },
  ],
  exports: [BehaviorService],
})
export class BehaviorModule {}
