import { IsArray, ValidateNested } from 'class-validator';
import { i18nValidationMessage } from 'nestjs-i18n';
import { Type } from 'class-transformer';
import { TraceEventDto } from 'omniboxd/trace/dto/trace-event.dto';

export class TraceReqDto {
  @IsArray({ message: i18nValidationMessage('validation.errors.isArray') })
  @ValidateNested({ each: true })
  @Type(() => TraceEventDto)
  events: TraceEventDto[];
}
