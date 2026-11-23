import { IsBoolean, IsIn, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { LIMITS } from '@/common/validation';

export class MarkAlertsReadDto {
  @IsOptional()
  @IsUUID()
  id?: string;

  @IsOptional()
  @IsBoolean()
  markAllRead?: boolean;
}

export class SlackConfigDto {
  @IsUUID()
  projectId: string;

  /** null or "" clears it; the service checks it is a Slack Incoming Webhook URL. */
  @IsOptional()
  @IsString()
  @MaxLength(LIMITS.SECRET)
  slackWebhookUrl?: string | null;
}

export class TestAlertDto {
  @IsUUID()
  projectId: string;

  @IsOptional()
  @IsIn(['PERCENT_80', 'HARD_BLOCK', 'ANOMALY_DETECTED'])
  thresholdType?: 'PERCENT_80' | 'HARD_BLOCK' | 'ANOMALY_DETECTED';
  /**
   * Legacy and ignored: delivery is decided by the project's Slack config, never by the caller.
   * Still accepted so existing clients do not start failing (see the Phase 6 validation report).
   */
  @IsOptional()
  @IsIn(['SLACK', 'EMAIL', 'IN_APP'])
  channel?: string;
}
