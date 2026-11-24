# Security hardening: outbound delivery, webhook signing, channel management, tenancy

Status of each item is stated with the test that proves it. Items not proven are listed under "Limitations".

## 1. Outbound requests (SSRF and DNS rebinding)

All user-supplied destinations (organization Slack/webhook channels and the per-project Slack webhook) are delivered by
`server/src/modules/notifications/safe-http.ts`, never by `fetch`.

1. **Validate** (`url-safety.ts → resolveDestination`): strict `URL` parse; `https` only; no credentials; port 443 only
   (extra ports via `NOTIFICATION_ALLOWED_PORTS`); no `localhost`, single-label or `.local/.internal/.lan/…` names; IP literals
   in any encoding the URL parser normalises (`2130706433`, `0x7f000001`, `127.1`, `[::ffff:7f00:1]`) are classified as the
   address they really are.
2. **Resolve once, validate every answer.** Loopback, RFC1918, link-local (incl. `169.254.169.254`), CGNAT, multicast/reserved,
   IPv6 `::`, `::1`, ULA, link-local, site-local, multicast, documentation, discard, and IPv4 wrapped in IPv4-mapped, NAT64
   (`64:ff9b::/96`) or 6to4 (`2002::/16`) are refused. One bad address in a mixed answer rejects the whole destination.
   An empty answer or a resolver error is a rejection, never a bypass.
3. **Pin the connection.** The socket is opened through a `lookup` override that can only return the addresses validated in
   step 2, so the hostname is never resolved a second time. The URL is *not* rewritten to an IP: Host header, TLS SNI and
   certificate verification use the original hostname.
4. **No redirects** (a 3xx is a permanent delivery failure), connect+total timeout (5 s), response capped (64 KiB), no
   connection reuse (`agent: false`).
5. **Re-validated before every delivery attempt** (retries and test sends included), so DNS that changes later is caught.

Proven by `test/ssrf-pinning.spec.ts` (injected resolver and transport; no live DNS) and real sockets: a local TLS server whose
certificate matches the original hostname succeeds with Host = hostname; a certificate for another name is rejected; a real
302 to an internal server is not followed; slow and oversized responses are cut off. `test/alerts.spec.ts` and
`test/notification-security.spec.ts` prove the project Slack path and test-send use the same guard.

## 2. Webhook signing

Canonical format:

```
X-SpendGuard-Timestamp: <unix seconds, integer>
X-SpendGuard-Signature: v1=<hex HMAC-SHA256(secret, "<timestamp>.<raw body bytes>")>[,v1=<hex …>]
```

The signed bytes are the UTF-8 bytes of the body that is transmitted; `Content-Length` is computed from the same buffer.
Receiver example (Node):

```js
const { createHmac, timingSafeEqual } = require('crypto');
function verify(secrets, rawBody /* Buffer, before JSON parsing */, headers, now = Date.now() / 1000) {
  const ts = headers['x-spendguard-timestamp'];
  if (!/^\d{1,12}$/.test(ts) || Math.abs(now - Number(ts)) > 300) return false;          // replay window: 5 minutes
  const given = String(headers['x-spendguard-signature']).split(',').map((p) => /^v1=([0-9a-f]{64})$/.exec(p.trim())?.[1]).filter(Boolean);
  return [].concat(secrets).some((secret) => {
    const want = createHmac('sha256', secret).update(`${ts}.`).update(rawBody).digest();
    return given.some((g) => timingSafeEqual(want, Buffer.from(g, 'hex')));
  });
}
```

Also de-duplicate by `X-SpendGuard-Event-Id` if your handler is not idempotent (SpendGuard retries transient failures).

**Rotation policy.** `POST /api/v1/notifications/channels/:id/rotate-secret`:
* default: the new secret signs from now on and the previous secret keeps signing too (second `v1=` entry) for 24 h
  (`graceHours`, max 168). A receiver that has not deployed the new secret yet, and deliveries already retrying, keep
  verifying. Each attempt is signed at send time with the then-current secrets.
* `{"immediate": true}`: the old secret stops signing at once (use when it may be compromised).
* The new secret is returned once; the previous one is never returned again. Secrets are encrypted at rest, never logged,
  never in list/history/audit responses.

Proven by `test/notification-security.spec.ts` (correct, modified body, modified/expired/future timestamp, malformed,
non-hex, unknown version, wrong secret, dual-signature rotation, expiry of the grace window, retry queued before rotation,
immediate rotation, no-secret-leakage across API/history/audit/logs).

## 3. Notification channel management

* OWNER/ADMIN only (channels, deliveries, audit, retry); organization comes from the token; another organization's channel
  or delivery id → 404 and nothing changes (tested for update, delete, rotate, test, retry).
* Destination details are AES-256-GCM envelope-encrypted; responses carry only a host-level hint (e.g. `hooks.example.com/…`).
* **A channel's destination cannot be edited.** To change it, create a new channel and remove the old one, so history can
  never be silently re-pointed.
* Pause/disable: deliveries that were queued fail permanently with "channel deleted or disabled" and can be retried
  manually after resume. Removal keeps delivery history (`channel_id → NULL`, shown as "(deleted channel)").
* **Audit trail** (`audit_log`, new nullable `org_id` column): `notification.channel.created | tested | secret_rotated |
  paused | resumed | removed | updated`, with actor user id and channel id, never the destination or secret.
  `GET /api/v1/notifications/audit`. A failed audit write is logged at error level and does not block the admin action.

## 4. Tenant isolation (re-audit)

* Insights: every query is joined to `projects.org_id` from the token; a foreign project id is 404; recommendation ids are
  looked up by `(id, orgId)`; dimensions are a whitelist; raw SQL is parameterised; payloads carry ids, times, models, tokens
  and costs only (no prompts, responses, keys or IPs). Covered by `test/insights-services.spec.ts` and the live suite
  (`npm run test:e2e:insights`, run against throwaway infrastructure in the previous phase, not re-run for this change).
* Notifications: every service method takes `orgId` first and filters by it; the inbox and mark-read are org-scoped.
* Request-attempt audit: filtered by the row's own `org_id`.

## 5. Limitations

* Pinning relies on Node's `lookup` option; behaviour was verified on the Node version in this environment only.
* The hostname hint shown to admins is not a secret but does reveal the destination host.
* Email delivery goes to a third-party API; recipients are not SSRF-relevant but are limited per channel.
* Rotation grace windows mean an old secret remains valid for up to 7 days when chosen; use `immediate` for compromise.
* Live e2e suites were not re-run after these changes (they need Postgres + Redis + mock upstream).
* Audit rows are append-only by convention (no update path in the service); there is no database-level immutability.
