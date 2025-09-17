import { Message } from 'omniboxd/messages/entities/message.entity';
export type FloatPair = [number, number];

export interface ToolDto {
  name: 'private_search' | 'web_search';
}

export interface PrivateSearchResourceDto {
  name: string;
  id: string;
  type: 'resource' | 'folder';
  child_ids?: string[];
}

export interface PrivateSearchToolDto extends ToolDto {
  name: 'private_search';
  resources?: PrivateSearchResourceDto[];
  visible_resources?: PrivateSearchResourceDto[];
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
  lang?: '简体中文' | 'English';
}

export interface AgentRequestDto extends BaseAgentRequestDto {
  parent_message_id?: string;
}

export interface WizardAgentRequestDto extends BaseAgentRequestDto {
  messages: Message[];
}
