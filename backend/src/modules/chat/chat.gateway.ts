import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import { ChatService } from './chat.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';

interface JwtPayload {
  id: number;
  role: AuthUser['role'];
  email?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.FRONTEND_URL ?? 'http://localhost:3000',
    credentials: true,
  },
})
export class ChatGateway implements OnGatewayConnection {
  @WebSocketServer()
  server: Server;

  constructor(
    private chat: ChatService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  handleConnection(client: Socket) {
    const token = client.handshake.auth?.token as string | undefined;
    if (!token) {
      client.disconnect();
      return;
    }
    try {
      const payload = this.jwt.verify<JwtPayload>(token, {
        secret: this.config.get<string>('JWT_ACCESS_SECRET'),
      });
      client.data.user = {
        id: payload.id,
        role: payload.role,
        email: payload.email,
      } satisfies AuthUser;
    } catch {
      client.disconnect();
    }
  }

  private user(client: Socket): AuthUser {
    return client.data.user as AuthUser;
  }

  @SubscribeMessage('conversation:join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: number },
  ) {
    try {
      await this.chat.assertAccess(body.conversationId, this.user(client));
      client.join(`conversation:${body.conversationId}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('conversation:leave')
  leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: number },
  ) {
    client.leave(`conversation:${body.conversationId}`);
    return { ok: true };
  }

  @SubscribeMessage('message:send')
  async send(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: number; content: string },
  ) {
    const message = await this.chat.createMessage(
      body.conversationId,
      this.user(client),
      body.content,
    );
    this.server
      .to(`conversation:${body.conversationId}`)
      .emit('message:new', message);
    return { ok: true };
  }
}
