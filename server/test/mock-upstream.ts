/**
 * Mock OpenAI-compatible upstream for the live E2E suite.
 *
 * Point the backend at it with OPENAI_BASE_URL=http://localhost:<port>/v1.
 * Every completion reports 1200 prompt / 400 completion tokens so costs are
 * deterministic. The suite reads call counters from GET /__stats to prove that
 * blocked requests never reach the provider.
 *
 *   MOCK_UPSTREAM_PORT=4555 ts-node test/mock-upstream.ts
 *
 * Failure and spike triggers (used by test/e2e-reliability.ts; ordinary tests never hit them):
 *   provider key contains "mockfail401" -> 401 whose message ECHOES the key (to prove it is scrubbed)
 *   provider key contains "mockfail500" -> 500 HTML error page
 *   provider key contains "mockfail429" -> 429 with Retry-After: 9
 *   any message contains "MOCK_SPIKE"   -> usage of 30000 prompt tokens (a cost/volume spike)
 */
import { createServer } from 'http';

const PORT = Number(process.env.MOCK_UPSTREAM_PORT || 4555);
/** Any key containing this marker is the "platform" key; tenants must never be billed to it. */
const PLATFORM_MARKER = process.env.MOCK_PLATFORM_KEY_MARKER || 'platform';

const stats = { calls: 0, platformKeyCalls: 0, byModel: {} as Record<string, number>, limitParams: { max_completion_tokens: 0, max_tokens: 0 } };

const server = createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/__stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }

  if (req.method === 'POST' && req.url?.endsWith('/chat/completions')) {
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      let body: any = {};
      try {
        body = JSON.parse(raw);
      } catch {
        /* ignore */
      }
      const model = String(body.model || 'unknown');
      stats.calls++;
      stats.byModel[model] = (stats.byModel[model] || 0) + 1;
      if ((req.headers.authorization || '').includes(PLATFORM_MARKER)) stats.platformKeyCalls++;
      if ('max_completion_tokens' in body) stats.limitParams.max_completion_tokens++;
      if ('max_tokens' in body) stats.limitParams.max_tokens++;

      const auth = String(req.headers.authorization || '');
      if (auth.includes('mockfail401')) {
        res.writeHead(401, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: { message: `Incorrect API key provided: ${auth.replace('Bearer ', '')}. You can find your API key at https://platform.openai.com/account/api-keys.`, type: 'invalid_request_error', param: null, code: 'invalid_api_key' } }));
        return;
      }
      if (auth.includes('mockfail500')) {
        res.writeHead(500, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>500 Internal Server Error</h1><pre>Traceback (most recent call last): File "/srv/app.py"</pre></body></html>');
        return;
      }
      if (auth.includes('mockfail429')) {
        res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '9' });
        res.end(JSON.stringify({ error: { message: 'Rate limit reached for requests', type: 'requests', code: 'rate_limit_exceeded' } }));
        return;
      }
      const spike = JSON.stringify(body.messages ?? '').includes('MOCK_SPIKE');

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: `chatcmpl-mock-${stats.calls}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, message: { role: 'assistant', content: 'mock reply' }, finish_reason: 'stop' }],
          usage: spike ? { prompt_tokens: 30000, completion_tokens: 400, total_tokens: 30400 } : { prompt_tokens: 1200, completion_tokens: 400, total_tokens: 1600 },
        }),
      );
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`mock upstream listening on :${PORT}`));
