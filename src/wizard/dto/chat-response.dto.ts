import {
  OpenAIMessage,
  OpenAIMessageRole,
  MessageAttrs,
} from 'omnibox-backend/messages/entities/message.entity';

export type ChatResponseType = 'bos' | 'delta' | 'eos' | 'done' | 'error';

export interface ChatBaseResponse {
  response_type: ChatResponseType;
}

export interface ChatBOSResponse extends ChatBaseResponse {
  response_type: 'bos';
  role: OpenAIMessageRole;
  id: string;
  parentId?: string;
  userId?: string;
  namespaceId?: string;
}

export interface ChatEOSResponse extends ChatBaseResponse {
  response_type: 'eos';
}

export interface ChatDeltaResponse extends ChatBaseResponse {
  response_type: 'delta';
  message: Partial<OpenAIMessage>;
  attrs?: MessageAttrs;
}

export interface ChatDoneResponse extends ChatBaseResponse {
  response_type: 'done';
}

export interface ChatErrorResponse extends ChatBaseResponse {
  response_type: 'error';
  message: string;
}

export type ChatResponse =
  | ChatBOSResponse
  | ChatDeltaResponse
  | ChatEOSResponse
  | ChatDoneResponse
  | ChatErrorResponse;
