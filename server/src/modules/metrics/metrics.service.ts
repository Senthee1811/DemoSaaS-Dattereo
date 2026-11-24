import { Global, Injectable, Module } from '@nestjs/common';

type Labels = Record<string, string | number | boolean>;
const BOUNDS_MS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 30000, 60000];

const esc = (v: string) => v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
const labelKey = (l: Labels = {}) =>
  Object.keys(l)
    .sort()
    .map((k) => `${k}="${esc(String(l[k]))}"`)
    .join(',');

/**
 * A tiny in-process Prometheus-format registry (no dependency). Counters and duration histograms only; gauges are
 * computed at scrape time by the diagnostics endpoint. Metric and label NAMES are fixed by the code that records them;
 * label VALUES are short, bounded enums (outcome, error class, provider). Never put an id, a prompt, a URL or a secret
 * in a label.
 */
@Injectable()
export class MetricsService {
  private counters = new Map<string, Map<string, number>>();
  private hist = new Map<string, Map<string, { buckets: number[]; sum: number; count: number }>>();
  private help = new Map<string, string>();

  describe(name: string, help: string) {
    this.help.set(name, help);
  }

  inc(name: string, labels: Labels = {}, by = 1) {
    const m = this.counters.get(name) ?? new Map<string, number>();
    const k = labelKey(labels);
    m.set(k, (m.get(k) ?? 0) + by);
    this.counters.set(name, m);
  }

  /** Records a duration in milliseconds. */
  observe(name: string, ms: number, labels: Labels = {}) {
    const m = this.hist.get(name) ?? new Map<string, { buckets: number[]; sum: number; count: number }>();
    const k = labelKey(labels);
    const h = m.get(k) ?? { buckets: new Array(BOUNDS_MS.length).fill(0), sum: 0, count: 0 };
    BOUNDS_MS.forEach((b, i) => {
      if (ms <= b) h.buckets[i]++;
    });
    h.sum += ms;
    h.count++;
    m.set(k, h);
    this.hist.set(name, m);
  }

  /** Times an async function and records its duration, including when it throws. */
  async time<T>(name: string, fn: () => Promise<T>, labels: Labels = {}): Promise<T> {
    const t0 = process.hrtime.bigint();
    try {
      return await fn();
    } finally {
      this.observe(name, Number(process.hrtime.bigint() - t0) / 1e6, labels);
    }
  }

  counterValue(name: string, labels: Labels = {}): number {
    return this.counters.get(name)?.get(labelKey(labels)) ?? 0;
  }

  render(gauges: Array<{ name: string; help?: string; labels?: Labels; value: number }> = []): string {
    const out: string[] = [];
    const head = (name: string, type: string) => {
      const h = this.help.get(name);
      if (h) out.push(`# HELP ${name} ${h}`);
      out.push(`# TYPE ${name} ${type}`);
    };
    for (const [name, m] of this.counters) {
      head(name, 'counter');
      for (const [k, v] of m) out.push(`${name}${k ? `{${k}}` : ''} ${v}`);
    }
    for (const [name, m] of this.hist) {
      head(name, 'histogram');
      for (const [k, h] of m) {
        BOUNDS_MS.forEach((b, i) => out.push(`${name}_bucket{${k ? `${k},` : ''}le="${b}"} ${h.buckets[i]}`));
        out.push(`${name}_bucket{${k ? `${k},` : ''}le="+Inf"} ${h.count}`);
        out.push(`${name}_sum${k ? `{${k}}` : ''} ${h.sum}`);
        out.push(`${name}_count${k ? `{${k}}` : ''} ${h.count}`);
      }
    }
    const seen = new Set<string>();
    for (const g of gauges) {
      if (!seen.has(g.name)) {
        seen.add(g.name);
        if (g.help) out.push(`# HELP ${g.name} ${g.help}`);
        out.push(`# TYPE ${g.name} gauge`);
      }
      const k = labelKey(g.labels);
      out.push(`${g.name}${k ? `{${k}}` : ''} ${g.value}`);
    }
    return out.join('\n') + '\n';
  }
}

@Global()
@Module({ providers: [MetricsService], exports: [MetricsService] })
export class MetricsModule {}
