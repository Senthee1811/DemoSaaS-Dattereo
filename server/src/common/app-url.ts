/** Public web-app origin used in links we email (no trailing slash). */
export function appUrl(): string {
  return (process.env.APP_URL || 'http://localhost:3000').replace(/\/$/, '');
}
