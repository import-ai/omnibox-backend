export interface ConversationShareQuestionImageDto {
  attachmentId: string;
  name: string;
}

export interface ConversationShareGroupResponseDto {
  answer: string;
  question: string;
  questionImages: ConversationShareQuestionImageDto[];
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
