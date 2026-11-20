import { Module } from '@nestjs/common';
import { APIKeyModule } from 'omniboxd/api-key/api-key.module';
import { OpenAPIKeyController } from 'omniboxd/api-key/open.api-key.controller';
import { AttachmentsModule } from 'omniboxd/attachments/attachments.module';
import { OpenAttachmentsController } from 'omniboxd/attachments/open.attachments.controller';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { OpenResourcesController } from 'omniboxd/namespace-resources/open.resource.controller';
import { NamespacesQuotaModule } from 'omniboxd/namespaces/namespaces-quota.module';
import { OpenSkillController } from 'omniboxd/open-api/open.skill.controller';
import { OpenResourceCommentsController } from 'omniboxd/resource-comments/open.resource-comments.controller';
import { ResourceCommentsModule } from 'omniboxd/resource-comments/resource-comments.module';
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
    OpenAttachmentsController,
    OpenResourcesController,
    OpenResourceCommentsController,
    OpenWizardController,
    OpenTagController,
    OpenSearchController,
    OpenSkillController,
  ],
  exports: [],
  imports: [
    APIKeyModule,
    AttachmentsModule,
    WizardModule,
    TasksModule,
    TagModule,
    NamespacesQuotaModule,
    NamespaceResourcesModule,
    SearchModule,
    ResourceCommentsModule,
  ],
})
export class OpenAPIModule {}
