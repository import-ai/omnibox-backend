import { ColumnOptions, TableColumnOptions } from 'typeorm';

export function BaseColumns(): TableColumnOptions[] {
  return [
    {
      name: 'created_at',
      type: 'timestamp with time zone',
      isNullable: false,
      default: 'now()',
    },
    {
      name: 'updated_at',
      type: 'timestamp with time zone',
      isNullable: false,
      default: 'now()',
    },
    {
      name: 'deleted_at',
      type: 'timestamp with time zone',
      isNullable: true,
    },
  ];
}
