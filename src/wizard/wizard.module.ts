import { Module } from '@nestjs/common';
import { WizardService } from 'omnibox-backend/wizard/wizard.service';
import { WizardController } from 'omnibox-backend/wizard/wizard.controller';
import { InternalWizardController } from 'omnibox-backend/wizard/internal.wizard.controller';
import { NamespacesModule } from 'omnibox-backend/namespaces/namespaces.module';
import { ResourcesModule } from 'omnibox-backend/resources/resources.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from 'omnibox-backend/tasks/tasks.entity';
import { MessagesModule } from 'omnibox-backend/messages/messages.module';
import { UserModule } from 'omnibox-backend/user/user.module';
import { AttachmentsModule } from 'omnibox-backend/attachments/attachments.module';

@Module({
  providers: [WizardService],
  imports: [
    UserModule,
    NamespacesModule,
    ResourcesModule,
    MessagesModule,
    AttachmentsModule,
    TypeOrmModule.forFeature([Task]),
  ],
  controllers: [WizardController, InternalWizardController],
  exports: [WizardService],
})
export class WizardModule {}
