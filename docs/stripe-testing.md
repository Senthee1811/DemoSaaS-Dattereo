# Testing the Stripe webhook (test mode)

The webhook is `POST /api/v1/billing/webhook` on the NestJS backend (port 4000). It is **not** proxied
by the Next.js app, so point the Stripe CLI straight at the backend.

## What the handler guarantees

| Guarantee | How |
|---|---|
| Signature checked over the exact bytes Stripe sent | `NestFactory.create(..., { rawBody: true })`; the controller passes `req.rawBody` (a `Buffer`) to `stripe.webhooks.constructEvent`. |
| A forged or altered request never changes anything | Bad or missing signature → `400 { received: false }`, nothing recorded. |
| A redelivered event is applied once | The event ID is inserted into `processed_webhook_events` (primary key) in the same DB transaction as its effects. A second delivery hits the key and returns `200 { received: true, duplicate: true }`. |
| A failed attempt is retried by Stripe | If applying the event throws, the transaction rolls back (the ID is **not** recorded) and the endpoint returns `500`, so Stripe's retry applies it. |

Handled event types: `checkout.session.completed` (sets the org's plan and `status = active`).
Any other verified event is recorded and acknowledged with no effect.

## Setup

1. Install the [Stripe CLI](https://docs.stripe.com/stripe-cli) and run `stripe login` (test mode).
2. In `server/.env` set a **test-mode** secret key. Leave `STRIPE_WEBHOOK_SECRET` for step 4.
   ```
   STRIPE_SECRET_KEY=sk_test_...
   ```
3. Apply migrations and start the backend:
   ```bash
   cd server
   npx prisma migrate deploy
   npm run start:dev
   ```
4. Forward events. The CLI prints a signing secret (`whsec_...`); put it in `server/.env` as
   `STRIPE_WEBHOOK_SECRET` and restart the backend:
   ```bash
   stripe listen --forward-to localhost:4000/api/v1/billing/webhook
   ```

## Trigger an event that changes a plan

`checkout.session.completed` only changes a plan when the session carries your org in its metadata.
A bare `stripe trigger checkout.session.completed` has no `orgId`, so the handler records the event,
logs a warning and changes nothing. Pass the org and tier explicitly:

```bash
stripe trigger checkout.session.completed \
  --add checkout_session:metadata.orgId=<ORG_ID> \
  --add checkout_session:metadata.tier=growth
```

`<ORG_ID>` is `user.orgId` from the login response (or `organizations.id` in Postgres).

## What to confirm

1. **Signature passes**: the `stripe listen` output shows `[200]` for the forwarded event.
2. **Plan updates**: `GET /api/v1/billing/subscription` (with that org's token) now returns
   `tier: "growth"`, `status: "active"`.
   ```sql
   select tier, status from subscriptions where org_id = '<ORG_ID>';
   ```
3. **A duplicate does not double-apply**: resend the same event. The CLI can replay it by ID:
   ```bash
   stripe events resend evt_XXXXXXXX --webhook-endpoint=<endpoint-or-listen-id>
   ```
   The response is `200` with `"duplicate": true` and `select count(*) from processed_webhook_events
   where id = 'evt_XXXXXXXX'` stays `1`. (Re-running `stripe trigger` creates a *new* event with a new ID, so
   it is applied again by design. Use a resend to test redelivery.)
4. **Forgery is rejected**: send the same body with a wrong signature and expect `400`:
   ```bash
   curl -i -X POST localhost:4000/api/v1/billing/webhook \
     -H 'Content-Type: application/json' -H 'Stripe-Signature: t=1,v1=bad' -d '{}'
   ```

## Automated checks

- `server/test/billing-webhook.spec.ts` signs payloads with the real `stripe` library and covers
  verification, duplicate delivery, tampering, rollback-on-failure and retry.
- Verified against a real Postgres: a signed `checkout.session.completed` moved an org from
  `starter/free` to `growth/active`; the identical delivery returned `duplicate: true` with one row in
  `processed_webhook_events`; a tampered body and a forged signature both returned `400`.
- Not yet run by us: the Stripe CLI flow above (`stripe listen` / `stripe trigger`) against Stripe's own
  servers, because the CLI is not installed in the environment this was built in.
