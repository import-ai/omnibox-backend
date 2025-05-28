import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import {
  Index,
  MeiliSearch,
  MeiliSearchApiError,
  SearchParams,
} from 'meilisearch';
import { Resource } from 'src/resources/resources.entity';
import { Message } from 'src/messages/entities/message.entity';
import { DocType } from './doc-type.enum';
import { ConversationsService } from 'src/conversations/conversations.service';

const indexUid = 'idx';

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly openai: OpenAI;
  private readonly meili: MeiliSearch;
  constructor(
    private readonly configService: ConfigService,
    private readonly conversationsService: ConversationsService,
  ) {
    this.openai = new OpenAI({
      baseURL: configService.get('OBB_OPENAI_URL'),
      apiKey: configService.get('OBB_OPENAI_KEY'),
    });
    this.meili = new MeiliSearch({
      host: configService.get('OBB_MEILI_HOST')!,
      apiKey: configService.get('OBB_MEILI_KEY')!,
    });
  }

  async onModuleInit() {
    let index: Index | null = null;
    try {
      index = await this.meili.getIndex(indexUid);
    } catch (e) {
      if (
        e instanceof MeiliSearchApiError &&
        e.cause?.code === 'index_not_found'
      ) {
        await this.meili.createIndex(indexUid, {
          primaryKey: 'id',
        });
        index = await this.meili.getIndex(indexUid);
      } else {
        throw e;
      }
    }

    const filters = await index.getFilterableAttributes();
    if (!filters || filters.length === 0) {
      await index.updateFilterableAttributes(['namespaceId', 'type']);
    }

    const embedders = await index.getEmbedders();
    if (!embedders || !embedders.default) {
      await index.updateEmbedders({
        default: {
          source: 'userProvided',
          dimensions: 1024,
        },
      });
    }
  }

  async getEmbedding(input: string): Promise<number[]> {
    if (!input) {
      return new Array(1024).fill(0);
    }
    const resp = await this.openai.embeddings.create({
      model: this.configService.get('OBB_OPENAI_EMBEDDING_MODEL')!,
      input,
    });
    return resp.data[0].embedding;
  }

  async addResource(resource: Resource) {
    const index = await this.meili.getIndex(indexUid);
    await index.addDocuments([
      {
        type: DocType.RESOURCE,
        id: `resource:${resource.id}`,
        namespaceId: resource.namespace.id,
        name: resource.name,
        content: resource.content,
        _vectors: {
          default: {
            embeddings: await this.getEmbedding(resource.content),
            regenerate: false,
          },
        },
      },
    ]);
  }

  async addMessage(message: Message) {
    const conversation = await this.conversationsService.get(
      message.conversation.id,
    );
    const content = message.message.content as string;
    const index = await this.meili.getIndex(indexUid);
    await index.addDocuments([
      {
        type: DocType.MESSAGE,
        id: `message:${message.id}`,
        namespaceId: conversation!.namespace.id,
        userId: message.user.id,
        content,
        _vectors: {
          default: {
            embeddings: await this.getEmbedding(content),
            regenerate: false,
          },
        },
      },
    ]);
  }

  async search(namespaceId: string, query: string, type?: DocType) {
    const filter = [`namespaceId = "${namespaceId}"`];
    if (type) {
      filter.push(`type = "${type}"`);
    }
    const searchParams: SearchParams = {
      vector: await this.getEmbedding(query),
      hybrid: {
        embedder: 'default',
      },
      filter,
      showRankingScore: true,
    };
    const index = await this.meili.getIndex(indexUid);
    const result = await index.search(query, searchParams);
    return result.hits;
  }
}
