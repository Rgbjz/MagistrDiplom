import { IsObject } from 'class-validator';

export class SubmitTestDto {
  // Map of questionId -> array of chosen answer ids, e.g. { "5": [12, 14] }
  @IsObject()
  answers: Record<string, number[]>;
}
