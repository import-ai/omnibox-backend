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
import {
  Message,
  OpenAIMessageRole,
} from 'src/messages/entities/message.entity';
import { DocType } from './doc-type.enum';
import {
  IndexedDocDto,
  IndexedMessageDto,
  IndexedResourceDto,
} from './dto/indexed-doc.dto';
import { PermissionsService } from 'src/permissions/permissions.service';
import { PermissionLevel } from 'src/permissions/permission-level.enum';

const indexUid = 'omniboxIdx';

@Injectable()
export class SearchService implements OnModuleInit {
  private readonly openai: OpenAI;
  private readonly meili: MeiliSearch;
  private readonly embeddingModel: string;

  constructor(
    configService: ConfigService,
    private readonly permissionsService: PermissionsService,
  ) {
    this.openai = new OpenAI({
      baseURL: configService.get('OBB_OPENAI_URL'),
      apiKey: configService.get('OBB_OPENAI_KEY'),
    });
    this.meili = new MeiliSearch({
      host: configService.get('OBB_MEILI_HOST')!,
      apiKey: configService.get('OBB_MEILI_KEY')!,
    });
    this.embeddingModel = configService.get('OBB_OPENAI_EMBEDDING_MODEL')!;
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
        const task = await this.meili.createIndex(indexUid, {
          primaryKey: 'id',
        });
        await this.meili.tasks.waitForTask(task);
        index = await this.meili.getIndex(indexUid);
      } else {
        throw e;
      }
    }

    const expectedFilters = ['namespaceId', 'userId', 'type'];
    const curFilters = (await index.getFilterableAttributes()) || [];
    const missingFilters = expectedFilters.filter(
      (f) => !curFilters.includes(f),
    );
    if (missingFilters.length > 0) {
      const newFilters = [...curFilters, ...missingFilters];
      await index.updateFilterableAttributes(newFilters);
    }

    const embedders = await index.getEmbedders();
    if (!embedders || !embedders.omniboxEmbed) {
      await index.updateEmbedders({
        omniboxEmbed: {
          source: 'userProvided',
          dimensions: 1024,
        },
      });
    }
  }

  async getEmbedding(input: string): Promise<number[]> {
    const resp = await this.openai.embeddings.create({
      model: this.embeddingModel,
      input,
    });
    return resp.data[0].embedding;
  }

  async addResource(resource: Resource) {
    const index = await this.meili.getIndex(indexUid);
    const doc: IndexedResourceDto = {
      type: DocType.RESOURCE,
      id: `resource_${resource.id}`,
      namespaceId: resource.namespace.id,
      name: resource.name,
      content: resource.content,
      _vectors: {
        omniboxEmbed: {
          embeddings: await this.getEmbedding(
            `A resource named ${resource.name} with content: ${resource.content}`,
          ),
          regenerate: false,
        },
      },
    };
    await index.addDocuments([doc]);
  }

  async addMessage(
    namespaceId: string,
    conversationId: string,
    message: Message,
  ) {
    if (!message.message.content?.trim()) {
      return;
    }
    if (
      [OpenAIMessageRole.TOOL, OpenAIMessageRole.SYSTEM].includes(
        message.message.role,
      )
    ) {
      return;
    }
    const content = message.message.content;
    const index = await this.meili.getIndex(indexUid);
    const doc: IndexedMessageDto = {
      type: DocType.MESSAGE,
      id: `message_${message.id}`,
      namespaceId: namespaceId,
      userId: message.user.id,
      conversationId,
      content,
      _vectors: {
        omniboxEmbed: {
          embeddings: await this.getEmbedding(
            `A message with content: ${content}`,
          ),
          regenerate: false,
        },
      },
    };
    await index.addDocuments([doc]);
  }

  async search(
    namespaceId: string,
    query: string,
    type?: DocType,
    userId?: string,
  ) {
    const filter = [`namespaceId = "${namespaceId}"`];
    if (userId) {
      filter.push(`userId NOT EXISTS OR userId = "${userId}"`);
    }
    if (type) {
      filter.push(`type = "${type}"`);
    }
    const searchParams: SearchParams = {
      filter,
      showRankingScore: true,
    };
    if (query) {
      searchParams.vector = await this.getEmbedding(query);
      searchParams.hybrid = {
        embedder: 'omniboxEmbed',
      };
    }
    const index = await this.meili.getIndex(indexUid);
    const result = await index.search(query, searchParams);
    const items: IndexedDocDto[] = [];
    if (userId) {
      for (const hit of result.hits) {
        hit.id = hit.id.replace(/^(message_|resource_)/, '');
        if (hit.type === DocType.RESOURCE) {
          const resource = hit as IndexedResourceDto;
          const hasPermission = await this.permissionsService.userHasPermission(
            namespaceId,
            resource.id,
            userId,
            PermissionLevel.CAN_VIEW,
          );
          if (!hasPermission) {
            continue;
          }
        }
        items.push(hit as IndexedDocDto);
      }
    }
    return items;
  }
}
