import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { IceServersService } from './ice-servers.service';

/** STUN/TURN servers for WebRTC calls, with short-lived TURN credentials. */
@Controller('calls')
@UseGuards(JwtAuthGuard)
export class IceServersController {
  constructor(private ice: IceServersService) {}

  @Get('ice-servers')
  iceServers() {
    return this.ice.get();
  }
}
