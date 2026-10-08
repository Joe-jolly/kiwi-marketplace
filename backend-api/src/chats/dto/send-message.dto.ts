import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class SendMessageDto {
  // MVP is text-only (Database Constitution §12, API Constitution §18) — no
  // attachment/image fields. 2000 chars is a generous, undocumented-but-safe
  // ceiling (no explicit limit is specified anywhere in the Constitutions);
  // it exists only to stop pathological payloads, not to constrain normal
  // chat use.
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  content: string;
}
