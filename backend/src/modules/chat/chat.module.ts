import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ChatService } from './chat.service';
import { ChatController } from './chat.controller';
import { ChatGateway } from './chat.gateway';
import { CallService } from './call.service';
import { IceServersController } from './ice-servers.controller';
import { IceServersService } from './ice-servers.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [ChatController, IceServersController],
  providers: [ChatService, ChatGateway, CallService, IceServersService],
  exports: [ChatService],
})
export class ChatModule {}
