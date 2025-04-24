import { Module } from '@nestjs/common';
import { WizardService } from 'src/wizard/wizard.service';
import { WizardController } from 'src/wizard/wizard.controller';
import { InternalWizardController } from 'src/wizard/internal.wizard.controller';
import { NamespacesModule } from 'src/namespaces/namespaces.module';
import { ResourcesModule } from 'src/resources/resources.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Task } from '../tasks/tasks.entity';

@Module({
  providers: [WizardService],
  imports: [
    NamespacesModule,
    ResourcesModule,
    TypeOrmModule.forFeature([Task]),
  ],
  controllers: [WizardController, InternalWizardController],
  exports: [WizardService],
})
export class WizardModule {}
