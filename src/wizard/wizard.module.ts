import { Module } from '@nestjs/common';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { WizardController } from 'omniboxd/wizard/wizard.controller';
import { InternalWizardController } from 'omniboxd/wizard/internal.wizard.controller';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { ResourcesModule } from 'omniboxd/resources/resources.module';
import { TagModule } from 'omniboxd/tag/tag.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from 'omniboxd/tasks/tasks.entity';
import { MessagesModule } from 'omniboxd/messages/messages.module';
import { UserModule } from 'omniboxd/user/user.module';
import { AttachmentsModule } from 'omniboxd/attachments/attachments.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';

@Module({
  providers: [WizardService],
  imports: [
    UserModule,
    NamespacesModule,
    ResourcesModule,
    TagModule,
    MessagesModule,
    AttachmentsModule,
    TasksModule,
    TypeOrmModule.forFeature([Task]),
  ],
  controllers: [WizardController, InternalWizardController],
  exports: [WizardService],
})
export class WizardModule {}
