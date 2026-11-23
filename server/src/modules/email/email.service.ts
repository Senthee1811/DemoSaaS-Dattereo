import { Injectable, Logger } from '@nestjs/common';
import { Resend } from 'resend';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Transactional email through Resend.
 *
 * Never throws: a mail outage must not break password reset or invites, and
 * callers must not be able to learn (via an error) whether an address exists.
 * Without RESEND_API_KEY it is a no-op that logs a warning. Outside production
 * only, that warning includes the link so local flows can be completed; the
 * link carries a one-time token, so it is never logged in production.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger(EmailService.name);

  private get from(): string {
    return process.env.EMAIL_FROM || 'SpendGuard <noreply@localhost>';
  }

  private client(): Resend | null {
    const key = process.env.RESEND_API_KEY;
    return key ? new Resend(key) : null;
  }

  async sendPasswordReset(to: string, resetUrl: string): Promise<boolean> {
    return this.send(to, 'Reset your SpendGuard password', resetUrl, {
      html:
        `<p>We received a request to reset your SpendGuard password.</p>` +
        `<p><a href="${escapeHtml(resetUrl)}">Choose a new password</a> (valid for 1 hour).</p>` +
        `<p>If you didn't ask for this, you can ignore this email.</p>`,
      text: `Reset your SpendGuard password (valid for 1 hour): ${resetUrl}\nIf you didn't ask for this, ignore this email.`,
    });
  }

  async sendOrgInvite(to: string, inviteUrl: string, orgName: string, inviterName: string): Promise<boolean> {
    const org = escapeHtml(orgName);
    const inviter = escapeHtml(inviterName);
    return this.send(to, `${inviterName} invited you to ${orgName} on SpendGuard`, inviteUrl, {
      html:
        `<p>${inviter} invited you to join <b>${org}</b> on SpendGuard.</p>` +
        `<p><a href="${escapeHtml(inviteUrl)}">Set your password and join</a> (valid for 7 days).</p>`,
      text: `${inviterName} invited you to join ${orgName} on SpendGuard. Set your password (valid for 7 days): ${inviteUrl}`,
    });
  }

  private async send(
    to: string,
    subject: string,
    link: string,
    body: { html: string; text: string },
  ): Promise<boolean> {
    const resend = this.client();
    if (!resend) {
      this.logger.warn(
        process.env.NODE_ENV !== 'production'
          ? `RESEND_API_KEY is not set; email "${subject}" was not sent. Link for local testing: ${link}`
          : `RESEND_API_KEY is not set; email "${subject}" was not sent.`,
      );
      return false;
    }
    try {
      const { error } = await resend.emails.send({ from: this.from, to, subject, ...body });
      if (error) {
        this.logger.error(`Resend rejected email "${subject}": ${error.name}`);
        return false;
      }
      return true;
    } catch (err: any) {
      this.logger.error(`Email "${subject}" failed: ${err?.name ?? 'error'}`);
      return false;
    }
  }
}
