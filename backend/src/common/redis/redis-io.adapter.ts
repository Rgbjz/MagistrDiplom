import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import type { Server, ServerOptions } from 'socket.io';
import { RedisService } from './redis.service';

/**
 * Socket.IO adapter that fans `server.to(room).emit(...)` out through Redis
 * pub/sub, so rooms (`user:{id}`, `conversation:{id}`, `call:{id}`, socket
 * ids) work across several backend instances.
 */
export class RedisIoAdapter extends IoAdapter {
  private readonly adapter: ReturnType<typeof createAdapter>;

  constructor(app: INestApplicationContext, redis: RedisService) {
    super(app);
    this.adapter = createAdapter(
      redis.connect('io-pub'),
      redis.connect('io-sub'),
    );
  }

  createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, options) as Server;
    server.adapter(this.adapter);
    return server;
  }
}
