export class AgentRequestDto {
  conversation_id: string;
  query: string;
  parent_message_id?: string;
  tools?: Array<string>;
  enable_thinking?: boolean = true;
}
