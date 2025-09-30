import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Logger, UseGuards } from '@nestjs/common';
import { WsJwtGuard } from 'omniboxd/wizard/ws-jwt.guard';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { AgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { User } from 'omniboxd/user/entities/user.entity';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/wizard',
})
export class WizardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WizardGateway.name);

  constructor(private readonly wizardService: WizardService) {}

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('ask')
  async handleAsk(
    @MessageBody() data: AgentRequestDto,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user as User;
    const requestId = client.handshake.headers['x-request-id'] as string;

    try {
      const observable = await this.wizardService.streamService.agentStream(
        user,
        data,
        requestId,
        'ask',
      );

      observable.subscribe({
        next: (message) => {
          client.emit('message', message.data);
        },
        error: (error) => {
          this.logger.error('Error in ask stream', error);
          client.emit('error', { error: error.message });
        },
        complete: () => {
          client.emit('complete');
        },
      });
    } catch (error) {
      this.logger.error('Error handling ask', error);
      client.emit('error', { error: error.message });
    }
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('write')
  async handleWrite(
    @MessageBody() data: AgentRequestDto,
    @ConnectedSocket() client: Socket,
  ) {
    const user = client.data.user as User;
    const requestId = client.handshake.headers['x-request-id'] as string;

    try {
      const observable = await this.wizardService.streamService.agentStream(
        user,
        data,
        requestId,
        'write',
      );

      observable.subscribe({
        next: (message) => {
          client.emit('message', message.data);
        },
        error: (error) => {
          this.logger.error('Error in write stream', error);
          client.emit('error', { error: error.message });
        },
        complete: () => {
          client.emit('complete');
        },
      });
    } catch (error) {
      this.logger.error('Error handling write', error);
      client.emit('error', { error: error.message });
    }
  }
}
