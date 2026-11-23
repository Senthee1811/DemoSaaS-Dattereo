/**
 * Server-side password policy for changing a password. It matches what sign-up and reset already
 * enforce (a minimum length) and adds the rules that only make sense when a current password
 * exists. The client shows the same rules, but this is the check that counts.
 */
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128; // bounds the PBKDF2 work an attacker can ask for

export function passwordPolicyProblems(newPassword: string, currentPassword?: string): string[] {
  const problems: string[] = [];
  const pw = typeof newPassword === 'string' ? newPassword : '';
  if (pw.length < PASSWORD_MIN_LENGTH) problems.push(`Use at least ${PASSWORD_MIN_LENGTH} characters.`);
  if (pw.length > PASSWORD_MAX_LENGTH) problems.push(`Use at most ${PASSWORD_MAX_LENGTH} characters.`);
  if (currentPassword !== undefined && pw === currentPassword) problems.push('Choose a password different from your current one.');
  return problems;
}
