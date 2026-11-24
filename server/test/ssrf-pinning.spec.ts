import 'reflect-metadata';
import * as http from 'http';
import * as https from 'https';
import { execFileSync } from 'child_process';
import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { AddressInfo } from 'net';
import { isPrivateAddress, resolveDestination, UnsafeDestinationError } from '../src/modules/notifications/url-safety';
import { OutboundError, safePost } from '../src/modules/notifications/safe-http';
import { fakeTransport } from './helpers/fake-transport';

const env = { ...process.env };
afterEach(() => {
  process.env = { ...env };
});
const PUBLIC = '93.184.216.34';
const resolveTo = (...addrs: string[]) => jest.fn(async () => addrs);

describe('address classification (IPv4 + IPv6)', () => {
  it.each([
    '127.0.0.1', '10.0.0.1', '172.16.5.5', '192.168.0.1', '169.254.169.254', '100.100.100.200', '0.0.0.0', '255.255.255.255', '192.0.2.1',
    '::', '::1', '0:0:0:0:0:0:0:1', 'fc00::1', 'fd00:ec2::254', 'fe80::1', 'fec0::1', 'ff02::1', '2001:db8::1',
    '::ffff:127.0.0.1', '::ffff:7f00:1', '::ffff:a00:1', '::ffff:169.254.169.254', '64:ff9b::7f00:1', '64:ff9b::a9fe:a9fe', '2002:7f00:1::1', '2002:a00:1::',
  ])('%s is internal', (ip) => expect(isPrivateAddress(ip)).toBe(true));
  it.each(['93.184.216.34', '8.8.8.8', '2606:4700:4700::1111', '2001:4860:4860::8888', '::ffff:8.8.8.8', '64:ff9b::808:808'])('%s is public', (ip) => expect(isPrivateAddress(ip)).toBe(false));
});

describe('destination validation + single resolution', () => {
  it('returns the validated addresses for a public IPv4 and IPv6 hostname', async () => {
    const r = await resolveDestination('https://hooks.example.com/x', { resolver: resolveTo(PUBLIC, '2606:4700:4700::1111') });
    expect(r.addresses).toEqual([PUBLIC, '2606:4700:4700::1111']);
  });
  it.each([
    ['mixed public + private answer', [PUBLIC, '10.0.0.5']],
    ['mixed public + metadata', [PUBLIC, '169.254.169.254']],
    ['public + IPv4-mapped loopback', [PUBLIC, '::ffff:127.0.0.1']],
    ['IPv6 ULA', ['fd00::1']],
    ['empty answer', []],
  ])('rejects %s', async (_n, addrs) => {
    await expect(resolveDestination('https://hooks.example.com/x', { resolver: resolveTo(...(addrs as string[])) })).rejects.toThrow(UnsafeDestinationError);
  });
  it('a DNS failure is a rejection, never a bypass', async () => {
    await expect(
      resolveDestination('https://hooks.example.com/x', {
        resolver: async () => {
          throw new Error('ENOTFOUND');
        },
      }),
    ).rejects.toThrow(/could not be resolved/);
  });
  it.each([
    'http://hooks.example.com/x', 'ftp://hooks.example.com/x', 'file:///etc/passwd', 'not a url', 'https://user:pw@hooks.example.com/x',
    'https://localhost/x', 'https://app.localhost/x', 'https://db.internal/x', 'https://intranet/x', 'https://hooks.example.com:8443/x',
  ])('rejects %s before any DNS lookup', async (url) => {
    const resolver = resolveTo(PUBLIC);
    await expect(resolveDestination(url, { resolver })).rejects.toThrow(UnsafeDestinationError);
    expect(resolver).not.toHaveBeenCalled();
  });
  it.each(['https://2130706433/x', 'https://0x7f000001/x', 'https://017700000001/x', 'https://127.1/x', 'https://[::ffff:7f00:1]/x', 'https://[0:0:0:0:0:ffff:127.0.0.1]/x'])(
    'alternative encodings of loopback (%s) are rejected',
    async (url) => {
      await expect(resolveDestination(url, { resolver: resolveTo(PUBLIC) })).rejects.toThrow(UnsafeDestinationError);
    },
  );
  it('an explicitly allow-listed port is accepted, others are not', async () => {
    process.env.NOTIFICATION_ALLOWED_PORTS = '8443';
    await expect(resolveDestination('https://hooks.example.com:8443/x', { resolver: resolveTo(PUBLIC) })).resolves.toBeDefined();
    await expect(resolveDestination('https://hooks.example.com:9443/x', { resolver: resolveTo(PUBLIC) })).rejects.toThrow(/port/);
  });
});

describe('DNS rebinding: the connection can only go to the addresses we validated', () => {
  it('connects to the validated address and never re-resolves', async () => {
    const answers = [[PUBLIC], ['127.0.0.1']];
    const resolver = jest.fn(async () => answers.shift()!);
    const t = fakeTransport(200);
    await safePost('https://hooks.example.com/x', '{"a":1}', { resolver, requestImpl: t.impl });
    expect(resolver).toHaveBeenCalledTimes(1);
    expect(t.calls[0].lookedUp).toBe(PUBLIC); // the pinned lookup returns the validated address, whatever DNS says later
    expect(t.calls[0].options.hostname).toBe('hooks.example.com'); // name kept: Host header + SNI + cert check unchanged
    expect(t.calls[0].options.servername).toBe('hooks.example.com');
  });
  it('DNS that changes between attempts is caught: the next delivery re-validates and is refused, with no connection', async () => {
    const answers = [[PUBLIC], ['10.0.0.9']];
    const resolver = jest.fn(async () => answers.shift()!);
    const t = fakeTransport(200);
    await safePost('https://hooks.example.com/x', '{}', { resolver, requestImpl: t.impl });
    await expect(safePost('https://hooks.example.com/x', '{}', { resolver, requestImpl: t.impl })).rejects.toThrow(UnsafeDestinationError);
    expect(t.calls).toHaveLength(1);
  });
  it('the pinned lookup answers the all:true form with only validated addresses, whatever name it is asked for', async () => {
    const t = fakeTransport(200);
    await safePost('https://hooks.example.com/x', '{}', { resolver: resolveTo(PUBLIC, '2606:4700:4700::1111'), requestImpl: t.impl });
    const out: any[] = [];
    t.calls[0].options.lookup('anything-else.attacker.test', { all: true }, (_e: any, list: any) => out.push(list));
    expect(out[0].map((a: any) => a.address)).toEqual([PUBLIC, '2606:4700:4700::1111']);
  });
  it('mixed public/private DNS never results in any connection attempt', async () => {
    const t = fakeTransport(200);
    await expect(safePost('https://hooks.example.com/x', '{}', { resolver: resolveTo(PUBLIC, '127.0.0.1'), requestImpl: t.impl })).rejects.toThrow(UnsafeDestinationError);
    expect(t.calls).toHaveLength(0);
  });
});

describe('transport behaviour', () => {
  it('sends exactly the bytes it was given (multi-byte safe) with a matching Content-Length', async () => {
    const t = fakeTransport(200);
    const body = '{"title":"Budget – 85% ✓ 日本語"}';
    await safePost('https://hooks.example.com/x', body, { resolver: resolveTo(PUBLIC), requestImpl: t.impl });
    expect(t.calls[0].body).toBe(body);
    expect(t.calls[0].options.headers['Content-Length']).toBe(String(Buffer.byteLength(body)));
  });
  it('does not follow redirects: a 302 is returned as a status', async () => {
    const t = fakeTransport(302);
    await expect(safePost('https://hooks.example.com/x', '{}', { resolver: resolveTo(PUBLIC), requestImpl: t.impl })).resolves.toMatchObject({ status: 302 });
    expect(t.calls).toHaveLength(1);
  });
  it('a destination that never answers times out', async () => {
    await expect(safePost('https://hooks.example.com/x', '{}', { resolver: resolveTo(PUBLIC), requestImpl: fakeTransport('hang').impl, timeoutMs: 80 })).rejects.toMatchObject({ kind: 'timeout' });
  });
  it('an oversized response is cut off', async () => {
    await expect(
      safePost('https://hooks.example.com/x', '{}', { resolver: resolveTo(PUBLIC), requestImpl: fakeTransport({ status: 200, bytes: 5000 }).impl, maxResponseBytes: 1000 }),
    ).rejects.toMatchObject({ kind: 'too_large' });
  });
  it('network errors never echo the destination', async () => {
    const err = await safePost('https://hooks.example.com/secret-path', '{}', {
      resolver: resolveTo(PUBLIC),
      requestImpl: fakeTransport(new Error('connect ECONNREFUSED hooks.example.com/secret-path')).impl,
    }).catch((e) => e);
    expect(err).toBeInstanceOf(OutboundError);
    expect(err.message).not.toMatch(/secret-path|hooks\.example/);
  });
});

// Real sockets: proves the pinned connection works end to end and TLS verification still uses the hostname.
const haveOpenssl = (() => {
  try {
    execFileSync('openssl', ['version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
})();
if (!haveOpenssl) console.warn('[ssrf-pinning.spec] openssl not found: the real-TLS tests are SKIPPED');
const withTls = haveOpenssl ? describe : describe.skip;

withTls('real sockets (loopback server standing in for a public host)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sg-tls-'));
  const mkCert = (name: string) => {
    execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-keyout', join(dir, `${name}.key`), '-out', join(dir, `${name}.crt`), '-days', '2', '-subj', `/CN=${name}`, '-addext', `subjectAltName=DNS:${name}`], { stdio: 'ignore' });
    return { key: readFileSync(join(dir, `${name}.key`)), cert: readFileSync(join(dir, `${name}.crt`)) };
  };
  const servers: Array<http.Server | https.Server> = [];
  afterAll(() => {
    servers.forEach((s) => s.close());
    rmSync(dir, { recursive: true, force: true });
  });
  const listen = (server: http.Server | https.Server) =>
    new Promise<number>((r) => {
      servers.push(server);
      server.listen(0, '127.0.0.1', () => r((server.address() as AddressInfo).port));
    });

  beforeEach(() => {
    process.env.NOTIFICATION_ALLOW_PRIVATE_NETWORKS = 'true'; // the "public" server is on loopback in this test
    process.env.NOTIFICATION_ALLOW_HTTP = 'true';
  });

  it('TLS succeeds when the certificate matches the ORIGINAL hostname; Host header is the hostname, not the IP', async () => {
    const c = mkCert('hooks.example.test');
    let host = '';
    let received = '';
    const port = await listen(
      https.createServer(c, (req, res) => {
        host = String(req.headers.host);
        req.on('data', (d) => (received += d));
        req.on('end', () => res.end('ok'));
      }),
    );
    const r = await safePost(`https://hooks.example.test:${port}/hook`, '{"x":1}', { resolver: async () => ['127.0.0.1'], ca: c.cert });
    expect(r.status).toBe(200);
    expect(host).toBe(`hooks.example.test:${port}`);
    expect(received).toBe('{"x":1}');
  });

  it('a certificate for a different name is rejected even though the pinned IP answers', async () => {
    const c = mkCert('other.example.test');
    const port = await listen(https.createServer(c, (_q, res) => res.end('ok')));
    await expect(safePost(`https://hooks.example.test:${port}/hook`, '{}', { resolver: async () => ['127.0.0.1'], ca: c.cert })).rejects.toMatchObject({ kind: 'tls' });
  });

  it('a real server that redirects to an internal address is never followed', async () => {
    let hits = 0;
    const iport = await listen(
      http.createServer((_q, res) => {
        hits++;
        res.end('internal');
      }),
    );
    const port = await listen(
      http.createServer((_q, res) => {
        res.writeHead(302, { Location: `http://127.0.0.1:${iport}/` });
        res.end();
      }),
    );
    const r = await safePost(`http://hooks.example.test:${port}/x`, '{}', { resolver: async () => ['127.0.0.1'] });
    expect(r.status).toBe(302);
    expect(hits).toBe(0);
  });

  it('a real slow server is cut off by the timeout', async () => {
    const port = await listen(http.createServer(() => undefined));
    await expect(safePost(`http://hooks.example.test:${port}/x`, '{}', { resolver: async () => ['127.0.0.1'], timeoutMs: 150 })).rejects.toMatchObject({ kind: 'timeout' });
  });

  it('a real server streaming an oversized body is cut off', async () => {
    const port = await listen(http.createServer((_q, res) => res.end('x'.repeat(200_000))));
    await expect(safePost(`http://hooks.example.test:${port}/x`, '{}', { resolver: async () => ['127.0.0.1'], maxResponseBytes: 1024 })).rejects.toMatchObject({ kind: 'too_large' });
  });
});
