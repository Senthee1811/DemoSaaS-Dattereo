# Cost Insights benchmark (2026-11-24)

Environment: node v24.22.1, win32; Postgres 16.15, shared_buffers=128MB, work_mem=4MB. Single machine, Postgres in Docker, the benchmark and database share CPU. **These numbers describe this environment only.**
Data: synthetic. 8 projects (skewed: the busiest holds roughly 40% of rows), 6 models (skewed), 5 applications + 25% unattributed, 4 teams + 30% unattributed, 20 gateway keys on 10% of rows, 60 days of history with a denser last day, 2% blocked, plus a second organization holding ~3% of rows. Warm cache (each endpoint is run once untimed first).

## 1,000,000 request rows

| endpoint | p50 ms | p95 ms | p99 ms | max ms | DB queries/call | DB time/call ms | heap Δ MB |
|---|---:|---:|---:|---:|---:|---:|---:|
| attribution by model (org, 30d) | 1549.6 | 2040.3 | 2040.3 | 2040.3 | 2 | 2983.4 | 0.3 |
| attribution by application (org, 30d) | 1200.3 | 1668.4 | 1668.4 | 1668.4 | 2 | 2299.1 | 0.2 |
| attribution by key (org, 30d) | 1259.7 | 1821.6 | 1821.6 | 1821.6 | 3 | 2499.0 | 0.3 |
| attribution by model (1 project, 30d) | 232.1 | 370.1 | 370.1 | 370.1 | 3 | 472.5 | 0.2 |
| investigation 24h vs 7d (org) | 939.8 | 1256.2 | 1256.2 | 1256.2 | 16 | 2561.0 | 1.4 |
| investigation 24h vs 7d (1 project) | 478.4 | 1045.6 | 1045.6 | 1045.6 | 15 | 1400.2 | 1.2 |
| investigation 30d vs 7d (org) | 2748.6 | 4036.2 | 4036.2 | 4036.2 | 11 | 4578.9 | 0.9 |
| forecast (org) | 960.9 | 1354.3 | 1354.3 | 1354.3 | 3 | 1065.4 | 0.2 |
| forecast (1 project) | 287.9 | 398.8 | 398.8 | 398.8 | 3 | 580.1 | 0.2 |
| model comparison 30d (org) | 1218.5 | 3137.5 | 3137.5 | 3137.5 | 2 | 1543.7 | 0.6 |
| model comparison 30d (1 project) | 1894.1 | 2809.9 | 2809.9 | 2809.9 | 3 | 1890.6 | 0.6 |
| recommendations list | 11.3 | 20.4 | 20.4 | 20.4 | 2 | 5.0 | 0.3 |
| notification history (50) | 17.8 | 24.7 | 24.7 | 24.7 | 2 | 18.1 | 0.2 |
| inbox page (20) + unread count | 21.4 | 33.9 | 33.9 | 33.9 | 3 | 37.9 | 0.2 |

Iterations per endpoint: 15 (so p99 is effectively the max of 15 samples).

## Query plans at 1,000,000 rows (EXPLAIN ANALYZE, BUFFERS; one per distinct query)

### attribution by model (org, 30d): 911.141 ms
```sql
SELECT SUM("tokens_in") AS "_sum$tokens_in", SUM("tokens_out") AS "_sum$tokens_out", SUM("cost_estimate") AS "_sum$cost_estimate", COUNT("id") AS "_count$id" FROM (SELECT "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"
```
```
Aggregate  (cost=29662.36..29662.37 rows=1 width=56) (actual time=910.874..910.876 rows=1 loops=1)
  Buffers: shared hit=1 read=173370 written=2
  ->  Nested Loop  (cost=3431.41..29644.41 rows=1795 width=47) (actual time=53.622..827.795 rows=523096 loops=1)
        Buffers: shared hit=1 read=173370 written=2
        ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.027..0.040 rows=8 loops=1)
              Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Filter: (id IS NOT NULL)
              Heap Blocks: exact=1
              Buffers: shared hit=1 read=1
              ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.017..0.018 rows=8 loops=1)
                    Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Buffers: shared read=1
        ->  Bitmap Heap Scan on requests  (cost=3427.24..29036.65 rows=59825 width=84) (actual time=18.553..95.607 rows=65387 loops=8)
              Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-10-25 10:52:26.395'::timestamp without time zone) AND (created_at < '2026-11-24 10:52:26.395'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 1313
              Heap Blocks: exact=167657
              Buffers: shared read=173369 written=2
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..3412.29 rows=61109 width=0) (actual time=15.445..15.445 rows=66700 loops=8)
                    Index Cond: ((project_id = j0.id) AND (created_at >= '2026-10-25 10:52:26.395'::timestamp without time zone) AND (created_at < '2026-11-24 10:52:26.395'::timestamp without time zone))
                    Buffers: shared read=5712
Planning:
  Buffers: shared read=4
Planning Time: 0.667 ms
Execution Time: 911.141 ms
```

### attribution by model (org, 30d): 1083.257 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."model" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"."org_
```
```
GroupAggregate  (cost=29741.42..29768.42 rows=6 width=67) (actual time=953.277..1077.642 rows=6 loops=1)
  Group Key: requests.model
  Buffers: shared hit=1 read=173370, temp read=4548 written=4562
  ->  Sort  (cost=29741.42..29745.91 rows=1795 width=58) (actual time=933.051..1000.113 rows=523096 loops=1)
        Sort Key: requests.model
        Sort Method: external merge  Disk: 36384kB
        Buffers: shared hit=1 read=173370, temp read=4548 written=4562
        ->  Nested Loop  (cost=3431.41..29644.41 rows=1795 width=58) (actual time=30.842..744.130 rows=523096 loops=1)
              Buffers: shared hit=1 read=173370
              ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.020..0.032 rows=8 loops=1)
                    Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Filter: (id IS NOT NULL)
                    Heap Blocks: exact=1
                    Buffers: shared hit=1 read=1
                    ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.012..0.013 rows=8 loops=1)
                          Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                          Buffers: shared read=1
              ->  Bitmap Heap Scan on requests  (cost=3427.24..29036.65 rows=59825 width=95) (actual time=14.287..86.204 rows=65387 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-10-25 10:52:26.395'::timestamp without time zone) AND (created_at < '2026-11-24 10:52:26.395'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 1313
                    Heap Blocks: exact=167657
                    Buffers: shared read=173369
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..3412.29 rows=61109 width=0) (actual time=11.506..11.506 rows=66700 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-10-25 10:52:26.395'::timestamp without time zone) AND (created_at < '2026-11-24 10:52:26.395'::timestamp without time zone))
                          Buffers: shared read=5712
Planning:
  Buffers: shared read=4
Planning Time: 0.288 ms
Execution Time: 1083.257 ms
```

### attribution by application (org, 30d): 1318.230 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."application" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"
```
```
GroupAggregate  (cost=29741.39..29768.38 rows=5 width=66) (actual time=1159.763..1311.126 rows=6 loops=1)
  Group Key: requests.application
  Buffers: shared hit=1 read=173370, temp read=4317 written=4331
  ->  Sort  (cost=29741.39..29745.88 rows=1795 width=57) (actual time=1132.592..1216.757 rows=523092 loops=1)
        Sort Key: requests.application
        Sort Method: external merge  Disk: 34536kB
        Buffers: shared hit=1 read=173370, temp read=4317 written=4331
        ->  Nested Loop  (cost=3431.39..29644.38 rows=1795 width=57) (actual time=30.219..896.665 rows=523092 loops=1)
              Buffers: shared hit=1 read=173370
              ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.020..0.131 rows=8 loops=1)
                    Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Filter: (id IS NOT NULL)
                    Heap Blocks: exact=1
                    Buffers: shared hit=1 read=1
                    ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.013..0.014 rows=8 loops=1)
                          Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                          Buffers: shared read=1
              ->  Bitmap Heap Scan on requests  (cost=3427.23..29036.62 rows=59825 width=94) (actual time=14.856..104.390 rows=65386 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-10-25 10:52:53.144'::timestamp without time zone) AND (created_at < '2026-11-24 10:52:53.144'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 1313
                    Heap Blocks: exact=167657
                    Buffers: shared read=173369
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..3412.28 rows=61108 width=0) (actual time=11.664..11.664 rows=66699 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-10-25 10:52:53.144'::timestamp without time zone) AND (created_at < '2026-11-24 10:52:53.144'::timestamp without time zone))
                          Buffers: shared read=5712
Planning:
  Buffers: shared read=4
Planning Time: 0.343 ms
Execution Time: 1318.230 ms
```

### attribution by key (org, 30d): 1085.884 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."gateway_key_id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("
```
```
GroupAggregate  (cost=29741.38..29768.56 rows=20 width=93) (actual time=944.663..1079.599 rows=21 loops=1)
  Group Key: requests.gateway_key_id
  Buffers: shared hit=1 read=173369, temp read=3997 written=4010
  ->  Sort  (cost=29741.38..29745.87 rows=1795 width=84) (actual time=943.859..998.755 rows=523088 loops=1)
        Sort Key: requests.gateway_key_id
        Sort Method: external merge  Disk: 31976kB
        Buffers: shared hit=1 read=173369, temp read=3997 written=4010
        ->  Nested Loop  (cost=3431.39..29644.37 rows=1795 width=84) (actual time=34.032..777.610 rows=523088 loops=1)
              Buffers: shared hit=1 read=173369
              ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.020..0.033 rows=8 loops=1)
                    Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Filter: (id IS NOT NULL)
                    Heap Blocks: exact=1
                    Buffers: shared hit=1 read=1
                    ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.012..0.013 rows=8 loops=1)
                          Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                          Buffers: shared read=1
              ->  Bitmap Heap Scan on requests  (cost=3427.23..29036.62 rows=59824 width=121) (actual time=14.291..89.806 rows=65386 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-10-25 10:53:14.044'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:14.044'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 1313
                    Heap Blocks: exact=167656
                    Buffers: shared read=173368
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..3412.28 rows=61108 width=0) (actual time=11.151..11.151 rows=66699 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-10-25 10:53:14.044'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:14.044'::timestamp without time zone))
                          Buffers: shared read=5712
Planning:
  Buffers: shared read=4
Planning Time: 0.349 ms
Execution Time: 1085.884 ms
```

### attribution by key (org, 30d): 0.142 ms
```sql
SELECT "public"."gateway_api_keys"."id", "public"."gateway_api_keys"."key_name", "public"."gateway_api_keys"."key_prefix" FROM "public"."gateway_api_keys" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."gateway_api_keys"."project_id") WHERE ("public"."gateway_api_keys"."id" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) AND ("j0"."org_id" = $21 AND ("
```
```
Nested Loop  (cost=4.36..17.73 rows=1 width=96) (actual time=0.077..0.093 rows=20 loops=1)
  Buffers: shared hit=15 read=3
  ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.028..0.030 rows=8 loops=1)
        Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Filter: (id IS NOT NULL)
        Heap Blocks: exact=1
        Buffers: shared hit=1 read=1
        ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.022..0.022 rows=8 loops=1)
              Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared read=1
  ->  Index Scan using gateway_api_keys_project_id_idx on gateway_api_keys  (cost=0.20..8.22 rows=1 width=128) (actual time=0.007..0.007 rows=2 loops=8)
        Index Cond: (project_id = j0.id)
        Filter: (id = ANY ('{14488fa6-7ebe-4011-8b8d-c3ac65bd20bc,2b8b87b3-c353-4461-82f5-badcaa7128e3,65f643dd-d24b-4393-ae18-df113feec7a7,70551420-71a8-4dae-b99d-a6bfc461db46,75c0b7b0-b04b-4594-9427-a3bb553e56b3,76e09d50-3ac2-40d9-ac89-089e62242113,77128165-7243-4387-b090-c51de0632e8b,98953f04-2751-46b8-8cd1-92611f6985c9,99e68309-bf6a-4ca7-801e-5a9e4473cee9,b167e804-8862-4491-99f1-e13d9f876048,b52a038d-2ed9-4641-bcfd-7912b6887170,b5e1e6b7-bed1-40aa-8574-f1ae59c4213c,b662eab1-13e6-4242-9001-b5bbc05ade29,cc2c0e05-201f-452c-8660-4e1adec052fa,e957e821-f736-4b4b-94ad-46bd57675ce0,ea1af094-8321-458e-b7de-dfc4981d4440,eb53383e-1ab8-4b75-bdb8-36f199568cf9,f75b6142-eef9-4de5-80be-31734c2f3e59,f9b71278-c7b0-42bd-848b-5902901c5fa3,fd1f07ce-60ab-4513-9583-0cbb46196901}'::text[]))
        Buffers: shared hit=14 read=2
Planning Time: 0.239 ms
Execution Time: 0.142 ms
```

### attribution by model (1 project, 30d): 0.066 ms
```sql
SELECT "public"."projects"."id", "public"."projects"."name", "public"."projects"."budget_monthly" FROM "public"."projects" WHERE ("public"."projects"."id" = $1 AND "public"."projects"."org_id" = $2) LIMIT $3 OFFSET $4
```
```
Limit  (cost=0.15..8.17 rows=1 width=80) (actual time=0.044..0.044 rows=1 loops=1)
  Buffers: shared hit=1 read=1
  ->  Index Scan using projects_pkey on projects  (cost=0.15..8.17 rows=1 width=80) (actual time=0.042..0.043 rows=1 loops=1)
        Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
        Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Buffers: shared hit=1 read=1
Planning Time: 0.103 ms
Execution Time: 0.066 ms
```

### attribution by model (1 project, 30d): 212.649 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."model" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"."org_
```
```
HashAggregate  (cost=44364.62..44364.69 rows=6 width=67) (actual time=212.454..212.458 rows=6 loops=1)
  Group Key: requests.model
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=2 read=26764
  ->  Nested Loop  (cost=11622.56..41827.79 rows=202946 width=58) (actual time=32.893..165.776 rows=196113 loops=1)
        Buffers: shared hit=2 read=26764
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.018..0.023 rows=1 loops=1)
              Index Cond: ((id IS NOT NULL) AND (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text))
              Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=2
        ->  Bitmap Heap Scan on requests  (cost=11622.41..39790.16 rows=202946 width=95) (actual time=32.873..145.819 rows=196113 loops=1)
              Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-10-25 10:53:34.954'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:34.956'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 10502
              Heap Blocks: exact=24538
              Buffers: shared read=26764
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..11571.67 rows=207300 width=0) (actual time=29.336..29.336 rows=206615 loops=1)
                    Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-10-25 10:53:34.954'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:34.956'::timestamp without time zone))
                    Buffers: shared read=2226
Planning:
  Buffers: shared read=4
Planning Time: 0.256 ms
Execution Time: 212.649 ms
```

### attribution by model (1 project, 30d): 194.848 ms
```sql
SELECT SUM("tokens_in") AS "_sum$tokens_in", SUM("tokens_out") AS "_sum$tokens_out", SUM("cost_estimate") AS "_sum$cost_estimate", COUNT("id") AS "_count$id" FROM (SELECT "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"
```
```
Aggregate  (cost=43857.25..43857.26 rows=1 width=56) (actual time=194.585..194.588 rows=1 loops=1)
  Buffers: shared hit=1 read=26765
  ->  Nested Loop  (cost=11622.56..41827.79 rows=202946 width=47) (actual time=33.118..168.399 rows=196113 loops=1)
        Buffers: shared hit=1 read=26765
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.021..0.026 rows=1 loops=1)
              Index Cond: ((id IS NOT NULL) AND (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text))
              Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=1 read=1
        ->  Bitmap Heap Scan on requests  (cost=11622.41..39790.16 rows=202946 width=84) (actual time=33.095..148.134 rows=196113 loops=1)
              Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-10-25 10:53:34.954'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:34.956'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 10502
              Heap Blocks: exact=24538
              Buffers: shared read=26764
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..11571.67 rows=207300 width=0) (actual time=29.725..29.725 rows=206615 loops=1)
                    Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-10-25 10:53:34.954'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:34.956'::timestamp without time zone))
                    Buffers: shared read=2226
Planning:
  Buffers: shared read=4
Planning Time: 0.272 ms
Execution Time: 194.848 ms
```

### investigation 24h vs 7d (org): 133.222 ms
```sql
 SELECT date_trunc('day', r.created_at) AS day, COALESCE(SUM(r.cost_estimate), 0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.created_at >= $2 AND r.created_at < $3 GROUP BY 1 ORDER BY 1
```
```
Finalize GroupAggregate  (cost=29146.50..29237.20 rows=716 width=40) (actual time=124.673..132.802 rows=8 loops=1)
  Group Key: (date_trunc('day'::text, r.created_at))
  Buffers: shared hit=46 read=24678
  ->  Gather Merge  (cost=29146.50..29221.99 rows=596 width=40) (actual time=122.683..132.725 rows=24 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=46 read=24678
        ->  Partial GroupAggregate  (cost=28146.47..28153.18 rows=298 width=40) (actual time=106.254..113.998 rows=8 loops=3)
              Group Key: (date_trunc('day'::text, r.created_at))
              Buffers: shared hit=46 read=24678
              ->  Sort  (cost=28146.47..28147.22 rows=298 width=14) (actual time=105.100..108.010 rows=33345 loops=3)
                    Sort Key: (date_trunc('day'::text, r.created_at))
                    Sort Method: quicksort  Memory: 3163kB
                    Buffers: shared hit=46 read=24678
                    Worker 0:  Sort Method: quicksort  Memory: 1918kB
                    Worker 1:  Sort Method: quicksort  Memory: 1899kB
                    ->  Hash Join  (cost=2789.18..28134.23 rows=298 width=14) (actual time=14.049..97.231 rows=33345 loops=3)
                          Hash Cond: (r.project_id = p.id)
                          Buffers: shared hit=33 read=24677
                          ->  Parallel Bitmap Heap Scan on requests r  (cost=2779.65..28004.89 rows=44724 width=51) (actual time=13.907..81.819 rows=34364 loops=3)
                                Recheck Cond: ((created_at >= '2026-11-16 10:53:40.737'::timestamp without time zone) AND (created_at < '2026-11-23 10:53:40.737'::timestamp without time zone))
                                Filter: (NOT is_blocked)
                                Rows Removed by Filter: 708
                                Heap Blocks: exact=10148
                                Buffers: shared read=24668
                                ->  Bitmap Index Scan on requests_created_at_idx  (cost=0.00..2752.82 rows=109639 width=0) (actual time=16.843..16.844 rows=105216 loops=1)
                                      Index Cond: ((created_at >= '2026-11-16 10:53:40.737'::timestamp without time zone) AND (created_at < '2026-11-23 10:53:40.737'::timestamp without time zone))
                                      Buffers: shared read=409
                          ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.047..0.049 rows=8 loops=3)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=6 read=2
                                ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.036..0.038 rows=8 loops=3)
                                      Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                      Heap Blocks: exact=1
                                      Buffers: shared hit=6 read=2
                                      ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.023..0.024 rows=8 loops=3)
                                            Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                            Buffers: shared hit=3 read=2
Planning Time: 0.463 ms
Execution Time: 133.222 ms
```

### investigation 24h vs 7d (org): 233.819 ms
```sql
 SELECT date_trunc('hour', r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.created_at >= $2 AND r.created_at < $3 GROUP BY 1 ORDER BY 1
```
```
Finalize GroupAggregate  (cost=32069.74..32267.47 rows=1451 width=64) (actual time=201.345..232.974 rows=193 loops=1)
  Group Key: (date_trunc('hour'::text, r.created_at))
  Buffers: shared hit=16182 read=8414, temp read=844 written=846
  ->  Gather Merge  (cost=32069.74..32227.56 rows=1210 width=64) (actual time=201.255..232.285 rows=579 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16182 read=8414, temp read=844 written=846
        ->  Partial GroupAggregate  (cost=31069.72..31087.87 rows=605 width=64) (actual time=180.878..206.528 rows=193 loops=3)
              Group Key: (date_trunc('hour'::text, r.created_at))
              Buffers: shared hit=16182 read=8414, temp read=844 written=846
              ->  Sort  (cost=31069.72..31071.23 rows=605 width=22) (actual time=180.802..189.850 rows=69917 loops=3)
                    Sort Key: (date_trunc('hour'::text, r.created_at))
                    Sort Method: external merge  Disk: 2664kB
                    Buffers: shared hit=16182 read=8414, temp read=844 written=846
                    Worker 0:  Sort Method: external merge  Disk: 2208kB
                    Worker 1:  Sort Method: external merge  Disk: 1880kB
                    ->  Hash Join  (cost=9.53..31041.77 rows=605 width=22) (actual time=1.230..146.067 rows=69917 loops=3)
                          Hash Cond: (r.project_id = p.id)
                          Buffers: shared hit=16169 read=8413
                          ->  Parallel Seq Scan on requests r  (cost=0.00..30789.36 rows=90670 width=59) (actual time=0.023..104.268 rows=72083 loops=3)
                                Filter: ((NOT is_blocked) AND (created_at >= '2026-11-16 10:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:40.737'::timestamp without time zone))
                                Rows Removed by Filter: 261250
                                Buffers: shared hit=16134 read=8406
                          ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=1.122..1.124 rows=8 loops=3)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=7 read=1
                                ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=1.099..1.101 rows=8 loops=3)
                                      Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                      Heap Blocks: exact=1
                                      Buffers: shared hit=7 read=1
                                      ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.017..0.017 rows=8 loops=3)
                                            Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                            Buffers: shared hit=4 read=1
Planning:
  Buffers: shared read=4
Planning Time: 0.322 ms
Execution Time: 233.819 ms
```

### investigation 24h vs 7d (org): 284.096 ms
```sql
 SELECT GROUPING(r.project_id) AS g_project, r.project_id AS k_project, GROUPING(r.model) AS g_model, r.model AS k_model, GROUPING(r.gateway_key_id) AS g_key, r.gateway_key_id AS k_key, GROUPING(r.application) AS g_application, r.application AS k_application, GROUPING(r.team) AS g_team, r.team AS k_team, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COAL
```
```
MixedAggregate  (cost=29223.49..29355.44 rows=45 width=177) (actual time=148.630..283.066 rows=47 loops=1)
  Hash Key: r.team
  Hash Key: r.application
  Hash Key: r.gateway_key_id
  Hash Key: r.model
  Group Key: r.project_id
  Group Key: ()
  Batches: 1  Memory Usage: 80kB
  Buffers: shared hit=137 read=24757, temp read=1246 written=1248
  ->  Gather Merge  (cost=29223.49..29308.63 rows=731 width=115) (actual time=138.871..179.349 rows=109199 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=137 read=24757, temp read=1246 written=1248
        ->  Sort  (cost=28223.46..28224.23 rows=305 width=115) (actual time=131.376..139.819 rows=36400 loops=3)
              Sort Key: r.project_id
              Sort Method: external merge  Disk: 3840kB
              Buffers: shared hit=137 read=24757, temp read=1246 written=1248
              Worker 0:  Sort Method: external merge  Disk: 2856kB
              Worker 1:  Sort Method: external merge  Disk: 3272kB
              ->  Hash Join  (cost=2849.31..28210.88 rows=305 width=115) (actual time=17.702..103.368 rows=36400 loops=3)
                    Hash Cond: (r.project_id = p.id)
                    Buffers: shared hit=122 read=24756
                    ->  Parallel Bitmap Heap Scan on requests r  (cost=2839.78..28079.74 rows=45684 width=115) (actual time=17.465..88.951 rows=37540 loops=3)
                          Recheck Cond: ((created_at >= '2026-11-23 10:53:40.737'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:40.737'::timestamp without time zone))
                          Filter: (NOT is_blocked)
                          Rows Removed by Filter: 748
                          Heap Blocks: exact=9345
                          Buffers: shared hit=14 read=24756
                          ->  Bitmap Index Scan on requests_created_at_idx  (cost=0.00..2812.37 rows=111994 width=0) (actual time=17.184..17.184 rows=114862 loops=1)
                                Index Cond: ((created_at >= '2026-11-23 10:53:40.737'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:40.737'::timestamp without time zone))
                                Buffers: shared hit=2 read=392
                    ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.046..0.048 rows=8 loops=3)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=8
                          ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.025..0.028 rows=8 loops=3)
                                Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                Heap Blocks: exact=1
                                Buffers: shared hit=8
                                ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.014..0.014 rows=8 loops=3)
                                      Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
```

### investigation 24h vs 7d (org): 0.160 ms
```sql
SELECT "public"."projects"."id", "public"."projects"."name" FROM "public"."projects" WHERE ("public"."projects"."org_id" = $1 AND "public"."projects"."id" IN ($2,$3,$4,$5,$6,$7,$8,$9)) OFFSET $10
```
```
Bitmap Heap Scan on projects  (cost=4.16..9.52 rows=1 width=64) (actual time=0.033..0.037 rows=8 loops=1)
  Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
  Filter: (id = ANY ('{078f22f9-3af2-4c4b-be23-bc73893dca13,554c234b-70e5-40d0-abc4-74e3f6f5e8a5,60a24401-5142-4ea3-8769-e7370b1ddbfe,a26c2bf8-3f9d-4371-802c-fa2273c096a6,c2e55617-442a-42bf-851a-39bfd23b7ff9,c5d30145-53c4-458d-a93d-7e5768971bde,d039080f-b08a-43af-877d-f4e2d16d6a70,e3126c82-173b-4adc-ae90-ba8fbd9c7448}'::text[]))
  Heap Blocks: exact=1
  Buffers: shared hit=2
  ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.020..0.021 rows=8 loops=1)
        Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Buffers: shared hit=1
Planning Time: 0.133 ms
Execution Time: 0.160 ms
```

### investigation 24h vs 7d (org): 501.641 ms
```sql
SELECT "public"."requests"."id", "public"."requests"."created_at", "public"."requests"."project_id", "public"."requests"."model", "public"."requests"."provider"::text, "public"."requests"."gateway_key_id", "public"."requests"."application", "public"."requests"."team", "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."reserv
```
```
Limit  (cost=21825.61..21825.64 rows=10 width=197) (actual time=501.430..501.435 rows=10 loops=1)
  Buffers: shared hit=28674 read=48547
  ->  Sort  (cost=21825.61..21826.52 rows=365 width=197) (actual time=501.427..501.431 rows=10 loops=1)
        Sort Key: requests.cost_estimate DESC
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=28674 read=48547
        ->  Nested Loop  (cost=703.18..21817.72 rows=365 width=197) (actual time=12.103..423.922 rows=109199 loops=1)
              Buffers: shared hit=28674 read=48547
              ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.016..0.032 rows=8 loops=1)
                    Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Filter: (id IS NOT NULL)
                    Heap Blocks: exact=1
                    Buffers: shared hit=2
                    ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.008..0.009 rows=8 loops=1)
                          Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                          Buffers: shared hit=1
              ->  Bitmap Heap Scan on requests  (cost=699.02..21684.57 rows=12182 width=169) (actual time=6.009..46.533 rows=13650 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:53:40.737'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:40.737'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 271
                    Heap Blocks: exact=76019
                    Buffers: shared hit=28672 read=48547
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..695.97 rows=12444 width=0) (actual time=4.285..4.285 rows=13921 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:53:40.737'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:40.737'::timestamp without time zone))
                          Buffers: shared hit=6 read=1194
Planning:
  Buffers: shared hit=2 read=2
Planning Time: 0.480 ms
Execution Time: 501.641 ms
```

### investigation 24h vs 7d (1 project): 152.719 ms
```sql
 SELECT GROUPING(r.model) AS g_model, r.model AS k_model, GROUPING(r.gateway_key_id) AS g_key, r.gateway_key_id AS k_key, GROUPING(r.application) AS g_application, r.application AS k_application, GROUPING(r.team) AS g_team, r.team AS k_team, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projec
```
```
MixedAggregate  (cost=2319.29..31269.62 rows=36 width=136) (actual time=152.275..152.296 rows=39 loops=1)
  Hash Key: r.model
  Hash Key: r.gateway_key_id
  Hash Key: r.application
  Hash Key: r.team
  Group Key: ()
  Batches: 1  Memory Usage: 80kB
  Buffers: shared hit=6591 read=13593
  ->  Nested Loop  (cost=2319.29..28841.21 rows=40460 width=78) (actual time=24.191..110.177 rows=37319 loops=1)
        Buffers: shared hit=6591 read=13593
        ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.064..0.069 rows=1 loops=1)
              Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
              Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=1 read=1
        ->  Bitmap Heap Scan on requests r  (cost=2319.14..28428.44 rows=40460 width=115) (actual time=24.120..103.326 rows=37319 loops=1)
              Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-16 10:53:57.208'::timestamp without time zone) AND (created_at < '2026-11-23 10:53:57.208'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 2059
              Heap Blocks: exact=19757
              Buffers: shared hit=6590 read=13592
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..2309.03 rows=41328 width=0) (actual time=19.058..19.059 rows=39378 loops=1)
                    Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-16 10:53:57.208'::timestamp without time zone) AND (created_at < '2026-11-23 10:53:57.208'::timestamp without time zone))
                    Buffers: shared hit=1 read=424
Planning Time: 0.489 ms
Execution Time: 152.719 ms
```

### investigation 24h vs 7d (1 project): 131.295 ms
```sql
 SELECT date_trunc('day', r.created_at) AS day, COALESCE(SUM(r.cost_estimate), 0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.project_id = $2 AND r.created_at >= $3 AND r.created_at < $4 GROUP BY 1 ORDER BY 1
```
```
GroupAggregate  (cost=32038.40..32948.75 rows=40460 width=40) (actual time=122.764..130.821 rows=8 loops=1)
  Group Key: (date_trunc('day'::text, r.created_at))
  Buffers: shared hit=856 read=19328
  ->  Sort  (cost=32038.40..32139.55 rows=40460 width=14) (actual time=121.782..124.936 rows=37319 loops=1)
        Sort Key: (date_trunc('day'::text, r.created_at))
        Sort Method: quicksort  Memory: 2994kB
        Buffers: shared hit=856 read=19328
        ->  Nested Loop  (cost=2319.29..28942.36 rows=40460 width=14) (actual time=12.495..112.412 rows=37319 loops=1)
              Buffers: shared hit=856 read=19328
              ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.031..0.037 rows=1 loops=1)
                    Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests r  (cost=2319.14..28428.44 rows=40460 width=51) (actual time=12.455..102.770 rows=37319 loops=1)
                    Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-16 10:53:57.208'::timestamp without time zone) AND (created_at < '2026-11-23 10:53:57.208'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 2059
                    Heap Blocks: exact=19757
                    Buffers: shared hit=855 read=19327
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..2309.03 rows=41328 width=0) (actual time=8.980..8.980 rows=39378 loops=1)
                          Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-16 10:53:57.208'::timestamp without time zone) AND (created_at < '2026-11-23 10:53:57.208'::timestamp without time zone))
                          Buffers: shared hit=1 read=424
Planning Time: 0.198 ms
Execution Time: 131.295 ms
```

### investigation 24h vs 7d (1 project): 234.801 ms
```sql
 SELECT date_trunc('hour', r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.project_id = $2 AND r.created_at >= $3 AND r.created_at < $4 GROUP BY 1 ORDER BY 1
```
```
GroupAggregate  (cost=38434.49..40895.18 rows=82023 width=64) (actual time=210.273..233.804 rows=193 loops=1)
  Group Key: (date_trunc('hour'::text, r.created_at))
  Buffers: shared hit=10 read=24659, temp read=315 written=316
  ->  Sort  (cost=38434.49..38639.54 rows=82023 width=22) (actual time=210.179..217.780 rows=78442 loops=1)
        Sort Key: (date_trunc('hour'::text, r.created_at))
        Sort Method: external merge  Disk: 2520kB
        Buffers: shared hit=10 read=24659, temp read=315 written=316
        ->  Nested Loop  (cost=4700.37..31739.88 rows=82023 width=22) (actual time=23.716..178.444 rows=78442 loops=1)
              Buffers: shared hit=10 read=24659
              ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.050..0.056 rows=1 loops=1)
                    Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests r  (cost=4700.22..30706.42 rows=82023 width=59) (actual time=23.654..156.521 rows=78442 loops=1)
                    Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-16 10:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:57.208'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 4242
                    Heap Blocks: exact=23790
                    Buffers: shared hit=9 read=24658
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..4679.71 rows=83783 width=0) (actual time=19.316..19.317 rows=82684 loops=1)
                          Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-16 10:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:57.208'::timestamp without time zone))
                          Buffers: shared hit=1 read=876
Planning:
  Buffers: shared read=4
Planning Time: 0.438 ms
Execution Time: 234.801 ms
```

### investigation 24h vs 7d (1 project): 126.312 ms
```sql
SELECT "public"."requests"."id", "public"."requests"."created_at", "public"."requests"."project_id", "public"."requests"."model", "public"."requests"."provider"::text, "public"."requests"."gateway_key_id", "public"."requests"."application", "public"."requests"."team", "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."reserv
```
```
Limit  (cost=29934.94..29934.97 rows=10 width=197) (actual time=126.045..126.049 rows=10 loops=1)
  Buffers: shared hit=1 read=20847
  ->  Sort  (cost=29934.94..30038.25 rows=41325 width=197) (actual time=126.042..126.045 rows=10 loops=1)
        Sort Key: requests.cost_estimate DESC
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=1 read=20847
        ->  Nested Loop  (cost=2370.55..29041.92 rows=41325 width=197) (actual time=13.603..106.856 rows=40910 loops=1)
              Buffers: shared hit=1 read=20847
              ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.024..0.031 rows=1 loops=1)
                    Index Cond: ((id IS NOT NULL) AND (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text))
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests  (cost=2370.41..28413.88 rows=41325 width=169) (actual time=13.570..94.533 rows=40910 loops=1)
                    Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-23 10:53:57.208'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:57.208'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 2170
                    Heap Blocks: exact=20394
                    Buffers: shared read=20846
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..2360.08 rows=42212 width=0) (actual time=10.290..10.290 rows=43080 loops=1)
                          Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-23 10:53:57.208'::timestamp without time zone) AND (created_at < '2026-11-24 10:53:57.208'::timestamp without time zone))
                          Buffers: shared read=452
Planning:
  Buffers: shared read=4
Planning Time: 0.280 ms
Execution Time: 126.312 ms
```

### investigation 30d vs 7d (org): 377.942 ms
```sql
 SELECT date_trunc('day', r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.created_at >= $2 AND r.created_at < $3 GROUP BY 1 ORDER BY 1
```
```
Finalize GroupAggregate  (cost=32619.00..33207.00 rows=4317 width=64) (actual time=316.382..376.278 rows=38 loops=1)
  Group Key: (date_trunc('day'::text, r.created_at))
  Buffers: shared hit=16211 read=8385, temp read=2533 written=2543
  ->  Gather Merge  (cost=32619.00..33088.27 rows=3598 width=64) (actual time=315.193..376.002 rows=114 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16211 read=8385, temp read=2533 written=2543
        ->  Partial GroupAggregate  (cost=31618.98..31672.95 rows=1799 width=64) (actual time=242.950..303.136 rows=38 loops=3)
              Group Key: (date_trunc('day'::text, r.created_at))
              Buffers: shared hit=16211 read=8385, temp read=2533 written=2543
              ->  Sort  (cost=31618.98..31623.48 rows=1799 width=22) (actual time=241.467..264.831 rows=209948 loops=3)
                    Sort Key: (date_trunc('day'::text, r.created_at))
                    Sort Method: external merge  Disk: 6528kB
                    Buffers: shared hit=16211 read=8385, temp read=2533 written=2543
                    Worker 0:  Sort Method: external merge  Disk: 5960kB
                    Worker 1:  Sort Method: external merge  Disk: 7776kB
                    ->  Hash Join  (cost=9.53..31521.72 rows=1799 width=22) (actual time=0.206..176.111 rows=209948 loops=3)
                          Hash Cond: (r.project_id = p.id)
                          Buffers: shared hit=16199 read=8383
                          ->  Parallel Seq Scan on requests r  (cost=0.00..30789.36 rows=269841 width=59) (actual time=0.028..95.745 rows=216434 loops=3)
                                Filter: ((NOT is_blocked) AND (created_at >= '2026-10-18 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:54:09.473'::timestamp without time zone))
                                Rows Removed by Filter: 116899
                                Buffers: shared hit=16167 read=8373
                          ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.058..0.060 rows=8 loops=3)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=6 read=2
                                ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.042..0.045 rows=8 loops=3)
                                      Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                      Heap Blocks: exact=1
                                      Buffers: shared hit=6 read=2
                                      ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.017..0.017 rows=8 loops=3)
                                            Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                            Buffers: shared hit=3 read=2
Planning:
  Buffers: shared read=4
Planning Time: 0.328 ms
Execution Time: 377.942 ms
```

### forecast (org): 0.078 ms
```sql
SELECT SUM("budget_monthly") AS "_sum$budget_monthly" FROM (SELECT "public"."projects"."budget_monthly" FROM "public"."projects" WHERE "public"."projects"."org_id" = $1 OFFSET $2) AS "sub"
```
```
Aggregate  (cost=9.51..9.52 rows=1 width=32) (actual time=0.029..0.029 rows=1 loops=1)
  Buffers: shared hit=2
  ->  Bitmap Heap Scan on projects  (cost=4.16..9.50 rows=2 width=16) (actual time=0.020..0.021 rows=8 loops=1)
        Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Heap Blocks: exact=1
        Buffers: shared hit=2
        ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.013..0.014 rows=8 loops=1)
              Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=1
Planning Time: 0.092 ms
Execution Time: 0.078 ms
```

### forecast (org): 198.889 ms
```sql
 SELECT MIN(r.created_at) AS first FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false 
```
```
Finalize Aggregate  (cost=30808.58..30808.59 rows=1 width=8) (actual time=194.143..198.783 rows=1 loops=1)
  Buffers: shared hit=16244 read=8374
  ->  Gather  (cost=30808.37..30808.58 rows=2 width=8) (actual time=193.911..198.773 rows=3 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16244 read=8374
        ->  Partial Aggregate  (cost=29808.37..29808.38 rows=1 width=8) (actual time=189.026..189.029 rows=1 loops=3)
              Buffers: shared hit=16244 read=8374
              ->  Hash Join  (cost=9.53..29801.57 rows=2719 width=8) (actual time=0.411..166.781 rows=316943 loops=3)
                    Hash Cond: (r.project_id = p.id)
                    Buffers: shared hit=16244 read=8374
                    ->  Parallel Seq Scan on requests r  (cost=0.00..28706.24 rows=407875 width=45) (actual time=0.120..88.729 rows=326746 loops=3)
                          Filter: (NOT is_blocked)
                          Rows Removed by Filter: 6588
                          Buffers: shared hit=16166 read=8374
                    ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.047..0.048 rows=8 loops=3)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=8
                          ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.032..0.034 rows=8 loops=3)
                                Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                Heap Blocks: exact=1
                                Buffers: shared hit=8
                                ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.014..0.014 rows=8 loops=3)
                                      Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                      Buffers: shared hit=5
Planning Time: 0.182 ms
Execution Time: 198.889 ms
```

### forecast (1 project): 225.619 ms
```sql
 SELECT MIN(r.created_at) AS first FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.project_id = $2
```
```
Aggregate  (cost=41659.13..41659.14 rows=1 width=8) (actual time=225.548..225.550 rows=1 loops=1)
  Buffers: shared hit=16234 read=8308
  ->  Nested Loop  (cost=0.15..40736.68 rows=368980 width=8) (actual time=0.354..205.057 rows=357189 loops=1)
        Buffers: shared hit=16234 read=8308
        ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.341..0.346 rows=1 loops=1)
              Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
              Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=1 read=1
        ->  Seq Scan on requests r  (cost=0.00..37038.71 rows=368980 width=45) (actual time=0.011..174.858 rows=357189 loops=1)
              Filter: ((NOT is_blocked) AND (project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text))
              Rows Removed by Filter: 642811
              Buffers: shared hit=16233 read=8307
Planning Time: 0.145 ms
Execution Time: 225.619 ms
```

### model comparison 30d (org): 0.062 ms
```sql
SELECT "public"."provider_api_keys"."id", "public"."provider_api_keys"."provider"::text FROM "public"."provider_api_keys" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."provider_api_keys"."project_id") WHERE ("public"."provider_api_keys"."is_active" = $1 AND ("j0"."org_id" = $2 AND ("j0"."id" IS NOT NULL))) OFFSET $3
```
```
Nested Loop  (cost=8.33..19.02 rows=1 width=64) (actual time=0.022..0.023 rows=0 loops=1)
  Buffers: shared hit=18
  ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.011..0.013 rows=8 loops=1)
        Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Filter: (id IS NOT NULL)
        Heap Blocks: exact=1
        Buffers: shared hit=2
        ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.006..0.006 rows=8 loops=1)
              Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=1
  ->  Bitmap Heap Scan on provider_api_keys  (cost=4.16..9.50 rows=1 width=68) (actual time=0.001..0.001 rows=0 loops=8)
        Recheck Cond: (project_id = j0.id)
        Filter: is_active
        Buffers: shared hit=16
        ->  Bitmap Index Scan on provider_api_keys_project_id_provider_idx  (cost=0.00..4.16 rows=2 width=0) (actual time=0.000..0.000 rows=0 loops=8)
              Index Cond: (project_id = j0.id)
              Buffers: shared hit=16
Planning:
  Buffers: shared hit=53 read=12
Planning Time: 0.658 ms
Execution Time: 0.062 ms
```

### model comparison 30d (org): 784.027 ms
```sql
 SELECT r.model, r.provider::text AS provider, COUNT(*) AS requests, COALESCE(SUM(r.tokens_in),0) AS tokens_in, COALESCE(SUM(r.tokens_out),0) AS tokens_out, COALESCE(SUM(r.cached_tokens_in),0) AS cached_in, COALESCE(SUM(r.cost_estimate),0) AS cost, COUNT(r.cached_tokens_in) AS cache_known, AVG(r.tokens_in) AS avg_in, percentile_cont(0.5) WITHIN GROUP (ORDER BY r.tokens_in) AS p50_in, percentile_co
```
```
Limit  (cost=31996.11..31996.12 rows=5 width=223) (actual time=782.007..782.128 rows=5 loops=1)
  Buffers: shared hit=16278 read=8410, temp read=4644 written=4313
  ->  Sort  (cost=31996.11..31996.17 rows=24 width=223) (actual time=782.005..782.124 rows=5 loops=1)
        Sort Key: (COALESCE(sum(r.cost_estimate), '0'::numeric)) DESC
        Sort Method: quicksort  Memory: 26kB
        Buffers: shared hit=16278 read=8410, temp read=4644 written=4313
        ->  GroupAggregate  (cost=31433.37..31995.71 rows=24 width=223) (actual time=310.180..782.066 rows=6 loops=1)
              Group Key: r.model, r.provider
              Buffers: shared hit=16278 read=8410, temp read=4644 written=4313
              ->  Gather Merge  (cost=31433.37..31851.37 rows=3589 width=33) (actual time=247.166..394.013 rows=523059 loops=1)
                    Workers Planned: 2
                    Workers Launched: 2
                    Buffers: shared hit=16271 read=8409, temp read=2784 written=2793
                    ->  Sort  (cost=30433.35..30437.09 rows=1495 width=33) (actual time=240.535..283.397 rows=174353 loops=3)
                          Sort Key: r.model, r.provider
                          Sort Method: external merge  Disk: 7656kB
                          Buffers: shared hit=16271 read=8409, temp read=2784 written=2793
                          Worker 0:  Sort Method: external merge  Disk: 7280kB
                          Worker 1:  Sort Method: external merge  Disk: 7336kB
                          ->  Hash Join  (cost=9.53..30354.52 rows=1495 width=33) (actual time=0.302..152.066 rows=174353 loops=3)
                                Hash Cond: (r.project_id = p.id)
                                Buffers: shared hit=16240 read=8408
                                ->  Parallel Seq Scan on requests r  (cost=0.00..29747.80 rows=224332 width=70) (actual time=0.023..101.245 rows=179745 loops=3)
                                      Filter: ((NOT is_blocked) AND (created_at >= '2026-10-25 10:55:15.353'::timestamp without time zone))
                                      Rows Removed by Filter: 153588
                                      Buffers: shared hit=16132 read=8408
                                ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.031..0.034 rows=8 loops=3)
                                      Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                      Buffers: shared hit=8
                                      ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.019..0.021 rows=8 loops=3)
                                            Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                            Heap Blocks: exact=1
                                            Buffers: shared hit=8
                                            ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.011..0.011 rows=8 loops=3)
                                                  Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                                  Buffers: shared hit=5
Planning:
  Buffers: shared hit=22 read=5
Planning Time: 0.474 ms
Execution Time: 784.027 ms
```

### model comparison 30d (1 project): 0.048 ms
```sql
SELECT "public"."provider_api_keys"."id", "public"."provider_api_keys"."provider"::text FROM "public"."provider_api_keys" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."provider_api_keys"."project_id") WHERE ("public"."provider_api_keys"."is_active" = $1 AND ("j0"."org_id" = $2 AND ("j0"."id" IS NOT NULL)) AND "public"."provider_api_keys"."project_id" = $3) OFFSET $4
```
```
Nested Loop  (cost=4.31..17.69 rows=1 width=64) (actual time=0.005..0.006 rows=0 loops=1)
  Buffers: shared hit=2
  ->  Bitmap Heap Scan on provider_api_keys  (cost=4.16..9.50 rows=1 width=68) (actual time=0.004..0.005 rows=0 loops=1)
        Recheck Cond: (project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
        Filter: is_active
        Buffers: shared hit=2
        ->  Bitmap Index Scan on provider_api_keys_project_id_provider_idx  (cost=0.00..4.16 rows=2 width=0) (actual time=0.003..0.003 rows=0 loops=1)
              Index Cond: (project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
              Buffers: shared hit=2
  ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (never executed)
        Index Cond: ((id IS NOT NULL) AND (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text))
        Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
Planning:
  Buffers: shared hit=2
Planning Time: 0.134 ms
Execution Time: 0.048 ms
```

### model comparison 30d (1 project): 429.417 ms
```sql
 SELECT r.model, r.provider::text AS provider, COUNT(*) AS requests, COALESCE(SUM(r.tokens_in),0) AS tokens_in, COALESCE(SUM(r.tokens_out),0) AS tokens_out, COALESCE(SUM(r.cached_tokens_in),0) AS cached_in, COALESCE(SUM(r.cost_estimate),0) AS cost, COUNT(r.cached_tokens_in) AS cache_known, AVG(r.tokens_in) AS avg_in, percentile_cont(0.5) WITHIN GROUP (ORDER BY r.tokens_in) AS p50_in, percentile_co
```
```
Limit  (cost=72857.70..72857.71 rows=5 width=223) (actual time=426.575..426.581 rows=5 loops=1)
  Buffers: shared hit=1 read=26764, temp read=1044 written=1048
  ->  Sort  (cost=72857.70..72857.76 rows=24 width=223) (actual time=426.572..426.576 rows=5 loops=1)
        Sort Key: (COALESCE(sum(r.cost_estimate), '0'::numeric)) DESC
        Sort Method: quicksort  Memory: 26kB
        Buffers: shared hit=1 read=26764, temp read=1044 written=1048
        ->  GroupAggregate  (cost=64231.66..72857.30 rows=24 width=223) (actual time=289.308..426.537 rows=6 loops=1)
              Group Key: r.model, r.provider
              Buffers: shared hit=1 read=26764, temp read=1044 written=1048
              ->  Sort  (cost=64231.66..64739.00 rows=202938 width=33) (actual time=268.533..311.062 rows=196099 loops=1)
                    Sort Key: r.model, r.provider
                    Sort Method: external merge  Disk: 8352kB
                    Buffers: shared hit=1 read=26764, temp read=1044 written=1048
                    ->  Nested Loop  (cost=11104.22..40790.98 rows=202938 width=33) (actual time=35.912..193.466 rows=196099 loops=1)
                          Buffers: shared hit=1 read=26764
                          ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.033..0.039 rows=1 loops=1)
                                Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
                                Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                Buffers: shared hit=1 read=1
                          ->  Bitmap Heap Scan on requests r  (cost=11104.07..38753.43 rows=202938 width=70) (actual time=35.876..170.114 rows=196099 loops=1)
                                Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-10-25 10:55:42.034'::timestamp without time zone))
                                Filter: (NOT is_blocked)
                                Rows Removed by Filter: 10502
                                Heap Blocks: exact=24538
                                Buffers: shared read=26763
                                ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..11053.33 rows=207291 width=0) (actual time=32.290..32.290 rows=206601 loops=1)
                                      Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-10-25 10:55:42.034'::timestamp without time zone))
                                      Buffers: shared read=2225
Planning:
  Buffers: shared hit=3
Planning Time: 0.290 ms
Execution Time: 429.417 ms
```

### recommendations list: 0.037 ms
```sql
SELECT "public"."projects"."id", "public"."projects"."name" FROM "public"."projects" WHERE "public"."projects"."id" IN ($1,$2,$3,$4,$5,$6,$7,$8) OFFSET $9
```
```
Seq Scan on projects  (cost=0.00..16.00 rows=8 width=64) (actual time=0.018..0.023 rows=8 loops=1)
  Filter: (id = ANY ('{554c234b-70e5-40d0-abc4-74e3f6f5e8a5,c2e55617-442a-42bf-851a-39bfd23b7ff9,60a24401-5142-4ea3-8769-e7370b1ddbfe,c5d30145-53c4-458d-a93d-7e5768971bde,d039080f-b08a-43af-877d-f4e2d16d6a70,078f22f9-3af2-4c4b-be23-bc73893dca13,a26c2bf8-3f9d-4371-802c-fa2273c096a6,e3126c82-173b-4adc-ae90-ba8fbd9c7448}'::text[]))
  Rows Removed by Filter: 1
  Buffers: shared hit=1
Planning Time: 0.110 ms
Execution Time: 0.037 ms
```

### notification history (50): 0.408 ms
```sql
SELECT "public"."notification_deliveries"."id", "public"."notification_deliveries"."org_id", "public"."notification_deliveries"."channel_id", "public"."notification_deliveries"."channel_type", "public"."notification_deliveries"."event_id", "public"."notification_deliveries"."event_type", "public"."notification_deliveries"."status", "public"."notification_deliveries"."attempts", "public"."notificat
```
```
Limit  (cost=0.42..6.76 rows=50 width=755) (actual time=0.146..0.373 rows=50 loops=1)
  Buffers: shared hit=1 read=52
  ->  Index Scan Backward using notification_deliveries_org_id_created_at_idx on notification_deliveries  (cost=0.42..12694.92 rows=100000 width=755) (actual time=0.144..0.366 rows=50 loops=1)
        Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Buffers: shared hit=1 read=52
Planning Time: 0.604 ms
Execution Time: 0.408 ms
```

### notification history (50): 14.327 ms
```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."notification_deliveries"."id" FROM "public"."notification_deliveries" WHERE "public"."notification_deliveries"."org_id" = $1 OFFSET $2) AS "sub"
```
```
Aggregate  (cost=3332.29..3332.30 rows=1 width=8) (actual time=14.296..14.297 rows=1 loops=1)
  Buffers: shared read=83
  ->  Index Only Scan using notification_deliveries_org_id_channel_id_read_at_idx on notification_deliveries  (cost=0.29..2082.29 rows=100000 width=32) (actual time=0.102..9.307 rows=100000 loops=1)
        Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Heap Fetches: 0
        Buffers: shared read=83
Planning Time: 0.102 ms
Execution Time: 14.327 ms
```

### inbox page (20) + unread count: 0.096 ms
```sql
SELECT "public"."notification_deliveries"."id", "public"."notification_deliveries"."org_id", "public"."notification_deliveries"."channel_id", "public"."notification_deliveries"."channel_type", "public"."notification_deliveries"."event_id", "public"."notification_deliveries"."event_type", "public"."notification_deliveries"."status", "public"."notification_deliveries"."attempts", "public"."notificat
```
```
Limit  (cost=0.42..3.08 rows=21 width=755) (actual time=0.037..0.066 rows=21 loops=1)
  Buffers: shared hit=24
  ->  Index Scan Backward using notification_deliveries_org_id_created_at_idx on notification_deliveries  (cost=0.42..12694.92 rows=100000 width=755) (actual time=0.036..0.063 rows=21 loops=1)
        Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Filter: (channel_id IS NULL)
        Buffers: shared hit=24
Planning Time: 0.108 ms
Execution Time: 0.096 ms
```

### inbox page (20) + unread count: 12.570 ms
```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."notification_deliveries"."id" FROM "public"."notification_deliveries" WHERE ("public"."notification_deliveries"."org_id" = $1 AND "public"."notification_deliveries"."channel_id" IS NULL AND "public"."notification_deliveries"."read_at" IS NULL) OFFSET $2) AS "sub"
```
```
Aggregate  (cost=3832.29..3832.30 rows=1 width=8) (actual time=12.515..12.517 rows=1 loops=1)
  Buffers: shared hit=83
  ->  Index Only Scan using notification_deliveries_org_id_channel_id_read_at_idx on notification_deliveries  (cost=0.29..2582.29 rows=100000 width=32) (actual time=0.035..7.897 rows=100000 loops=1)
        Index Cond: ((org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text) AND (channel_id IS NULL) AND (read_at IS NULL))
        Heap Fetches: 0
        Buffers: shared hit=83
Planning Time: 0.113 ms
Execution Time: 12.570 ms
```

