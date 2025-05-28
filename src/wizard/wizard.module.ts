import { Module } from '@nestjs/common';
import { WizardService } from 'src/wizard/wizard.service';
import { WizardController } from 'src/wizard/wizard.controller';
import { InternalWizardController } from 'src/wizard/internal.wizard.controller';
import { NamespacesModule } from 'src/namespaces/namespaces.module';
import { ResourcesModule } from 'src/resources/resources.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from 'src/tasks/tasks.entity';
import { MessagesModule } from 'src/messages/messages.module';
import { PermissionsModule } from '../permissions/permissions.module';

@Module({
  providers: [WizardService],
  imports: [
    NamespacesModule,
    ResourcesModule,
    MessagesModule,
    PermissionsModule,
    TypeOrmModule.forFeature([Task]),
  ],
  controllers: [WizardController, InternalWizardController],
  exports: [WizardService],
})
export class WizardModule {}
