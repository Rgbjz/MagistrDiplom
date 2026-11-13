import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Logger, OnModuleInit } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import type { Server, Socket } from 'socket.io';
import { allowedOrigins } from '../../common/utils/origins';
import { ChatService } from './chat.service';
import {
  CallError,
  CallService,
  callSummary,
  declinedSummary,
  type ActiveCall,
  type CallMedia,
  type MediaState,
} from './call.service';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import type { LocalizedText } from '../../common/i18n';

interface JwtPayload {
  id: number;
  role: AuthUser['role'];
  email?: string;
}

interface SocketData {
  user?: AuthUser;
}

interface CallBody {
  conversationId: number;
}

/** call:start / call:join: what the client is about to send. */
interface EnterCallBody extends CallBody {
  /** call:start only — 'audio' starts a voice call (camera off). */
  media?: CallMedia;
  audio?: boolean;
  video?: boolean;
}

function mediaOf(value: unknown): CallMedia {
  return value === 'audio' ? 'audio' : 'video';
}

function stateOf(body: EnterCallBody): MediaState {
  return {
    audio: typeof body?.audio === 'boolean' ? body.audio : undefined,
    video: typeof body?.video === 'boolean' ? body.video : undefined,
  };
}

interface SignalBody extends CallBody {
  toUserId: number;
  data: unknown;
}

interface StateBody extends CallBody {
  audio?: boolean;
  video?: boolean;
  screen?: boolean;
}

/** `call:peer-joined` payload: who joined and whether their camera is on. */
function peerJoined(call: ActiveCall, userId: number, name: string) {
  const p = call.participants.find((x) => x.userId === userId);
  return {
    conversationId: call.conversationId,
    userId,
    name,
    audio: p?.audio ?? true,
    video: p?.video ?? true,
  };
}

const userRoom = (id: number) => `user:${id}`;
const callRoom = (conversationId: number) => `call:${conversationId}`;

function toId(value: unknown): number | null {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

@WebSocketGateway({
  cors: {
    // Evaluated per request: .env is loaded after decorators run.
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => cb(null, !origin || allowedOrigins().includes(origin)),
    credentials: true,
  },
})
export class ChatGateway
  implements OnGatewayConnection, OnGatewayDisconnect, OnModuleInit
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(ChatGateway.name);

  constructor(
    private chat: ChatService,
    private calls: CallService,
    private jwt: JwtService,
    private config: ConfigService,
  ) {}

  onModuleInit() {
    // The ring-timeout job may run on any instance; the Redis adapter
    // delivers the resulting `call:ended` to whichever instance holds the
    // sockets.
    this.calls.onRingTimeout((expired) => this.finishCall(expired));
  }

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
      (client.data as SocketData).user = {
        id: payload.id,
        role: payload.role,
        email: payload.email,
      };
      // Personal room: incoming calls reach the user on any page.
      void client.join(userRoom(payload.id));
    } catch {
      client.disconnect();
    }
  }

  async handleDisconnect(client: Socket) {
    for (const { conversationId, userId } of await this.calls.dropSocket(
      client.id,
    )) {
      await this.leaveCall(conversationId, userId);
    }
  }

  private user(client: Socket): AuthUser {
    return (client.data as SocketData).user as AuthUser;
  }

  @SubscribeMessage('conversation:join')
  async join(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: number },
  ) {
    try {
      await this.chat.assertAccess(body.conversationId, this.user(client));
      await client.join(`conversation:${body.conversationId}`);
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  @SubscribeMessage('conversation:leave')
  async leave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: { conversationId: number },
  ) {
    await client.leave(`conversation:${body.conversationId}`);
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

  // ===== Video calls (WebRTC mesh; this gateway only relays signaling) =====

  @SubscribeMessage('call:start')
  async callStart(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: EnterCallBody,
  ) {
    const conversationId = toId(body?.conversationId);
    if (!conversationId) return { ok: false, error: 'BAD_REQUEST' };
    const user = this.user(client);
    try {
      await this.chat.assertAccess(conversationId, user);
      const [card, ctx] = await Promise.all([
        this.chat.userCard(user.id),
        this.chat.callContext(conversationId, user.id),
      ]);
      const { call, created } = await this.calls.start({
        conversationId,
        type: ctx.type,
        media: mediaOf(body?.media),
        user: { id: user.id, name: card.name },
        socketId: client.id,
        invited: ctx.invited,
        state: stateOf(body),
      });
      await client.join(callRoom(conversationId));
      if (created) {
        const ring = {
          conversationId,
          type: ctx.type,
          media: call.media,
          title:
            ctx.type === 'COURSE'
              ? ctx.courseTitle
              : ctx.type === 'GROUP'
                ? ctx.groupTitle
                : card.name,
          from: card,
        };
        for (const id of ctx.invited) {
          this.server.to(userRoom(id)).emit('call:ring', ring);
        }
      } else {
        client
          .to(callRoom(conversationId))
          .emit('call:peer-joined', peerJoined(call, user.id, card.name));
      }
      return {
        ok: true,
        created,
        call: await this.calls.info(conversationId),
      };
    } catch (err) {
      return this.callFailure(client, conversationId, err);
    }
  }

  @SubscribeMessage('call:join')
  async callJoin(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: EnterCallBody,
  ) {
    const conversationId = toId(body?.conversationId);
    if (!conversationId) return { ok: false, error: 'BAD_REQUEST' };
    const user = this.user(client);
    try {
      await this.chat.assertAccess(conversationId, user);
      const card = await this.chat.userCard(user.id);
      const call = await this.calls.join(
        conversationId,
        { id: user.id, name: card.name },
        client.id,
        stateOf(body),
      );
      await client.join(callRoom(conversationId));
      client
        .to(callRoom(conversationId))
        .emit('call:peer-joined', peerJoined(call, user.id, card.name));
      // The joiner sends offers to everyone already in the call (no glare).
      return { ok: true, call: await this.calls.info(conversationId) };
    } catch (err) {
      return this.callFailure(client, conversationId, err);
    }
  }

  @SubscribeMessage('call:signal')
  async callSignal(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: SignalBody,
  ) {
    const conversationId = toId(body?.conversationId);
    const toUserId = toId(body?.toUserId);
    if (!conversationId || !toUserId)
      return { ok: false, error: 'BAD_REQUEST' };
    const user = this.user(client);
    try {
      const target = await this.calls.relayTarget(
        conversationId,
        user.id,
        toUserId,
      );
      this.server.to(target).emit('call:signal', {
        conversationId,
        fromUserId: user.id,
        data: body.data,
      });
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        error: err instanceof CallError ? err.code : 'ERROR',
      };
    }
  }

  @SubscribeMessage('call:state')
  async callState(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: StateBody,
  ) {
    const conversationId = toId(body?.conversationId);
    if (!conversationId) return { ok: false, error: 'BAD_REQUEST' };
    const user = this.user(client);
    if (!(await this.calls.setMediaState(conversationId, user.id, body))) {
      return { ok: false, error: 'NOT_IN_CALL' };
    }
    client.to(callRoom(conversationId)).emit('call:state', {
      conversationId,
      userId: user.id,
      audio: body.audio,
      video: body.video,
      screen: body.screen,
    });
    return { ok: true };
  }

  @SubscribeMessage('call:decline')
  async callDecline(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: CallBody,
  ) {
    const conversationId = toId(body?.conversationId);
    if (!conversationId) return { ok: false, error: 'BAD_REQUEST' };
    const user = this.user(client);
    const call = await this.calls.get(conversationId);
    if (!call || !call.invited.includes(user.id)) return { ok: true };
    this.server
      .to(callRoom(conversationId))
      .emit('call:declined', { conversationId, userId: user.id });
    // A declined 1:1 call is over; in a group call the others keep ringing.
    if (call.type === 'DIRECT' && !call.connectedAt) {
      const ended = await this.calls.remove(conversationId);
      if (ended) await this.finishCall(ended, declinedSummary(ended));
    }
    return { ok: true };
  }

  @SubscribeMessage('call:leave')
  async callLeave(
    @ConnectedSocket() client: Socket,
    @MessageBody() body: CallBody,
  ) {
    const conversationId = toId(body?.conversationId);
    if (!conversationId) return { ok: false, error: 'BAD_REQUEST' };
    await client.leave(callRoom(conversationId));
    await this.leaveCall(conversationId, this.user(client).id);
    return { ok: true };
  }

  private async leaveCall(conversationId: number, userId: number) {
    const result = await this.calls.leave(conversationId, userId);
    if (!result) return;
    this.server
      .to(callRoom(conversationId))
      .emit('call:peer-left', { conversationId, userId });
    if (result.ended) await this.finishCall(result.call);
  }

  /** Stops ringing everywhere, closes the call room and logs a summary message. */
  private async finishCall(call: ActiveCall, summary?: LocalizedText) {
    const conversationId = call.conversationId;
    const notify = new Set([call.initiatorId, ...call.invited]);
    for (const id of notify) {
      this.server.to(userRoom(id)).emit('call:ended', { conversationId });
    }
    this.server
      .in(callRoom(conversationId))
      .socketsLeave(callRoom(conversationId));
    try {
      const message = await this.chat.createServiceMessage(
        conversationId,
        call.initiatorId,
        summary ?? callSummary(call),
      );
      this.server
        .to(`conversation:${conversationId}`)
        .emit('message:new', message);
    } catch (err) {
      this.logger.warn(`Call summary not saved: ${(err as Error).message}`);
    }
  }

  private callFailure(client: Socket, conversationId: number, err: unknown) {
    const error =
      err instanceof CallError
        ? err.code
        : (err as { status?: number })?.status === 403
          ? 'FORBIDDEN'
          : (err as { status?: number })?.status === 404
            ? 'NOT_FOUND'
            : 'ERROR';
    client.emit('call:error', { conversationId, error });
    return { ok: false, error };
  }
}
