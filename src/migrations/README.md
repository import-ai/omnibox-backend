# Database Migrations

This directory contains TypeORM database migrations for the Omnibox backend application.

## Overview

Migrations are used to version control database schema changes and ensure consistent database structure across different environments (development, staging, production).

## File Structure

- **Migration files**: Named with timestamp prefix (e.g., `1751900000000-init.ts`)
- **base-columns.ts**: Common column definitions used across multiple tables

## Migration Naming Convention

Migration files follow the pattern: `{timestamp}-{description}.ts`

- **Timestamp**: Unix timestamp in milliseconds when the migration was created
- **Description**: Brief description of the changes (kebab-case)

Examples:
- `1751900000000-init.ts` - Initial database setup
- `1754550165406-api-keys.ts` - API keys table creation
- `1751905414493-tags.ts` - Tags functionality

## Common Patterns

### Base Columns

All tables include standard audit columns defined in `base-columns.ts`:
- `created_at`: Timestamp when record was created
- `updated_at`: Timestamp when record was last updated  
- `deleted_at`: Timestamp for soft deletion (nullable)

### Table Structure

Most tables follow this pattern:
```typescript
{
  name: 'id',
  type: 'uuid',
  isPrimary: true,
  default: 'uuid_generate_v4()',
}
```

### Foreign Keys

Foreign key relationships are defined in the `foreignKeys` array:
```typescript
foreignKeys: [
  {
    columnNames: ['user_id'],
    referencedTableName: 'users',
    referencedColumnNames: ['id'],
  },
]
```

## Current Database Schema

The migrations create the following main tables:

1. **users** - User accounts and authentication
2. **namespaces** - Workspace/organization containers
3. **conversations** - Chat conversations
4. **messages** - Individual messages within conversations
5. **attachments** - File attachments
6. **tags** - Tagging system
7. **shares** - Sharing functionality
8. **api_keys** - API key authentication
9. **groups** - User groups and permissions
10. **invitations** - User invitation system
11. **tasks** - Task management
12. **resources** - Resource management

## How Migrations Work

This project uses **automatic migration execution** - migrations run automatically when the application starts.

### Configuration

Migrations are configured in `src/app/app.module.ts`:
- All migration classes are imported and registered in the `migrations` array
- `migrationsRun: true` ensures migrations execute on application startup
- No separate CLI commands are needed

### Development
```bash
# Migrations run automatically when you start the app
pnpm start:dev

# Or when building and running
pnpm build
pnpm start:prod
```

### Production
Migrations run automatically when the application starts. The deployment process should:
1. Build the application
2. Start the application (migrations run automatically)
3. Application becomes ready to serve requests

## Creating New Migrations

### Manual Creation Process

1. **Create migration file**:
   - Use timestamp prefix: `{Date.now()}-description.ts`
   - Example: `1754550165406-add-new-feature.ts`

2. **Implement migration class**:
   ```typescript
   export class YourFeatureName1234567890123 implements MigrationInterface {
     public async up(queryRunner: QueryRunner): Promise<void> {
       // Your migration logic here
     }

     public async down(queryRunner: QueryRunner): Promise<void> {
       // Rollback logic here
     }
   }
   ```

3. **Register in app.module.ts**:
   - Import your migration class
   - Add it to the `migrations` array in TypeORM configuration

4. **Best practices**:
   - Always include both `up()` and `down()` methods
   - Test migrations in development environment first
   - Use `BaseColumns()` for standard audit fields
   - Add appropriate indexes for performance
   - Include foreign key constraints for data integrity

## Migration Template

```typescript
import { MigrationInterface, QueryRunner, Table } from 'typeorm';
import { BaseColumns } from './base-columns';

export class YourFeatureName1234567890123 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Example: Create a new table
    const table = new Table({
      name: 'your_table',
      columns: [
        {
          name: 'id',
          type: 'uuid',
          isPrimary: true,
          default: 'uuid_generate_v4()',
        },
        {
          name: 'name',
          type: 'character varying',
          isNullable: false,
        },
        ...BaseColumns(),
      ],
    });
    await queryRunner.createTable(table, true, true, true);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('your_table');
  }
}
```

## Registration Example

After creating your migration, add it to `src/app/app.module.ts`:

```typescript
// Import your migration
import { YourFeatureName1234567890123 } from 'omniboxd/migrations/1234567890123-your-feature-name';

// Add to migrations array
migrations: [
  Init1751900000000,
  Tags1751905414493,
  UserOptions1751904560034,
  UserBindings1752652489640,
  NullUserEmail1752814358259,
  Shares1753866547335,
  ApiKeys1754550165406,
  YourFeatureName1234567890123, // Add your migration here
  ...extraMigrations,
],
```

## Important Notes

- **Never modify existing migration files** after they've been run in production
- **Always backup database** before running migrations in production
- **Test migrations thoroughly** in development and staging environments
- **Coordinate with team** when creating migrations that affect shared development databases
- **Use descriptive names** that clearly indicate what the migration does

## Troubleshooting

### Common Issues

1. **Migration fails on startup**: Check application logs for specific error messages
2. **Foreign key constraints**: Ensure referenced tables exist before creating foreign keys
3. **Data type mismatches**: Verify column types match application entity definitions
4. **Index conflicts**: Check for existing indexes before creating new ones
5. **Missing registration**: Ensure new migrations are imported and added to the migrations array

### Recovery

If a migration fails:
1. **Development**: Fix the migration file and restart the application
2. **Production**: Create a new migration to fix the issue (never modify existing migrations that have run in production)
3. **Database corruption**: Restore from backup and apply fixed migrations
4. **Check logs**: Application startup logs will show which migration failed and why

## Related Documentation

- [TypeORM Migrations](https://typeorm.io/migrations)
- [NestJS Database](https://docs.nestjs.com/techniques/database)
