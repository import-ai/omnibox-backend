import { IsNotEmpty, IsString, IsObject } from 'class-validator';

export class TraceEventDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsObject()
  props: Record<string, any>;
}
