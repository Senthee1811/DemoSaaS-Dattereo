import { EventEmitter } from 'events';

/**
 * A controllable stand-in for https.request. Records what the client asked for (options, exact body bytes) and answers
 * with a status, a network error, or a hang. Lets tests assert on pinning without any real socket or DNS.
 */
export interface Captured {
  options: any;
  body: string;
  /** What the pinned lookup returns for the hostname (what a real socket would connect to). */
  lookedUp?: string;
}

export function fakeTransport(behaviour: number | Error | 'hang' | { status: number; bytes: number } = 200) {
  const calls: Captured[] = [];
  const impl = ((options: any, cb: (res: any) => void) => {
    const req: any = new EventEmitter();
    const cap: Captured = { options, body: '' };
    calls.push(cap);
    req.destroy = () => undefined;
    req.end = (payload: Buffer) => {
      cap.body = payload.toString('utf8');
      if (options.lookup) options.lookup(options.hostname, { all: false }, (_e: any, address: string) => (cap.lookedUp = address));
      if (behaviour === 'hang') return;
      if (behaviour instanceof Error) return void setImmediate(() => req.emit('error', behaviour));
      const res: any = new EventEmitter();
      res.destroy = () => undefined;
      const status = typeof behaviour === 'number' ? behaviour : behaviour.status;
      res.statusCode = status;
      setImmediate(() => {
        cb(res);
        if (typeof behaviour === 'object') res.emit('data', Buffer.alloc(behaviour.bytes));
        else res.emit('end');
      });
    };
    return req;
  }) as any;
  return { impl, calls };
}
