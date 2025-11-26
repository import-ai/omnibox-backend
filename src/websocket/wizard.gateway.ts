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
import {
  Logger,
  UseGuards,
  UseInterceptors,
  ValidationPipe,
  HttpStatus,
} from '@nestjs/common';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { I18nService } from 'nestjs-i18n';
import { WsJwtGuard } from 'omniboxd/websocket/ws-jwt.guard';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { AgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { WsAuthOptions } from 'omniboxd/auth';
import { SharesService } from 'omniboxd/shares/shares.service';
import { ShareType } from 'omniboxd/shares/entities/share.entity';
import { UserInterceptor } from 'omniboxd/interceptor/user.interceptor';
import { WsSpanInterceptor } from 'omniboxd/interceptor/ws-span.interceptor';

@WebSocketGateway({
  cors: {
    origin: true,
    credentials: true,
  },
  namespace: '/wizard',
  path: '/api/v1/socket.io',
})
@UseInterceptors(WsSpanInterceptor, UserInterceptor)
export class WizardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WizardGateway.name);

  constructor(
    private readonly wizardService: WizardService,
    private readonly sharesService: SharesService,
    private readonly i18n: I18nService,
  ) {}

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleConnection(client: Socket) {
    this.logger.log(`Socket.IO client connected: ${client.id}`);
    this.logger.log(`Namespace: ${client.nsp.name}`);
    this.logger.log(`Transport: ${client.conn.transport.name}`);
  }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  handleDisconnect(client: Socket) {
    this.logger.log(`Socket.IO client disconnected: ${client.id}`);
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('ask')
  async handleAsk(
    @MessageBody() data: AgentRequestDto,
    @MessageBody('namespace_id', new ValidationPipe()) namespaceId: string,
    @ConnectedSocket() client: Socket,
  ) {
    await this.handleUserAgentStream(client, namespaceId, data, 'ask');
  }

  @UseGuards(WsJwtGuard)
  @SubscribeMessage('write')
  async handleWrite(
    @MessageBody() data: AgentRequestDto,
    @MessageBody('namespace_id', new ValidationPipe()) namespaceId: string,
    @ConnectedSocket() client: Socket,
  ) {
    await this.handleUserAgentStream(client, namespaceId, data, 'write');
  }

  @WsAuthOptions({ optional: true })
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('share_ask')
  async handleShareAsk(
    @MessageBody() data: AgentRequestDto,
    @MessageBody('share_id', new ValidationPipe()) shareId: string,
    @MessageBody('share_password', new ValidationPipe())
    sharePassword: string | undefined,
    @ConnectedSocket() client: Socket,
  ) {
    await this.handleShareAgentStream(
      client,
      shareId,
      sharePassword,
      data,
      'ask',
    );
  }

  @WsAuthOptions({ optional: true })
  @UseGuards(WsJwtGuard)
  @SubscribeMessage('share_write')
  async handleShareWrite(
    @MessageBody() data: AgentRequestDto,
    @MessageBody('share_id', new ValidationPipe()) shareId: string,
    @MessageBody('share_password', new ValidationPipe())
    sharePassword: string | undefined,
    @ConnectedSocket()
    client: Socket,
  ) {
    await this.handleShareAgentStream(
      client,
      shareId,
      sharePassword,
      data,
      'write',
    );
  }

  private async handleUserAgentStream(
    client: Socket,
    namespaceId: string,
    agentRequest: AgentRequestDto,
    eventType: 'ask' | 'write',
  ) {
    const userId = client.data.userId;
    const requestId = client.handshake.headers['x-request-id'] as string;

    try {
      const observable =
        await this.wizardService.streamService.createUserAgentStream(
          userId,
          namespaceId,
          agentRequest,
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

  private async handleShareAgentStream(
    client: Socket,
    shareId: string,
    sharePassword: string | undefined,
    agentRequest: AgentRequestDto,
    eventType: 'ask' | 'write',
  ) {
    const userId = client.data.userId;
    const requestId = client.handshake.headers['x-request-id'] as string;

    const share = await this.sharesService.getAndValidateShare(
      shareId,
      sharePassword,
      userId,
    );
    if (
      share.shareType !== ShareType.CHAT_ONLY &&
      share.shareType !== ShareType.ALL
    ) {
      const message = this.i18n.t('share.errors.chatNotAllowed');
      throw new AppException(message, 'CHAT_NOT_ALLOWED', HttpStatus.FORBIDDEN);
    }

    try {
      const observable =
        await this.wizardService.streamService.createShareAgentStream(
          share,
          agentRequest,
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
