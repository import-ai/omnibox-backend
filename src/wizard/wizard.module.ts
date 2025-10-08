import { Module } from '@nestjs/common';
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
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { OpenWizardService } from 'omniboxd/wizard/open.wizard.service';

@Module({
  providers: [WizardService, ChunkManagerService, OpenWizardService],
  imports: [
    UserModule,
    NamespacesModule,
    NamespaceResourcesModule,
    TagModule,
    MessagesModule,
    ConversationsModule,
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
