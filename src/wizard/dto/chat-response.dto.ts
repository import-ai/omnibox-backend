import {
  MessageAttrs,
  OpenAIMessage,
  OpenAIMessageRole,
} from 'omniboxd/messages/entities/message.entity';

export type ChatResponseType =
  | 'bos'
  | 'delta'
  | 'eos'
  | 'done'
  | 'error'
  | 'checkpoint'
  | 'metrics'
  | 'stopped';

export interface ChatBaseResponse {
  response_type: ChatResponseType;
  event_id?: string;
}

export interface ChatBOSResponse extends ChatBaseResponse {
  response_type: 'bos';
  role: OpenAIMessageRole;
  id: string;
  parentId?: string;
  userId?: string;
  namespaceId?: string;
  attrs?: MessageAttrs;
}

export interface ChatEOSResponse extends ChatBaseResponse {
  response_type: 'eos';
  id?: string;
  role: OpenAIMessageRole;
}

export interface ChatDeltaResponse extends ChatBaseResponse {
  response_type: 'delta';
  id?: string;
  message: Partial<OpenAIMessage>;
  attrs?: MessageAttrs;
}

export interface ChatDoneResponse extends ChatBaseResponse {
  response_type: 'done';
}

export interface ChatMetricsResponse extends ChatBaseResponse {
  response_type: 'metrics';
}

export interface ChatErrorResponse extends ChatBaseResponse {
  response_type: 'error';
  id?: string;
  message: string;
}

export interface ChatStoppedResponse extends ChatBaseResponse {
  response_type: 'stopped';
  id?: string;
}

export interface ChatCheckpointResponse extends ChatBaseResponse {
  response_type: 'checkpoint';
  checkpoint: Record<string, any>;
}

export type ChatResponse =
  | ChatBOSResponse
  | ChatDeltaResponse
  | ChatEOSResponse
  | ChatDoneResponse
  | ChatMetricsResponse
  | ChatErrorResponse
  | ChatStoppedResponse
  | ChatCheckpointResponse;
