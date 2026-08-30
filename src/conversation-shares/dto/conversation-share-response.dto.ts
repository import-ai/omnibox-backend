export interface ConversationShareGroupResponseDto {
  answer: string;
  question: string;
}

export interface ConversationShareResponseDto {
  id: string;
  summary: string;
  title: string;
  url: string;
}

export interface PublicConversationShareDto {
  groups: ConversationShareGroupResponseDto[];
  id: string;
  summary: string;
  title: string;
}
