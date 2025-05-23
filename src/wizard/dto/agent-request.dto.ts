export type FloatPair = [number, number];

export class ToolDto {
  name: 'knowledge_search' | 'web_search';
}

export class KnowledgeSearchToolDto extends ToolDto {
  declare name: 'knowledge_search';
  namespace_id: string;
  resource_ids?: Array<string>;
  parent_ids?: Array<string>;
  created_at?: FloatPair;
  updated_at?: FloatPair;
}

export class WebSearchToolDto extends ToolDto {
  declare name: 'web_search';
  updated_at?: FloatPair;
}

export class AgentRequestDto {
  conversation_id: string;
  query: string;
  parent_message_id?: string;
  tools?: Array<KnowledgeSearchToolDto | WebSearchToolDto>;
  enable_thinking?: boolean = true;
}
