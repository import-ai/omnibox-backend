import { Module } from '@nestjs/common';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import {
  CollectController,
  SharedWizardController,
  WizardController,
} from 'omniboxd/wizard/wizard.controller';
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
import { S3Module } from 'omniboxd/s3/s3.module';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { OpenWizardService } from 'omniboxd/wizard/open.wizard.service';
import { SharedResourcesModule } from 'omniboxd/shared-resources/shared-resources.module';
import { SharesModule } from 'omniboxd/shares/shares.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';

@Module({
  providers: [WizardService, ChunkManagerService, OpenWizardService],
  imports: [
    UserModule,
    SharesModule,
    NamespacesModule,
    NamespaceResourcesModule,
    ResourcesModule,
    TagModule,
    MessagesModule,
    ConversationsModule,
    AttachmentsModule,
    TasksModule,
    S3Module,
    SharedResourcesModule,
    TypeOrmModule.forFeature([Task]),
  ],
  controllers: [
    WizardController,
    CollectController,
    SharedWizardController,
    InternalWizardController,
  ],
  exports: [WizardService, OpenWizardService],
})
export class WizardModule {}
