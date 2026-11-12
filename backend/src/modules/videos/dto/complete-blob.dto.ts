import { IsUrl } from 'class-validator';

export class CompleteBlobDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url: string;
}
