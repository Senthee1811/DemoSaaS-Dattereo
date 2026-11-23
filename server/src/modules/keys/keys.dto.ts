import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsInt,
  IsISO8601,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { LIMITS, Trim } from '@/common/validation';

export const PROVIDER_NAMES = ['OPENAI', 'ANTHROPIC', 'GEMINI', 'GROQ'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/**
 * One body for POST /api/v1/keys: type PROVIDER (store an encrypted provider key) or
 * GATEWAY (issue a SpendGuard key). Fields not relevant to the type are ignored.
 */
export class CreateKeyDto {
  @IsOptional()
  @IsIn(['PROVIDER', 'GATEWAY'])
  type?: 'PROVIDER' | 'GATEWAY';

  @IsUUID()
  projectId: string;

  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.NAME)
  keyName: string;

  // PROVIDER
  @IsOptional()
  @IsIn(PROVIDER_NAMES)
  provider?: ProviderName;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.SECRET)
  plainKey?: string;

  /** Legacy alias of plainKey. */
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.SECRET)
  rawKey?: string;

  // GATEWAY
  @IsOptional()
  @IsIn(['live', 'test'])
  environment?: 'live' | 'test';

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(LIMITS.MAX_RPM)
  rateLimitRpm?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(LIMITS.MAX_TPM)
  rateLimitTpm?: number;

  /** Must be an array: a bare string used to be stored and then silently ignored (no restriction). */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(PROVIDER_NAMES.length)
  @IsIn(PROVIDER_NAMES, { each: true })
  allowedProviders?: ProviderName[];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(LIMITS.MAX_MODELS)
  @IsString({ each: true })
  @MaxLength(LIMITS.MODEL_ID, { each: true })
  allowedModels?: string[];

  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 })
  @Min(LIMITS.MIN_BUDGET_USD)
  @Max(LIMITS.MAX_BUDGET_USD)
  budgetMonthly?: number;

  @IsOptional()
  @IsISO8601({ strict: true })
  expiresAt?: string;
}

export class TestProviderKeyDto {
  @IsIn(PROVIDER_NAMES)
  provider: ProviderName;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.SECRET)
  plainKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.SECRET)
  apiKey?: string;
}
