import { Module } from '@nestjs/common';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { OpenAPIKeyController } from 'omniboxd/api-key/open.api-key.controller';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { OpenResourcesController } from 'omniboxd/namespace-resources/open.resource.controller';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { OpenSkillController } from 'omniboxd/open-api/open.skill.controller';
import { OpenSearchController } from 'omniboxd/search/open.search.controller';
import { SearchModule } from 'omniboxd/search/search.module';
import { OpenTagController } from 'omniboxd/tag/open.tag.controller';
import { TagModule } from 'omniboxd/tag/tag.module';
import { TasksModule } from 'omniboxd/tasks/tasks.module';
import { OpenWizardController } from 'omniboxd/wizard/open.wizard.controller';
import { WizardModule } from 'omniboxd/wizard/wizard.module';

@Module({
  providers: [],
  controllers: [
    OpenAPIKeyController,
    OpenResourcesController,
    OpenWizardController,
    OpenTagController,
    OpenSearchController,
    OpenSkillController,
  ],
  exports: [],
  imports: [
    APIKeyModule,
    WizardModule,
    TasksModule,
    TagModule,
    NamespacesQuotaModule,
    NamespaceResourcesModule,
    SearchModule,
  ],
})
export class OpenAPIModule {}
