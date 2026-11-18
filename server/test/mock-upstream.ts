/**
 * Mock OpenAI-compatible upstream for the live E2E suite.
 *
 * Point the backend at it with OPENAI_BASE_URL=http://localhost:<port>/v1.
 * Every completion reports 1200 prompt / 400 completion tokens so costs are
 * deterministic. The suite reads call counters from GET /__stats to prove that
 * blocked requests never reach the provider.
 *
 *   MOCK_UPSTREAM_PORT=4555 ts-node test/mock-upstream.ts
 */
import { createServer } from 'http';

const PORT = Number(process.env.MOCK_UPSTREAM_PORT || 4555);
/** Any key containing this marker is the "platform" key; tenants must never be billed to it. */
const PLATFORM_MARKER = process.env.MOCK_PLATFORM_KEY_MARKER || 'platform';

const stats = { calls: 0, platformKeyCalls: 0, byModel: {} as Record<string, number> };

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

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          id: `chatcmpl-mock-${stats.calls}`,
          object: 'chat.completion',
          created: Math.floor(Date.now() / 1000),
          model,
          choices: [{ index: 0, message: { role: 'assistant', content: 'mock reply' }, finish_reason: 'stop' }],
          usage: { prompt_tokens: 1200, completion_tokens: 400, total_tokens: 1600 },
        }),
      );
    });
    return;
  }

  res.writeHead(404);
  res.end();
});

server.listen(PORT, () => console.log(`mock upstream listening on :${PORT}`));
