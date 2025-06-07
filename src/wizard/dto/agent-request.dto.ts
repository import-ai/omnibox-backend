import { ResourceType } from 'src/resources/resources.entity';

export type FloatPair = [number, number];

export interface ToolDto {
  name: 'private_search' | 'web_search';
}

export interface PrivateSearchResourceDto {
  name: string;
  id: string;
  resource_type: ResourceType;
  child_ids?: string[];
}

export interface PrivateSearchToolDto extends ToolDto {
  name: 'private_search';
  namespace_id: string;
  resources?: PrivateSearchResourceDto[];
  visible_resource_ids?: string[];
}

export interface WebSearchToolDto extends ToolDto {
  name: 'web_search';
  updated_at?: FloatPair;
}

export interface BaseAgentRequestDto {
  query: string;
  conversation_id: string;
  tools: Array<PrivateSearchToolDto | WebSearchToolDto>;
  enable_thinking: boolean;
}

export interface AgentRequestDto extends BaseAgentRequestDto {
  namespace_id: string;
  parent_message_id?: string;
}

export interface WizardAgentRequestDto extends BaseAgentRequestDto {
  messages: Record<string, any>[];
  current_cite_cnt: number;
}
