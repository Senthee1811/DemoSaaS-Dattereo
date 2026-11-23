import { Controller, Post, Get, Delete, Body, Param, Query, Req, HttpCode, HttpStatus, ParseUUIDPipe } from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { IsEmail, IsString, MinLength, MaxLength, IsOptional } from 'class-validator';
import { Transform } from 'class-transformer';
import { Public } from './decorators/public.decorator';

/** Normalise emails before validation so ' Alice@X.com ' and 'alice@x.com' are the same account. */
const NormalizeEmail = () =>
  Transform(({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value));
import { CurrentUser, AuthenticatedUser } from './decorators/current-user.decorator';

export class RegisterDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsString()
  @MinLength(1)
  name: string;

  @IsOptional()
  @IsString()
  orgName?: string;

  @IsOptional()
  @IsString()
  orgSlug?: string;
}

export class LoginDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;

  @IsString()
  password: string;
}

export class RefreshDto {
  @IsString()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @NormalizeEmail()
  @IsEmail()
  email: string;
}

export class ResetPasswordDto {
  @IsString()
  token: string;

  @IsString()
  @MinLength(8)
  newPassword: string;
}

export class ChangePasswordDto {
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  currentPassword: string;

  /** Length and "different from current" are checked by the policy so the message is specific. */
  @IsString()
  @MaxLength(256)
  newPassword: string;
}

/** The client's coarse identity for the session list. IP is only trusted behind TRUST_PROXY. */
function sessionMeta(req: Request) {
  return { userAgent: req.headers['user-agent'] as string | undefined, ip: req.ip };
}

export class DeactivateAccountDto {
  @IsString()
  @MinLength(1)
  password: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsString()
  confirmPhrase: string;
}

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new user and organization' })
  @ApiResponse({ status: 201, description: 'User registered successfully' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  async register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.authService.register(dto, sessionMeta(req));
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Authenticate with email and password' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, sessionMeta(req));
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Refresh access token using refresh token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed' })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token' })
  async refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign out: revoke the refresh token server-side' })
  @ApiResponse({ status: 200, description: 'Refresh token revoked' })
  @ApiResponse({ status: 503, description: 'Revocation store unavailable; nothing was revoked' })
  async logout(@Body() dto: RefreshDto) {
    return this.authService.logout(dto.refreshToken);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Initiate password reset flow' })
  @ApiResponse({ status: 200, description: 'Reset instructions dispatched if account exists' })
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Reset password with time-limited token' })
  @ApiResponse({ status: 200, description: 'Password reset successfully' })
  @ApiResponse({ status: 400, description: 'Invalid or expired token' })
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  // ── Security workspace ──────────────────────────────────────────────────────

  @Get('security')
  @ApiBearerAuth()
  @ApiOperation({ summary: "The signed-in user's real security facts (password, sessions, MFA support)" })
  async securityOverview(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.securityOverview(user);
  }

  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Change the password (verifies the current one; signs out other sessions)' })
  @ApiResponse({ status: 400, description: 'Current password wrong or new password rejected by policy' })
  async changePassword(@CurrentUser() user: AuthenticatedUser, @Body() dto: ChangePasswordDto, @Req() req: Request) {
    return this.authService.changePassword(user, dto, sessionMeta(req));
  }

  @Get('sessions')
  @ApiBearerAuth()
  @ApiOperation({ summary: "List the signed-in user's active sessions" })
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user);
  }

  @Post('sessions/revoke-others')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Sign out every session except the current one' })
  async revokeOtherSessions(@CurrentUser() user: AuthenticatedUser, @Req() req: Request) {
    return this.authService.revokeOtherSessions(user, sessionMeta(req));
  }

  @Delete('sessions/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Revoke one of your own sessions (the current one needs confirmCurrent=true)' })
  @ApiResponse({ status: 404, description: 'No such session for this user' })
  @ApiResponse({ status: 409, description: 'That is the current session and was not confirmed' })
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query('confirmCurrent') confirmCurrent: string | undefined,
    @Req() req: Request,
  ) {
    return this.authService.revokeSession(user, id, confirmCurrent === 'true', sessionMeta(req));
  }

  @Get('security-activity')
  @ApiBearerAuth()
  @ApiOperation({ summary: "The signed-in user's own security events (sign-ins, password changes, revocations)" })
  async securityActivity(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.authService.securityActivity(user, limit ? parseInt(limit, 10) : 20, offset ? parseInt(offset, 10) : 0);
  }

  @Get('account-status')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user account status and organization membership' })
  @ApiResponse({ status: 200, description: 'Account status details' })
  async getAccountStatus(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getAccountStatus(user.id);
  }

  @Post('deactivate')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Deactivate user account after password verification and ownership check' })
  @ApiResponse({ status: 200, description: 'Account deactivated successfully' })
  @ApiResponse({ status: 400, description: 'Ownership constraint violation' })
  @ApiResponse({ status: 401, description: 'Password verification failed' })
  async deactivate(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: DeactivateAccountDto,
  ) {
    return this.authService.deactivateAccount(user.id, dto);
  }
}
