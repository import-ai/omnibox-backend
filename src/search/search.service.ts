import { Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { Index, MeiliSearch, MeiliSearchApiError } from 'meilisearch';
import { Resource } from 'src/resources/resources.entity';

const indexUid = 'resources_and_chats';

enum DocType {
  RESOURCE = 'resource',
  CHAT_HISTORY = 'chat_history',
}

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly openai: OpenAI;
  private readonly meili: MeiliSearch;
  constructor(private readonly configService: ConfigService) {
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
        namespaceId: resource.namespace.id,
        id: resource.id,
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

  async search(namespaceId: string, query: string) {
    const vector = await this.getEmbedding(query);
    const index = await this.meili.getIndex(indexUid);
    const result = await index.search(query, {
      vector,
      hybrid: {
        embedder: 'default',
      },
      showRankingScore: true,
    });
    return result;
  }
}
