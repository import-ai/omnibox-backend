import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from 'omniboxd/websocket/ws-jwt.guard';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { AgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/wizard',
  path: '/api/v1/socket.io',
})
export class WizardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WizardGateway.name);

  constructor(private readonly wizardService: WizardService) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleConnection(client: Socket) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleDisconnect(client: Socket) {}

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('ask')
  async handleAsk(
    @MessageBody() data: AgentRequestDto,
    @ConnectedSocket() client: Socket,
  ) {
    await this.handleAgentStream(client, data, 'ask');
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('write')
  async handleWrite(
    @MessageBody() data: AgentRequestDto,
    @ConnectedSocket() client: Socket,
  ) {
    await this.handleAgentStream(client, data, 'write');
  }

  private async handleAgentStream(
    client: Socket,
    data: AgentRequestDto,
    eventType: 'ask' | 'write',
  ) {
    const userId = client.data.userId;
    const requestId = client.handshake.headers['x-request-id'] as string;

    try {
      const observable = await this.wizardService.streamService.agentStream(
        userId,
        data,
        requestId,
        eventType,
      );

      observable.subscribe({
        next: (message) => {
          client.emit('message', message.data);
        },
        error: (error) => {
          this.logger.error(`Error in ${eventType} stream`, error);
          client.emit('error', { error: error.message });
        },
        complete: () => {
          client.emit('complete');
        },
      });
    } catch (error) {
      this.logger.error(`Error handling ${eventType}`, error);
      client.emit('error', { error: error.message });
    }
  }
}
