import { Body, Controller, Post } from '@nestjs/common';
import { Expose } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { Public } from 'omniboxd/auth/decorators/public.auth.decorator';

import { MessageIndexMigrationService } from './message-index-migration.service';

class RebuildMessageIndexRequestDto {
  @IsString()
  @IsNotEmpty()
  @Expose({ name: 'namespace_id' })
  namespaceId: string;
  @IsBoolean()
  @IsOptional()
  apply?: boolean;
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @Expose({ name: 'message_ids' })
  messageIds?: string[];
}

class RebuildAllMessageIndexesRequestDto {
  @IsBoolean()
  @IsOptional()
  apply?: boolean;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayNotEmpty()
  @IsNotEmpty({ each: true })
  @Expose({ name: 'namespace_ids' })
  namespaceIds?: string[];
}

@Controller('internal/api/v1')
export class MessageIndexMigrationController {
  constructor(private readonly migration: MessageIndexMigrationService) {}

  @Public()
  @Post('rebuild_message_index')
  async rebuildMessages(@Body() data: RebuildMessageIndexRequestDto) {
    return this.migration.rebuildMessageIndex(
      data.namespaceId,
      data.apply === true,
      data.messageIds,
    );
  }

  @Public()
  @Post('rebuild_all_message_indexes')
  async rebuildAllMessages(@Body() data: RebuildAllMessageIndexesRequestDto) {
    return this.migration.rebuildAllMessageIndexes(
      data.apply === true,
      data.namespaceIds,
    );
  }
}
