import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import { EXECUTION_STATUSES, ExecutionStatus } from './runtime-state';

export class RegisterLocalDeviceRequestDto {
  @IsUUID() id: string;
  @Matches(/^[a-f0-9]{64}$/) secret: string;
  @IsString() @IsNotEmpty() @MaxLength(120) name: string;
  @IsString() @IsNotEmpty() @MaxLength(40) platform: string;
  @IsString() @IsNotEmpty() @MaxLength(512) shell: string;
}
export class RenameLocalDeviceRequestDto {
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;
}
export class PollLocalDeviceRequestDto {
  @IsIn(['allow', 'deny', 'ask']) command_policy: 'allow' | 'deny' | 'ask';
  @IsBoolean() paused: boolean;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(255) hostname?: string;
}
export class CreateLocalExecutionRequestDto {
  @IsUUID() device_id: string;
  @IsUUID() conversation_id: string;
  @IsString() @IsNotEmpty() @MaxLength(256) tool_call_id: string;
  @IsString() @IsNotEmpty() command: string;
  @IsString() @IsNotEmpty() cwd: string;
  @IsInt() @Min(1) @Max(86400) timeout_seconds: number;
}
export class ApproveLocalExecutionRequestDto {
  @IsIn(['approve', 'reject']) decision: 'approve' | 'reject';
}
export class LocalExecutionEventRequestDto {
  @IsInt() @Min(1) sequence: number;
  @IsIn(['stdout', 'stderr', 'status', 'artifact']) kind: string;
  @IsString() data: string;
  @IsOptional() @IsIn(EXECUTION_STATUSES) status?: ExecutionStatus;
  @IsOptional() @IsInt() exit_code?: number;
}
export class ReportLocalExecutionRequestDto {
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => LocalExecutionEventRequestDto)
  events: LocalExecutionEventRequestDto[];
}
