import { IsBoolean, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { LIMITS, Trim } from '@/common/validation';

const money = { allowNaN: false, allowInfinity: false, maxDecimalPlaces: 4 };

export class CreateProjectDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.NAME)
  name: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.NAME)
  slug?: string;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.DESCRIPTION)
  description?: string;

  /** Optional: the service defaults to 1000 when omitted. */
  @IsOptional()
  @IsNumber(money)
  @Min(LIMITS.MIN_BUDGET_USD)
  @Max(LIMITS.MAX_BUDGET_USD)
  budgetMonthly?: number;

  @IsOptional()
  @IsBoolean()
  budgetHardBlockEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  logRequestContent?: boolean;

  /**
   * Legacy and ignored: weekly budgets are not enforced, so the value is never stored or
   * returned. Still accepted so existing clients do not start failing.
   */
  @IsOptional()
  @IsNumber(money)
  budgetWeekly?: number;
}

export class UpdateProjectDto {
  @IsUUID()
  id: string;

  @IsOptional()
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.NAME)
  name?: string;

  @IsOptional()
  @IsNumber(money)
  @Min(LIMITS.MIN_BUDGET_USD)
  @Max(LIMITS.MAX_BUDGET_USD)
  budgetMonthly?: number;

  @IsOptional()
  @IsBoolean()
  budgetHardBlockEnabled?: boolean;

  @IsOptional()
  @IsBoolean()
  logRequestContent?: boolean;

  @IsOptional()
  @IsBoolean()
  isBlocked?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.REASON)
  blockReason?: string | null;
  /**
   * Legacy and ignored: weekly budgets are not enforced, so the value is never stored or
   * returned. Still accepted so existing clients do not start failing.
   */
  @IsOptional()
  @IsNumber(money)
  budgetWeekly?: number;
}
