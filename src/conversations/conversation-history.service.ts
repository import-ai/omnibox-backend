import { HttpStatus, Injectable } from '@nestjs/common';
import { I18nService } from 'nestjs-i18n';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import {
  MessageAttrs,
  MessageStatus,
  OpenAIMessage,
} from 'omniboxd/messages/entities/message.entity';
import { DataSource } from 'typeorm';

import {
  BranchNode,
  branchRelations,
  branchTurns,
  conversationBranch,
  shareableAnswerIds,
} from './conversation-branch';
import { ConversationsService } from './conversations.service';
import { ConversationPageQueryDto } from './dto/conversation-page.dto';

interface CitationSummary {
  id: string;
  title: string;
  link: string;
  index: number;
  source_message_id: string;
}
interface HistoryRow {
  id: string;
  parent_id: string | null;
  created_at: Date;
  updated_at: Date;
  status: MessageStatus;
  message: OpenAIMessage;
  attrs: MessageAttrs | null;
  has_reasoning: boolean;
  tool_call_summaries: { id: string; name: string }[];
}

const activeStatuses = [
  MessageStatus.PENDING,
  MessageStatus.STREAMING,
  MessageStatus.INTERRUPTED,
];

@Injectable()
export class ConversationHistoryService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly conversations: ConversationsService,
    private readonly i18n: I18nService,
  ) {}

  private invalid() {
    return new AppException(
      this.i18n.t('conversation.errors.invalidHistory'),
      'INVALID_CONVERSATION_HISTORY',
      HttpStatus.BAD_REQUEST,
    );
  }

  private async authorize(
    namespaceId: string,
    conversationId: string,
    userId: string,
  ) {
    return this.conversations.findOneForUserInNamespace(
      conversationId,
      userId,
      namespaceId,
    );
  }

  async page(
    namespaceId: string,
    conversationId: string,
    userId: string,
    query: ConversationPageQueryDto,
  ) {
    const conversation = await this.authorize(
      namespaceId,
      conversationId,
      userId,
    );
    if (query.branch_leaf_id && query.branch_node_id) throw this.invalid();
    // ponytail: scan lightweight topology per conversation; use recursive SQL if topology itself becomes a bottleneck.
    const nodes = await this.dataSource.query<BranchNode[]>(
      `
      SELECT id, parent_id, status, message->>'role' AS role,
        COALESCE(length(trim(message->>'content')) > 0, false) AS has_content,
        COALESCE(jsonb_array_length(message->'tool_calls') > 0, false) AS has_tool_calls,
        COALESCE(jsonb_array_length(attrs->'tool_call'->'decisions') > 0, false) AS is_decision
      FROM messages WHERE conversation_id = $1 AND user_id = $2 AND deleted_at IS NULL
      ORDER BY created_at, id`,
      [conversationId, userId],
    );
    const relations = branchRelations(nodes);
    let branch: BranchNode[];
    try {
      const selected = query.branch_node_id;
      if (selected && !nodes.some((node) => node.id === selected))
        throw this.invalid();
      branch = conversationBranch(
        nodes,
        selected ? relations.leaf(selected) : query.branch_leaf_id,
      );
    } catch {
      throw this.invalid();
    }
    const turns = branchTurns(branch);
    const end = Math.max(0, turns.length - query.offset);
    const pageNodes = turns.slice(Math.max(0, end - query.limit), end).flat();
    const rows = await this.rows(
      conversationId,
      userId,
      pageNodes.map((node) => node.id),
      false,
    );
    const rowById = new Map(rows.map((row) => [row.id, row]));
    const mapping = Object.fromEntries(
      pageNodes.map((node) => {
        const row = rowById.get(node.id);
        if (!row) throw this.invalid();
        return [
          node.id,
          {
            ...this.serialize(row),
            children: relations.children.get(node.id) ?? [],
            sibling_ids: relations.siblings(node),
            details_loaded: activeStatuses.includes(node.status),
          },
        ];
      }),
    );
    const citations = await this.citations(
      conversationId,
      userId,
      branch,
      rows,
    );
    return {
      id: conversation.id,
      title: conversation.title,
      created_at: conversation.createdAt.toISOString(),
      updated_at: conversation.updatedAt?.toISOString(),
      current_node: branch.at(-1)?.id,
      branch_leaf_id: branch.at(-1)?.id,
      mapping,
      citations: citations.items,
      citation_total: citations.total,
      offset: query.offset,
      limit: query.limit,
      total: turns.length,
      has_more: end > query.limit,
      shareable_total: shareableAnswerIds(branch).length,
    };
  }

  async details(
    namespaceId: string,
    conversationId: string,
    userId: string,
    ids: string[],
  ) {
    await this.authorize(namespaceId, conversationId, userId);
    const rows = await this.rows(conversationId, userId, ids, true);
    if (rows.length !== ids.length) throw this.invalid();
    return {
      mapping: Object.fromEntries(
        rows.map((row) => [row.id, this.serialize(row)]),
      ),
    };
  }

  private serialize(row: HistoryRow) {
    return {
      ...row,
      created_at: row.created_at.toISOString(),
      updated_at: row.updated_at.toISOString(),
    };
  }

  private async rows(
    conversationId: string,
    userId: string,
    ids: string[],
    full: boolean,
  ) {
    if (!ids.length) return [];
    return this.dataSource.query<HistoryRow[]>(
      `
      SELECT id, parent_id, created_at, updated_at, status,
        CASE WHEN $4 OR status = ANY($5::messages_status[])
          OR COALESCE(jsonb_array_length(attrs->'tool_call'->'interrupts'), 0) > 0 THEN message
        ELSE (message - 'reasoning_content' - 'tool_calls') -
          CASE WHEN message->>'role' = 'tool' THEN 'content' ELSE '__unused__' END END AS message,
        CASE WHEN $4 OR status = ANY($5::messages_status[])
          OR COALESCE(jsonb_array_length(attrs->'tool_call'->'interrupts'), 0) > 0 THEN attrs - 'context'
        ELSE (attrs - 'context' - 'citations' - 'tool_call') ||
          jsonb_build_object('citations', COALESCE((SELECT jsonb_agg(c - 'snippet') FROM jsonb_array_elements(attrs->'citations') c), '[]'::jsonb),
            'tool_call', (attrs->'tool_call') - 'interrupts' - 'operations' - 'error') END AS attrs,
        COALESCE(length(trim(message->>'reasoning_content')) > 0, false) AS has_reasoning,
        COALESCE((SELECT jsonb_agg(jsonb_build_object('id', t->>'id', 'name', t->'function'->>'name'))
          FROM jsonb_array_elements(message->'tool_calls') t), '[]'::jsonb) AS tool_call_summaries
      FROM messages WHERE conversation_id = $1 AND user_id = $2 AND id = ANY($3::uuid[]) AND deleted_at IS NULL`,
      [conversationId, userId, ids, full, activeStatuses],
    );
  }

  private async citations(
    conversationId: string,
    userId: string,
    branch: BranchNode[],
    rows: HistoryRow[],
  ) {
    if (!branch.length) return { items: [], total: 0 };
    const sources = await this.dataSource.query<
      {
        id: string;
        citations: Omit<CitationSummary, 'index' | 'source_message_id'>[];
      }[]
    >(
      `
      SELECT id, COALESCE((SELECT jsonb_agg(jsonb_build_object('id', c->>'id', 'title', c->>'title', 'link', c->>'link'))
        FROM jsonb_array_elements(attrs->'citations') c), '[]'::jsonb) AS citations
      FROM messages WHERE conversation_id = $1 AND user_id = $2 AND id = ANY($3::uuid[]) AND deleted_at IS NULL`,
      [conversationId, userId, branch.map((node) => node.id)],
    );
    const byId = new Map(
      sources.map((source) => [source.id, source.citations]),
    );
    const all = branch
      .flatMap((node) =>
        (byId.get(node.id) ?? []).map((citation) => ({
          ...citation,
          source_message_id: node.id,
        })),
      )
      .map((citation, index) => ({ ...citation, index }));
    const pageIds = new Set(rows.map((row) => row.id));
    const neededIds = new Set<string>();
    const neededIndexes = new Set<number>();
    for (const row of rows) {
      for (const match of (row.message.content ?? '').matchAll(
        /\[\[(\d+)\]\](?:\(([^)\s]+)\))?/g,
      )) {
        if (match[2]?.startsWith('C')) {
          try {
            neededIds.add(decodeURIComponent(match[2]));
          } catch {
            neededIds.add(match[2]);
          }
        } else neededIndexes.add(Number(match[1]) - 1);
      }
    }
    return {
      total: all.length,
      items: all.filter(
        (citation) =>
          pageIds.has(citation.source_message_id) ||
          neededIds.has(citation.id) ||
          neededIndexes.has(citation.index),
      ),
    };
  }
}
