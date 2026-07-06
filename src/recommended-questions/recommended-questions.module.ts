import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConversationsModule } from 'omniboxd/conversations/conversations.module';
import { NamespaceResourcesModule } from 'omniboxd/namespace-resources/namespace-resources.module';
import { NamespacesModule } from 'omniboxd/namespaces/namespaces.module';
import { RecommendedQuestion } from 'omniboxd/recommended-questions/entities/recommended-question.entity';
import { RecommendedQuestionsController } from 'omniboxd/recommended-questions/recommended-questions.controller';
import { RecommendedQuestionsService } from 'omniboxd/recommended-questions/recommended-questions.service';
import { RecommendedQuestionsCronService } from 'omniboxd/recommended-questions/recommended-questions-cron.service';
import { TagModule } from 'omniboxd/tag/tag.module';
import { WizardAPIModule } from 'omniboxd/wizard-api/wizard-api.module';

@Module({
  controllers: [RecommendedQuestionsController],
  providers: [RecommendedQuestionsService, RecommendedQuestionsCronService],
  imports: [
    TypeOrmModule.forFeature([RecommendedQuestion]),
    WizardAPIModule,
    NamespacesModule,
    NamespaceResourcesModule,
    TagModule,
    ConversationsModule,
  ],
})
export class RecommendedQuestionsModule {}
