import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Headers,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';
import { HeaderUserId } from 'omniboxd/decorators/header-user-id.decorator';
import { UserId } from 'omniboxd/decorators/user-id.decorator';

import {
  ApproveLocalExecutionRequestDto,
  CreateLocalExecutionRequestDto,
  PollLocalDeviceRequestDto,
  RegisterLocalDeviceRequestDto,
  RenameLocalDeviceRequestDto,
  ReportLocalExecutionRequestDto,
} from './local-runtime.dto';
import { LocalRuntimeService } from './local-runtime.service';

@Controller('api/v1/local-devices')
export class LocalRuntimeController {
  constructor(private readonly service: LocalRuntimeService) {}
  @Get() list(@UserId() userId: string) {
    return this.service.list(userId);
  }
  @Post() register(
    @UserId() userId: string,
    @Body() dto: RegisterLocalDeviceRequestDto,
  ) {
    return this.service.register(userId, dto);
  }
  @Patch(':id') rename(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RenameLocalDeviceRequestDto,
  ) {
    return this.service.rename(userId, id, dto.name);
  }
  @Delete(':id') revoke(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.revoke(userId, id);
  }
  @Post(':id/poll') async poll(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('x-device-key') secret: string,
    @Body() dto: PollLocalDeviceRequestDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const abort = new AbortController();
    const close = () => abort.abort();
    res.on('close', close);
    res.setHeader('Cache-Control', 'no-store');
    try {
      return {
        instruction: await this.service.poll(
          userId,
          id,
          secret ?? '',
          dto,
          abort.signal,
        ),
      };
    } finally {
      res.off('close', close);
    }
  }
  @Post(':id/executions/:executionId/events') report(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('executionId', ParseUUIDPipe) executionId: string,
    @Headers('x-device-key') secret: string,
    @Body() dto: ReportLocalExecutionRequestDto,
  ) {
    return this.service.report(userId, id, secret ?? '', executionId, dto);
  }
}

@Controller('api/v1/local-executions')
export class LocalExecutionsController {
  constructor(private readonly service: LocalRuntimeService) {}
  @Get() list(
    @UserId() userId: string,
    @Query('conversation_id') conversationId: string | undefined,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.service.executions(userId, conversationId, offset);
  }
  @Get(':id') get(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.execution(userId, id);
  }
  @Get(':id/events') events(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('after', new DefaultValuePipe(0), ParseIntPipe) after: number,
  ) {
    return this.service.events(userId, id, after);
  }
  @Post(':id/decision') decide(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ApproveLocalExecutionRequestDto,
  ) {
    return this.service.decide(userId, id, dto.decision);
  }
  @Post(':id/cancel') cancel(
    @UserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.cancel(userId, id);
  }
}

// Internal routes follow the existing trusted service network contract. They must never be publicly proxied.
@Public()
@Controller('internal/api/v1/namespaces/:namespaceId/local-runtime')
export class InternalLocalRuntimeController {
  constructor(private readonly service: LocalRuntimeService) {}
  @Get('devices') list(@HeaderUserId() userId: string) {
    return this.service.list(userId);
  }
  @Post('executions') create(
    @HeaderUserId() userId: string,
    @Param('namespaceId') namespaceId: string,
    @Body() dto: CreateLocalExecutionRequestDto,
  ) {
    return this.service.create(userId, namespaceId, dto);
  }
  @Get('executions/:id') get(
    @HeaderUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.service.execution(userId, id);
  }
  @Get('executions/:id/events') events(
    @HeaderUserId() userId: string,
    @Param('id', ParseUUIDPipe) id: string,
    @Query('after', new DefaultValuePipe(0), ParseIntPipe) after: number,
  ) {
    return this.service.events(userId, id, after);
  }
}
