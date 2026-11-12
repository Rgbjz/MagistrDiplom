import {
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../common/auth/jwt-auth.guard';
import { RolesGuard } from '../../common/auth/roles.guard';
import { Roles } from '../../common/auth/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { StoreService } from './store.service';
import { CatalogQueryDto } from './dto/catalog-query.dto';

@Controller('store')
export class StoreController {
  constructor(private store: StoreService) {}

  @Get('catalog')
  catalog(@Query() query: CatalogQueryDto) {
    return this.store.catalog(query);
  }

  @Get('public/courses/:id')
  publicCourse(@Param('id', ParseIntPipe) id: number) {
    return this.store.publicCourse(id);
  }

  @Get('courses/:id/my-status')
  @UseGuards(JwtAuthGuard)
  myStatus(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser('id') userId: number,
  ) {
    return this.store.myStatus(id, userId);
  }

  @Post('courses/:id/purchase')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('STUDENT')
  purchase(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: AuthUser,
  ) {
    return this.store.purchase(id, user);
  }

  @Get('me/purchases')
  @UseGuards(JwtAuthGuard)
  myPurchases(@CurrentUser('id') userId: number) {
    return this.store.myPurchases(userId);
  }
}
