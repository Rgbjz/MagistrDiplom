import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { CertificatesService } from './certificates.service';

@Controller('certificates')
export class CertificatesController {
  constructor(private certificates: CertificatesService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  mine(@CurrentUser('id') userId: number) {
    return this.certificates.listMine(userId);
  }

  /** Public verification page data. */
  @Get(':code')
  byCode(@Param('code') code: string) {
    return this.certificates.getByCode(code);
  }
}
