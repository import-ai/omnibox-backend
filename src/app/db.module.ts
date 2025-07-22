import { DynamicModule, Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Init1751900000000 } from 'omnibox-backend/migrations/1751900000000-init';
import { UserOptions1751904560034 } from 'omnibox-backend/migrations/1751904560034-user-options';
import { Tags1751905414493 } from 'omnibox-backend/migrations/1751905414493-tags';
import { UserBindings1752652489640 } from 'omnibox-backend/migrations/1752652489640-user-bindings.ts';
import { NullUserEmail1752814358259 } from 'omnibox-backend/migrations/1752814358259-null-user-email';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';

@Module({})
export class DbModule {
  static forRoot(extraMigrations: Function[] = []): DynamicModule {
    return {
      module: DbModule,
      imports: [
        TypeOrmModule.forRootAsync({
          imports: [ConfigModule],
          inject: [ConfigService],
          useFactory: (config: ConfigService) => ({
            type: 'postgres',
            host: config.get('OBB_DB_HOST', 'postgres'),
            port: config.get('OBB_DB_PORT', 5432),
            database: config.get('OBB_DB_DATABASE', 'omnibox'),
            username: config.get('OBB_DB_USERNAME', 'omnibox'),
            password: config.get('OBB_DB_PASSWORD', 'omnibox'),
            logging: config.get('OBB_DB_LOGGING') === 'true',
            synchronize: config.get('OBB_DB_SYNC') === 'true',
            autoLoadEntities: true,
            maxQueryExecutionTime: config.get('OBB_DB_EXEC_TIME', 0),
            migrations: [
              Init1751900000000,
              Tags1751905414493,
              UserOptions1751904560034,
              UserBindings1752652489640,
              NullUserEmail1752814358259,
              ...extraMigrations,
            ],
            migrationsRun: true,
            namingStrategy: new SnakeNamingStrategy(),
          }),
        }),
      ],
    };
  }
}
