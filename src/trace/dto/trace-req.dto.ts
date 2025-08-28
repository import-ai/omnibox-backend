import { IsArray, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { TraceEventDto } from 'omniboxd/trace/dto/trace-event.dto';

export class TraceReqDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TraceEventDto)
  events: TraceEventDto[];
}
