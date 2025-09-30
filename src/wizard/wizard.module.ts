import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { WizardController } from 'omniboxd/wizard/wizard.controller';
import { InternalWizardController } from 'omniboxd/wizard/internal.wizard.controller';
import { ChunkManagerService } from 'omniboxd/wizard/chunk-manager.service';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { UserModule } from 'omniboxd/user/user.module';
import { AttachmentsModule } from 'omniboxd/attachments/attachments.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { MinioModule } from 'omniboxd/minio/minio.module';
import { OpenWizardController } from 'omniboxd/wizard/open.wizard.controller';
import { WizardGateway } from 'omniboxd/wizard/wizard.gateway';
import { WsJwtGuard } from 'omniboxd/wizard/ws-jwt.guard';

@Module({
  providers: [WizardService, ChunkManagerService, WizardGateway, WsJwtGuard],
  imports: [
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get('OBB_JWT_SECRET'),
        signOptions: { expiresIn: config.get('OBB_JWT_EXPIRE', '2678400s') },
      }),
    }),
    UserModule,
    NamespacesModule,
    NamespaceResourcesModule,
    TagModule,
    MessagesModule,
    AttachmentsModule,
    TasksModule,
    MinioModule,
    TypeOrmModule.forFeature([Task]),
  ],
  controllers: [
    WizardController,
    InternalWizardController,
    OpenWizardController,
  ],
  exports: [WizardService],
})
export class WizardModule {}
