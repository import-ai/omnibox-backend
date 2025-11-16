import { Module } from '@nestjs/common';
import { OpenAPIKeyController } from 'omniboxd/api-key/open.api-key.controller';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { OpenResourcesController } from 'omniboxd/namespace-resources/open.resource.controller';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { OpenWizardController } from 'omniboxd/wizard/open.wizard.controller';
import { WizardModule } from 'omniboxd/wizard/wizard.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { TagModule } from 'omniboxd/tag/tag.module';

@Module({
  providers: [],
  controllers: [
    OpenAPIKeyController,
    OpenResourcesController,
    OpenWizardController,
  ],
  exports: [],
  imports: [
    APIKeyModule,
    NamespaceResourcesModule,
    WizardModule,
    TasksModule,
    TagModule,
  ],
})
export class OpenAPIModule {}
