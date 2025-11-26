import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { WebSocketServer as WsServer, WebSocket } from 'ws';
import { IncomingMessage } from 'http';
import { WizardService } from 'omniboxd/wizard/wizard.service';
import { AgentRequestDto } from 'omniboxd/wizard/dto/agent-request.dto';
import { SharesService } from 'omniboxd/shares/shares.service';
import { ShareType } from 'omniboxd/shares/entities/share.entity';
import { I18nService } from 'nestjs-i18n';
import { AuthService } from 'omniboxd/auth/auth.service';
import { AppException } from 'omniboxd/common/exceptions/app.exception';
import { HttpStatus } from '@nestjs/common';
import { trace, context, Span } from '@opentelemetry/api';

interface WebSocketClient extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

interface WsMessage {
  event: 'ask' | 'write' | 'share_ask' | 'share_write';
  data: AgentRequestDto;
  namespace_id?: string;
  share_id?: string;
  share_password?: string;
}

@Injectable()
export class NativeWsGateway implements OnModuleInit {
  private wss: WsServer;
  private readonly logger = new Logger(NativeWsGateway.name);
  private heartbeatInterval: NodeJS.Timeout | undefined;

  constructor(
    private readonly wizardService: WizardService,
    private readonly sharesService: SharesService,
    private readonly authService: AuthService,
    private readonly i18n: I18nService,
  ) {}

  onModuleInit() {
    this.logger.log('Initializing Native WebSocket Gateway');
  }

  initialize(server: any) {
    // 创建 WebSocket 服务器，挂载到 /api/v1/native-ws 路径（原生 WebSocket，用于小程序）
    this.wss = new WsServer({
      noServer: true, // 使用 noServer 模式，手动处理 upgrade 事件
    });

    // 手动处理 HTTP upgrade 事件，只处理指定路径的 WebSocket 连接
    server.on('upgrade', (request, socket, head) => {
      const pathname = new URL(request.url, 'http://localhost').pathname;

      // 只处理 /api/v1/native-ws 路径，其他路径完全忽略（让 Socket.IO 处理）
      if (pathname === '/api/v1/native-ws') {
        this.logger.log(`WebSocket upgrade request: ${pathname}`);
        this.logger.log('Handling native WebSocket upgrade');
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wss.emit('connection', ws, request);
        });
      }
      // 其他路径不记录日志，也不做任何处理，让 Socket.IO 自己处理
    });

    this.wss.on(
      'connection',
      (ws: WebSocketClient, request: IncomingMessage) => {
        this.handleConnection(ws, request);
      },
    );

    // 心跳检测，每 30 秒检查一次
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: WebSocketClient) => {
        if (ws.isAlive === false) {
          this.logger.warn('Terminating inactive client');
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000);

    this.logger.log(
      'Native WebSocket server initialized on path: /api/v1/native-ws',
    );
  }

  private handleConnection(ws: WebSocketClient, request: IncomingMessage) {
    // 打印连接信息
    this.logger.log('='.repeat(80));
    this.logger.log('🔌 New WebSocket connection');
    this.logger.log(`📍 URL: ${request.url}`);
    this.logger.log(`🌐 Host: ${request.headers.host}`);
    this.logger.log(
      `🔑 Headers:`,
      JSON.stringify(
        {
          authorization: request.headers.authorization
            ? '***' + request.headers.authorization?.slice(-10)
            : 'None',
          'user-agent': request.headers['user-agent'],
          'x-request-id': request.headers['x-request-id'],
        },
        null,
        2,
      ),
    );
    this.logger.log('='.repeat(80));

    ws.isAlive = true;

    // 发送握手消息
    const sessionId = this.generateSessionId();
    const handshake = {
      event: 'handshake',
      data: {
        sid: sessionId,
        pingInterval: 30000,
        pingTimeout: 5000,
        maxPayload: 1000000,
        serverTime: new Date().toISOString(),
      },
    };

    this.logger.log(`🤝 Sending handshake - Session ID: ${sessionId}`);
    ws.send(JSON.stringify(handshake));

    // 处理 pong 响应
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', (data: Buffer) => {
      void (async () => {
        try {
          const message = JSON.parse(data.toString()) as WsMessage;

          // 打印收到的消息
          this.logger.log(
            '📨 Received message:',
            JSON.stringify(
              {
                event: message.event,
                namespace_id: message.namespace_id,
                share_id: message.share_id,
                data: {
                  query:
                    message.data?.query?.substring(0, 100) +
                    (message.data?.query?.length > 100 ? '...' : ''),
                  conversation_id: message.data?.conversation_id,
                  enable_thinking: message.data?.enable_thinking,
                  tools: message.data?.tools?.map((t) => t.name),
                },
              },
              null,
              2,
            ),
          );

          await this.handleMessage(ws, message, request);
        } catch (error) {
          this.logger.error('Error parsing message:', error);
          this.logger.error('Raw data:', data.toString());
          this.sendError(ws, 'Invalid message format');
        }
      })();
    });

    ws.on('close', () => {
      this.logger.log('Client disconnected');
    });

    ws.on('error', (error) => {
      this.logger.error('WebSocket error:', error);
    });
  }

  private async handleMessage(
    ws: WebSocketClient,
    message: WsMessage,
    request: IncomingMessage,
  ) {
    const tracer = trace.getTracer('native-ws-gateway');
    const spanName = `SOCKET /api/v1/native-ws/${message.event}`;

    await tracer.startActiveSpan(
      spanName,
      {},
      context.active(),
      async (span: Span) => {
        try {
          // 验证消息数据
          this.validateMessageData(message);

          // 认证
          const token = this.extractToken(request);
          let userId: string | undefined;

          this.logger.log(
            `🔐 Authentication - Token: ${token ? '✅ Present' : '❌ Missing'}`,
          );

          if (token) {
            try {
              const payload = this.authService.jwtVerify(token);
              userId = payload.sub;
              ws.userId = userId;
              if (userId) {
                span.setAttribute('user.id', userId);
              }
              this.logger.log(
                `✅ Authentication successful - User ID: ${userId}`,
              );
            } catch (error) {
              this.logger.warn(
                `⚠️  Token verification failed: ${error.message}`,
              );
              // 对于 share_ask 和 share_write，token 是可选的
              if (
                message.event !== 'share_ask' &&
                message.event !== 'share_write'
              ) {
                const authMessage = this.i18n.t('auth.errors.unauthorized');
                throw new AppException(
                  `${authMessage}: ${error.message}`,
                  'UNAUTHORIZED',
                  HttpStatus.UNAUTHORIZED,
                );
              }
            }
          }

          const requestId =
            (request.headers['x-request-id'] as string) ||
            this.generateRequestId();

          this.logger.log(`📋 Request ID: ${requestId}`);

          switch (message.event) {
            case 'ask':
              this.logger.log(`🎯 Processing 'ask' event`);
              if (!userId) {
                const authMessage = this.i18n.t('auth.errors.noToken');
                throw new AppException(
                  `Unauthorized: ${authMessage}`,
                  'UNAUTHORIZED',
                  HttpStatus.UNAUTHORIZED,
                );
              }
              if (!message.namespace_id) {
                throw new AppException(
                  'namespace_id is required',
                  'VALIDATION_ERROR',
                  HttpStatus.BAD_REQUEST,
                );
              }
              this.logger.log(
                `📦 Parameters: namespace_id=${message.namespace_id}, conversation_id=${message.data.conversation_id}`,
              );
              await this.handleUserAgentStream(
                ws,
                userId,
                message.namespace_id,
                message.data,
                requestId,
                'ask',
              );
              break;

            case 'write':
              this.logger.log(`🎯 Processing 'write' event`);
              if (!userId) {
                const authMessage = this.i18n.t('auth.errors.noToken');
                throw new AppException(
                  `Unauthorized: ${authMessage}`,
                  'UNAUTHORIZED',
                  HttpStatus.UNAUTHORIZED,
                );
              }
              if (!message.namespace_id) {
                throw new AppException(
                  'namespace_id is required',
                  'VALIDATION_ERROR',
                  HttpStatus.BAD_REQUEST,
                );
              }
              this.logger.log(
                `📦 Parameters: namespace_id=${message.namespace_id}, conversation_id=${message.data.conversation_id}`,
              );
              await this.handleUserAgentStream(
                ws,
                userId,
                message.namespace_id,
                message.data,
                requestId,
                'write',
              );
              break;

            case 'share_ask':
              this.logger.log(`🎯 Processing 'share_ask' event`);
              if (!message.share_id) {
                throw new AppException(
                  'share_id is required',
                  'VALIDATION_ERROR',
                  HttpStatus.BAD_REQUEST,
                );
              }
              this.logger.log(
                `📦 Parameters: share_id=${message.share_id}, conversation_id=${message.data.conversation_id}`,
              );
              await this.handleShareAgentStream(
                ws,
                userId,
                message.share_id,
                message.share_password,
                message.data,
                requestId,
                'ask',
              );
              break;

            case 'share_write':
              this.logger.log(`🎯 Processing 'share_write' event`);
              if (!message.share_id) {
                throw new AppException(
                  'share_id is required',
                  'VALIDATION_ERROR',
                  HttpStatus.BAD_REQUEST,
                );
              }
              this.logger.log(
                `📦 Parameters: share_id=${message.share_id}, conversation_id=${message.data.conversation_id}`,
              );
              await this.handleShareAgentStream(
                ws,
                userId,
                message.share_id,
                message.share_password,
                message.data,
                requestId,
                'write',
              );
              break;

            default:
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              this.logger.warn(`❌ Unknown event: ${message.event}`);
              // eslint-disable-next-line @typescript-eslint/restrict-template-expressions
              this.sendError(ws, `Unknown event: ${message.event}`);
          }
        } catch (error) {
          this.logger.error('Error handling message:', error);
          this.sendError(ws, error.message || 'Internal server error');
          span.recordException(error);
        } finally {
          span.end();
        }
      },
    );
  }

  private validateMessageData(message: WsMessage): void {
    // 基本验证 AgentRequestDto 的必需字段
    if (!message.data) {
      throw new AppException(
        'data is required',
        'VALIDATION_ERROR',
        HttpStatus.BAD_REQUEST,
      );
    }

    const data = message.data;
    if (!data.query || typeof data.query !== 'string') {
      throw new AppException(
        'query is required and must be a string',
        'VALIDATION_ERROR',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!data.conversation_id || typeof data.conversation_id !== 'string') {
      throw new AppException(
        'conversation_id is required and must be a string',
        'VALIDATION_ERROR',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (typeof data.enable_thinking !== 'boolean') {
      throw new AppException(
        'enable_thinking is required and must be a boolean',
        'VALIDATION_ERROR',
        HttpStatus.BAD_REQUEST,
      );
    }
  }

  private async handleUserAgentStream(
    ws: WebSocketClient,
    userId: string,
    namespaceId: string,
    agentRequest: AgentRequestDto,
    requestId: string,
    eventType: 'ask' | 'write',
  ) {
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
          // message.data is already a JSON string, parse it before sending
          this.logger.debug(
            `📥 Received from stream - Type: ${typeof message.data}, Value: ${typeof message.data === 'string' ? message.data.substring(0, 100) : JSON.stringify(message.data).substring(0, 100)}`,
          );
          const data =
            typeof message.data === 'string'
              ? JSON.parse(message.data)
              : message.data;
          this.logger.debug(
            `📤 Sending to client - Type: ${typeof data}, Value: ${JSON.stringify(data).substring(0, 100)}`,
          );
          this.sendMessage(ws, 'message', data);
        },
        error: (error) => {
          this.logger.error(`Error in ${eventType} stream`, error);
          this.sendError(ws, error.message || 'Stream error');
        },
        complete: () => {
          this.sendMessage(ws, 'complete', {});
        },
      });
    } catch (error) {
      this.logger.error(`Error handling ${eventType}`, error);
      this.sendError(ws, error.message || 'Internal server error');
    }
  }

  private async handleShareAgentStream(
    ws: WebSocketClient,
    userId: string | undefined,
    shareId: string,
    sharePassword: string | undefined,
    agentRequest: AgentRequestDto,
    requestId: string,
    eventType: 'ask' | 'write',
  ) {
    try {
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
        throw new AppException(
          message,
          'CHAT_NOT_ALLOWED',
          HttpStatus.FORBIDDEN,
        );
      }

      const observable =
        await this.wizardService.streamService.createShareAgentStream(
          share,
          agentRequest,
          requestId,
          eventType,
        );

      observable.subscribe({
        next: (message) => {
          // message.data is already a JSON string, parse it before sending
          this.logger.debug(
            `📥 Received from stream - Type: ${typeof message.data}, Value: ${typeof message.data === 'string' ? message.data.substring(0, 100) : JSON.stringify(message.data).substring(0, 100)}`,
          );
          const data =
            typeof message.data === 'string'
              ? JSON.parse(message.data)
              : message.data;
          this.logger.debug(
            `📤 Sending to client - Type: ${typeof data}, Value: ${JSON.stringify(data).substring(0, 100)}`,
          );
          this.sendMessage(ws, 'message', data);
        },
        error: (error) => {
          this.logger.error(`Error in ${eventType} stream`, error);
          this.sendError(ws, error.message || 'Stream error');
        },
        complete: () => {
          this.sendMessage(ws, 'complete', {});
        },
      });
    } catch (error) {
      this.logger.error(`Error handling ${eventType}`, error);
      this.sendError(ws, error.message || 'Internal server error');
    }
  }

  private extractToken(request: IncomingMessage): string | undefined {
    const authHeader = request.headers.authorization;
    if (authHeader?.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // 也支持从查询参数中获取 token
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const token = url.searchParams.get('token');
    if (token?.startsWith('Bearer ')) {
      return token.substring(7);
    } else if (token) {
      return token;
    }

    return undefined;
  }

  private sendMessage(ws: WebSocketClient, event: string, data: any) {
    if (ws.readyState === WebSocket.OPEN) {
      const message = {
        event,
        data,
      };

      // 打印发送的消息（除了频繁的 message 事件）
      if (event !== 'message') {
        this.logger.log(
          `📤 Sending: ${event}`,
          JSON.stringify(message, null, 2).substring(0, 200),
        );
      }

      ws.send(JSON.stringify(message));
    }
  }

  private sendError(ws: WebSocketClient, error: string) {
    this.logger.error(`❌ Sending error: ${error}`);
    this.sendMessage(ws, 'error', { error });
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateSessionId(): string {
    return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  onModuleDestroy() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = undefined;
    }

    if (this.wss) {
      this.wss.close(() => {
        this.logger.log('WebSocket server closed');
      });
    }
  }
}
