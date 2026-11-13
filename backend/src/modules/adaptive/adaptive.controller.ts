import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { AdaptiveService } from './adaptive.service';
import { OpenedDto, UpdateAdaptiveSettingsDto } from './dto/settings.dto';

@Controller()
@UseGuards(JwtAuthGuard)
export class AdaptiveController {
  constructor(private adaptive: AdaptiveService) {}

  /** Student: own learner model and recommendations in a course. */
  @Get('courses/:id/adaptive/me')
  me(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.adaptive.me(id, user);
  }

  /** Student: top recommendations across courses (dashboard). */
  @Get('adaptive/recommendations')
  recommendations(@CurrentUser() user: AuthUser) {
    return this.adaptive.dashboard(user);
  }

  /** Student opened a recommendation (logged for the effectiveness study). */
  @Post('adaptive/recommendations/:key/opened')
  @HttpCode(200)
  opened(
    @Param('key') key: string,
    @Body() dto: OpenedDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adaptive.opened(dto.courseId, key, user);
  }

  /** Course team: mastery heatmap, groups and recommendation statistics. */
  @Get('courses/:id/adaptive/overview')
  overview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adaptive.overview(id, user);
  }

  @Patch('courses/:id/adaptive/settings')
  settings(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateAdaptiveSettingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adaptive.updateSettings(id, dto, user);
  }

  /** Rebuild the learner model of the course from its whole history. */
  @Post('courses/:id/adaptive/recompute')
  @HttpCode(200)
  recompute(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.adaptive.recompute(id, user);
  }

  /** A/B experiment outcomes per student (anonymised CSV). */
  @Get('courses/:id/adaptive/experiment/export')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header(
    'Content-Disposition',
    'attachment; filename="adaptive-experiment.csv"',
  )
  export(@Param('id', ParseIntPipe) id: number, @CurrentUser() user: AuthUser) {
    return this.adaptive.experimentCsv(id, user);
  }
}
