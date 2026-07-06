import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { RecommendedQuestions } from 'omniboxd/recommended-questions/entities/recommended-questions.entity';
import { RecommendedQuestionsService } from 'omniboxd/recommended-questions/recommended-questions.service';
import { RecommendedQuestionsCronService } from 'omniboxd/recommended-questions/recommended-questions-cron.service';
import { TagModule } from 'omniboxd/tag/tag.module';
import { WizardAPIModule } from 'omniboxd/wizard-api/wizard-api.module';

@Module({
  providers: [RecommendedQuestionsService, RecommendedQuestionsCronService],
  imports: [
    TypeOrmModule.forFeature([RecommendedQuestions]),
    WizardAPIModule,
    NamespacesModule,
    NamespaceResourcesModule,
    TagModule,
    ConversationsModule,
  ],
  exports: [RecommendedQuestionsService],
})
export class RecommendedQuestionsModule {}
