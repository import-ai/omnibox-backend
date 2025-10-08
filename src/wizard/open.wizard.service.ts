import { Injectable } from '@nestjs/common';
import { MessagesService } from 'omniboxd/messages/messages.service';
import { ConversationsService } from 'omniboxd/conversations/conversations.service';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { User } from 'omniboxd/user/entities/user.entity';
import { OpenAgentRequestDto } from 'omniboxd/wizard/dto/open-agent-request.dto';
import { AgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { ChatResponse } from 'omniboxd/wizard/dto/chat-response.dto';

@Injectable()
export class OpenWizardService {
  constructor(
    private readonly wizardService: WizardService,
    private readonly messagesService: MessagesService,
    private readonly conversationsService: ConversationsService,
  ) {}

  async ask(
    userId: string,
    namespaceId: string,
    requestId: string,
    data: OpenAgentRequestDto,
  ): Promise<any> {
    const conversationId = await this.resolveConversationId(
      userId,
      namespaceId,
      data.parent_message_id,
    );

    const agentRequest: AgentRequestDto = {
      ...data,
      conversation_id: conversationId,
      namespace_id: namespaceId,
      enable_thinking: data.enable_thinking ?? false,
    };

    const chunks: ChatResponse[] = await this.wizardService.streamService.chat(
      userId,
      agentRequest,
      requestId,
      'ask',
    );

    return this.mergeChunks(chunks);
  }

  private async resolveConversationId(
    userId: string,
    namespaceId: string,
    parentMessageId?: string,
  ): Promise<string> {
    if (parentMessageId) {
      // Find conversation_id from parent_message_id
      const parentMessage = await this.messagesService.findOne(parentMessageId);
      return parentMessage.conversationId;
    } else {
      // Create a new conversation
      const user = { id: userId } as User;
      const conversation = await this.conversationsService.create(
        namespaceId,
        user,
      );
      return conversation.id;
    }
  }

  private mergeChunks(chunks: ChatResponse[]): any {
    const messages: any[] = [];
    let currentMessage: any = null;

    for (const chunk of chunks) {
      if (chunk.response_type === 'bos') {
        const bosChunk = chunk;
        currentMessage = {
          id: bosChunk.id,
          role: bosChunk.role,
          parent_id: bosChunk.parentId,
          message: {
            role: bosChunk.role,
          },
          attrs: {},
        };
      } else if (chunk.response_type === 'delta' && currentMessage) {
        const deltaChunk = chunk;
        if (deltaChunk.message.content) {
          currentMessage.message.content =
            (currentMessage.message.content || '') + deltaChunk.message.content;
        }
        if (deltaChunk.message.reasoning_content) {
          currentMessage.message.reasoning_content =
            (currentMessage.message.reasoning_content || '') +
            deltaChunk.message.reasoning_content;
        }
        if (deltaChunk.message.tool_calls) {
          currentMessage.message.tool_calls = deltaChunk.message.tool_calls;
        }
        if (deltaChunk.message.tool_call_id) {
          currentMessage.message.tool_call_id = deltaChunk.message.tool_call_id;
        }
        if (deltaChunk.attrs) {
          currentMessage.attrs = {
            ...currentMessage.attrs,
            ...deltaChunk.attrs,
          };
        }
      } else if (chunk.response_type === 'eos' && currentMessage) {
        messages.push(currentMessage);
        currentMessage = null;
      }
    }

    return { messages };
  }
}
