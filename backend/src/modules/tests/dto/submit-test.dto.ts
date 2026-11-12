import { IsObject } from 'class-validator';

export class SubmitTestDto {
  // questionId -> response; the shape depends on the question type
  // (see question-types.ts), e.g. { "5": { "answerIds": [12] }, "6": { "text": "…" } }.
  // A bare array of answer ids is still accepted for choice questions.
  @IsObject()
  answers: Record<string, unknown>;
}
