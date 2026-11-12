import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { map, type Observable } from 'rxjs';
import type { AuthUser } from '../../common/decorators/current-user.decorator';
import { FilesService } from './files.service';

/** Replaces protected file URLs in every JSON response with signed ones. */
@Injectable()
export class SignedFilesInterceptor implements NestInterceptor {
  constructor(private files: FilesService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    const req = context.switchToHttp().getRequest<{ user?: AuthUser }>();
    return next.handle().pipe(
      map((data: unknown) => {
        if (data && typeof data === 'object')
          this.files.signResponse(data, req.user?.id);
        return data;
      }),
    );
  }
}
