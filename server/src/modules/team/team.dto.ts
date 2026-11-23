import { IsEmail, IsIn, IsNotEmpty, IsString, IsUUID, MaxLength } from 'class-validator';
import { LIMITS, Trim } from '@/common/validation';

export class InviteMemberDto {
  @Trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(LIMITS.NAME)
  name: string;

  @Trim()
  @IsEmail()
  @MaxLength(LIMITS.EMAIL)
  email: string;

  /** OWNER cannot be granted by invite (it used to be silently downgraded to MEMBER). */
  @IsIn(['ADMIN', 'MEMBER'])
  role: 'ADMIN' | 'MEMBER';
}

export class UpdateRoleDto {
  @IsUUID()
  userId: string;

  @IsIn(['OWNER', 'ADMIN', 'MEMBER'])
  role: 'OWNER' | 'ADMIN' | 'MEMBER';
}
