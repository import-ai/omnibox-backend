import { Expose } from 'class-transformer';

export class MkdirRequestDto {
  path: string;

  @Expose({ name: 'create_parents' })
  createParents: boolean;
}
