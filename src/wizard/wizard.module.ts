import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AttachmentsModule } from 'omniboxd/attachments/attachments.module';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { S3Module } from 'omniboxd/s3/s3.module';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { SmartFoldersModule } from 'omniboxd/smart-folders/smart-folders.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { UserModule } from 'omniboxd/user/user.module';
import { ChunkManagerService } from 'omniboxd/wizard/chunk-manager.service';
import { InternalWizardController } from 'omniboxd/wizard/internal.wizard.controller';
import { OpenWizardService } from 'omniboxd/wizard/open.wizard.service';
import { StreamService } from 'omniboxd/wizard/stream.service';
import {
  CollectController,
  SharedWizardController,
  WizardController,
} from 'omniboxd/wizard/wizard.controller';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { WizardAPIModule } from 'omniboxd/wizard-api/wizard-api.module';

@Module({
  providers: [
    WizardService,
    StreamService,
    ChunkManagerService,
    OpenWizardService,
  ],
  imports: [
    WizardAPIModule,
    UserModule,
    SharesModule,
    NamespacesModule,
    NamespacesQuotaModule,
    NamespaceResourcesModule,
    ResourcesModule,
    TagModule,
    MessagesModule,
    ConversationsModule,
    AttachmentsModule,
    TasksModule,
    S3Module,
    SharedResourcesModule,
    SmartFoldersModule,
    TypeOrmModule.forFeature([Task]),
  ],
  controllers: [
    WizardController,
    CollectController,
    SharedWizardController,
    InternalWizardController,
  ],
  exports: [WizardService, StreamService, OpenWizardService],
})
export class WizardModule {}
