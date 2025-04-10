import { CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';

export abstract class Base {
  @CreateDateColumn({
    type: 'timestamptz',
    comment: '创建时间',
  })
  created_at: Date;

  @UpdateDateColumn({
    type: 'timestamptz',
    nullable: true,
    comment: '最后更新时间',
  })
  updated_at: Date;

  @DeleteDateColumn({
    type: 'timestamptz',
    nullable: true,
    comment: '软删除时间',
  })
  deleted_at: Date;
}
