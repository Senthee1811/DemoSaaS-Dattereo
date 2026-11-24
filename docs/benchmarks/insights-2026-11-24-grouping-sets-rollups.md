# Cost Insights benchmark (2026-11-24) — daily rollups ON

Environment: node v24.22.1, win32; Postgres 16.15, shared_buffers=128MB, work_mem=4MB. Single machine, Postgres in Docker, the benchmark and database share CPU. **These numbers describe this environment only.**
Data: synthetic. 8 projects (skewed: the busiest holds roughly 40% of rows), 6 models (skewed), 5 applications + 25% unattributed, 4 teams + 30% unattributed, 20 gateway keys on 10% of rows, 60 days of history with a denser last day, 2% blocked, plus a second organization holding ~3% of rows. Warm cache (each endpoint is run once untimed first).

## 1,000,000 request rows

| endpoint | p50 ms | p95 ms | p99 ms | max ms | DB queries/call | DB time/call ms | heap Δ MB |
|---|---:|---:|---:|---:|---:|---:|---:|
| attribution by model (org, 30d) | 280.8 | 402.6 | 402.6 | 402.6 | 6 | 525.5 | 0.3 |
| attribution by application (org, 30d) | 639.2 | 1135.8 | 1135.8 | 1135.8 | 6 | 1157.7 | 0.3 |
| attribution by key (org, 30d) | 377.5 | 717.7 | 717.7 | 717.7 | 7 | 768.8 | 0.4 |
| attribution by model (1 project, 30d) | 178.6 | 308.0 | 308.0 | 308.0 | 7 | 352.8 | 0.3 |
| investigation 24h vs 7d (org) | 1044.3 | 3145.4 | 3145.4 | 3145.4 | 20 | 2490.3 | 1.7 |
| investigation 24h vs 7d (1 project) | 352.9 | 453.3 | 453.3 | 453.3 | 19 | 794.9 | 1.5 |
| investigation 30d vs 7d (org) | 2108.4 | 3133.2 | 3133.2 | 3133.2 | 17 | 2821.2 | 1.5 |
| forecast (org) | 153.8 | 178.3 | 178.3 | 178.3 | 4 | 153.6 | 0.2 |
| forecast (1 project) | 43.4 | 45.6 | 45.6 | 45.6 | 4 | 39.6 | 0.3 |
| model comparison 30d (org) | 635.3 | 823.6 | 823.6 | 823.6 | 2 | 649.2 | 0.5 |
| model comparison 30d (1 project) | 324.4 | 408.0 | 408.0 | 408.0 | 3 | 334.8 | 0.5 |
| recommendations list | 8.2 | 9.4 | 9.4 | 9.4 | 2 | 2.9 | 0.3 |
| notification history (50) | 15.1 | 21.3 | 21.3 | 21.3 | 2 | 15.3 | 0.2 |
| inbox page (20) + unread count | 18.0 | 28.4 | 28.4 | 28.4 | 3 | 30.2 | 0.2 |

Iterations per endpoint: 15 (so p99 is effectively the max of 15 samples).

## Query plans at 1,000,000 rows (EXPLAIN ANALYZE, BUFFERS; one per distinct query)

### attribution by model (org, 30d): 164.901 ms
```sql
SELECT SUM("tokens_in") AS "_sum$tokens_in", SUM("tokens_out") AS "_sum$tokens_out", SUM("cost_estimate") AS "_sum$cost_estimate", COUNT("id") AS "_count$id" FROM (SELECT "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"
```
```
Aggregate  (cost=14128.32..14128.33 rows=1 width=56) (actual time=164.736..164.738 rows=1 loops=1)
  Buffers: shared hit=20169 read=21964
  ->  Nested Loop  (cost=326.44..14126.62 rows=170 width=47) (actual time=1.713..152.379 rows=49306 loops=1)
        Buffers: shared hit=20169 read=21964
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..54.11 rows=1 width=32) (actual time=0.042..0.106 rows=8 loops=1)
              Index Cond: (id IS NOT NULL)
              Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Rows Removed by Filter: 1
              Buffers: shared hit=1 read=1
        ->  Bitmap Heap Scan on requests  (cost=326.29..14015.77 rows=5674 width=84) (actual time=2.749..17.942 rows=6163 loops=8)
              Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:56:44.534'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 121
              Heap Blocks: exact=41560
              Buffers: shared hit=20168 read=21963
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..324.88 rows=5796 width=0) (actual time=1.879..1.879 rows=6284 loops=8)
                    Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:56:44.534'::timestamp without time zone))
                    Buffers: shared hit=7 read=564
Planning:
  Buffers: shared hit=1 read=6
Planning Time: 0.891 ms
Execution Time: 164.901 ms
```

### attribution by model (org, 30d): 167.877 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."model" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"."org_
```
```
GroupAggregate  (cost=14132.92..14135.54 rows=6 width=67) (actual time=153.978..167.029 rows=6 loops=1)
  Group Key: requests.model
  Buffers: shared hit=23435 read=18701, temp read=429 written=430
  ->  Sort  (cost=14132.92..14133.34 rows=170 width=58) (actual time=151.810..157.870 rows=49306 loops=1)
        Sort Key: requests.model
        Sort Method: external merge  Disk: 3432kB
        Buffers: shared hit=23435 read=18701, temp read=429 written=430
        ->  Nested Loop  (cost=326.44..14126.62 rows=170 width=58) (actual time=1.927..127.535 rows=49306 loops=1)
              Buffers: shared hit=23435 read=18698
              ->  Index Scan using projects_pkey on projects j0  (cost=0.15..54.11 rows=1 width=32) (actual time=0.038..0.091 rows=8 loops=1)
                    Index Cond: (id IS NOT NULL)
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests  (cost=326.29..14015.77 rows=5674 width=95) (actual time=2.622..14.952 rows=6163 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:56:44.534'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 121
                    Heap Blocks: exact=41560
                    Buffers: shared hit=23434 read=18697
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..324.88 rows=5796 width=0) (actual time=1.814..1.815 rows=6284 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:56:44.534'::timestamp without time zone))
                          Buffers: shared hit=8 read=563
Planning:
  Buffers: shared read=4
Planning Time: 0.780 ms
Execution Time: 167.877 ms
```

### attribution by model (org, 30d): 22.990 ms
```sql
 SELECT COALESCE(SUM(requests), 0) AS n, COALESCE(SUM(tokens_in), 0) AS ti, COALESCE(SUM(tokens_out), 0) AS tout, COALESCE(SUM(cost_usd), 0) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date
```
```
Finalize Aggregate  (cost=7603.19..7603.20 rows=1 width=104) (actual time=20.614..22.948 rows=1 loops=1)
  Buffers: shared read=4953
  ->  Gather  (cost=7602.94..7603.15 rows=2 width=104) (actual time=20.401..22.919 rows=3 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared read=4953
        ->  Partial Aggregate  (cost=6602.94..6602.95 rows=1 width=104) (actual time=16.463..16.464 rows=1 loops=3)
              Buffers: shared read=4953
              ->  Parallel Seq Scan on request_daily_rollups  (cost=0.00..6257.13 rows=34580 width=26) (actual time=2.303..10.868 rows=27785 loops=3)
                    Filter: ((day >= '2026-10-26'::date) AND (day < '2026-11-24'::date) AND (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text))
                    Rows Removed by Filter: 31832
                    Buffers: shared read=4953
Planning:
  Buffers: shared hit=5 read=4
Planning Time: 0.203 ms
Execution Time: 22.990 ms
```

### attribution by model (org, 30d): 26.144 ms
```sql
 SELECT model AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1
```
```
Finalize GroupAggregate  (cost=7689.59..7691.33 rows=6 width=116) (actual time=23.917..26.064 rows=6 loops=1)
  Group Key: model
  Buffers: shared hit=113 read=4856
  ->  Gather Merge  (cost=7689.59..7690.99 rows=12 width=116) (actual time=23.892..26.013 rows=18 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=113 read=4856
        ->  Sort  (cost=6689.56..6689.58 rows=6 width=116) (actual time=19.397..19.399 rows=6 loops=3)
              Sort Key: model
              Sort Method: quicksort  Memory: 26kB
              Buffers: shared hit=113 read=4856
              Worker 0:  Sort Method: quicksort  Memory: 26kB
              Worker 1:  Sort Method: quicksort  Memory: 26kB
              ->  Partial HashAggregate  (cost=6689.38..6689.48 rows=6 width=116) (actual time=19.340..19.345 rows=6 loops=3)
                    Group Key: model
                    Batches: 1  Memory Usage: 24kB
                    Buffers: shared hit=98 read=4855
                    Worker 0:  Batches: 1  Memory Usage: 24kB
                    Worker 1:  Batches: 1  Memory Usage: 24kB
                    ->  Parallel Seq Scan on request_daily_rollups  (cost=0.00..6257.13 rows=34580 width=38) (actual time=2.188..9.993 rows=27785 loops=3)
                          Filter: ((day >= '2026-10-26'::date) AND (day < '2026-11-24'::date) AND (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text))
                          Rows Removed by Filter: 31832
                          Buffers: shared hit=98 read=4855
Planning Time: 0.116 ms
Execution Time: 26.144 ms
```

### attribution by application (org, 30d): 137.159 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."application" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"
```
```
GroupAggregate  (cost=14132.92..14135.53 rows=5 width=66) (actual time=126.406..136.533 rows=6 loops=1)
  Group Key: requests.application
  Buffers: shared hit=22897 read=19236, temp read=407 written=408
  ->  Sort  (cost=14132.92..14133.34 rows=170 width=57) (actual time=124.592..129.229 rows=49306 loops=1)
        Sort Key: requests.application
        Sort Method: external merge  Disk: 3256kB
        Buffers: shared hit=22897 read=19236, temp read=407 written=408
        ->  Nested Loop  (cost=326.44..14126.62 rows=170 width=57) (actual time=1.221..104.067 rows=49306 loops=1)
              Buffers: shared hit=22897 read=19236
              ->  Index Scan using projects_pkey on projects j0  (cost=0.15..54.11 rows=1 width=32) (actual time=0.016..0.063 rows=8 loops=1)
                    Index Cond: (id IS NOT NULL)
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests  (cost=326.29..14015.77 rows=5674 width=94) (actual time=2.020..12.225 rows=6163 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:56:50.087'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 121
                    Heap Blocks: exact=41560
                    Buffers: shared hit=22896 read=19235
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..324.88 rows=5796 width=0) (actual time=1.350..1.350 rows=6284 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:56:50.087'::timestamp without time zone))
                          Buffers: shared hit=8 read=563
Planning:
  Buffers: shared read=4
Planning Time: 0.293 ms
Execution Time: 137.159 ms
```

### attribution by application (org, 30d): 22.555 ms
```sql
 SELECT application AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1
```
```
Finalize GroupAggregate  (cost=7689.59..7691.33 rows=6 width=114) (actual time=20.364..22.454 rows=6 loops=1)
  Group Key: application
  Buffers: shared hit=15 read=4954
  ->  Gather Merge  (cost=7689.59..7690.99 rows=12 width=114) (actual time=20.343..22.410 rows=18 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=15 read=4954
        ->  Sort  (cost=6689.56..6689.58 rows=6 width=114) (actual time=16.638..16.640 rows=6 loops=3)
              Sort Key: application
              Sort Method: quicksort  Memory: 26kB
              Buffers: shared hit=15 read=4954
              Worker 0:  Sort Method: quicksort  Memory: 26kB
              Worker 1:  Sort Method: quicksort  Memory: 26kB
              ->  Partial HashAggregate  (cost=6689.38..6689.48 rows=6 width=114) (actual time=16.584..16.590 rows=6 loops=3)
                    Group Key: application
                    Batches: 1  Memory Usage: 24kB
                    Buffers: shared read=4953
                    Worker 0:  Batches: 1  Memory Usage: 24kB
                    Worker 1:  Batches: 1  Memory Usage: 24kB
                    ->  Parallel Seq Scan on request_daily_rollups  (cost=0.00..6257.13 rows=34580 width=36) (actual time=1.956..8.897 rows=27785 loops=3)
                          Filter: ((day >= '2026-10-26'::date) AND (day < '2026-11-24'::date) AND (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text))
                          Rows Removed by Filter: 31832
                          Buffers: shared read=4953
Planning Time: 0.110 ms
Execution Time: 22.555 ms
```

### attribution by key (org, 30d): 127.988 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."gateway_key_id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("
```
```
GroupAggregate  (cost=14132.92..14135.72 rows=20 width=93) (actual time=116.982..127.228 rows=21 loops=1)
  Group Key: requests.gateway_key_id
  Buffers: shared hit=23432 read=18701, temp read=376 written=377
  ->  Sort  (cost=14132.92..14133.34 rows=170 width=84) (actual time=116.903..120.662 rows=49306 loops=1)
        Sort Key: requests.gateway_key_id
        Sort Method: external merge  Disk: 3008kB
        Buffers: shared hit=23432 read=18701, temp read=376 written=377
        ->  Nested Loop  (cost=326.44..14126.62 rows=170 width=84) (actual time=1.068..95.399 rows=49306 loops=1)
              Buffers: shared hit=23432 read=18701
              ->  Index Scan using projects_pkey on projects j0  (cost=0.15..54.11 rows=1 width=32) (actual time=0.017..0.061 rows=8 loops=1)
                    Index Cond: (id IS NOT NULL)
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests  (cost=326.29..14015.77 rows=5674 width=121) (actual time=1.820..11.223 rows=6163 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:01.822'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 121
                    Heap Blocks: exact=41560
                    Buffers: shared hit=23431 read=18700
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..324.88 rows=5796 width=0) (actual time=1.254..1.254 rows=6284 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:01.822'::timestamp without time zone))
                          Buffers: shared hit=8 read=563
Planning:
  Buffers: shared read=4
Planning Time: 0.272 ms
Execution Time: 127.988 ms
```

### attribution by key (org, 30d): 22.521 ms
```sql
 SELECT gateway_key_id AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1
```
```
Finalize GroupAggregate  (cost=7690.23..7696.34 rows=21 width=122) (actual time=20.355..22.443 rows=21 loops=1)
  Group Key: gateway_key_id
  Buffers: shared hit=15 read=4954
  ->  Gather Merge  (cost=7690.23..7695.13 rows=42 width=122) (actual time=20.337..22.357 rows=63 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=15 read=4954
        ->  Sort  (cost=6690.21..6690.26 rows=21 width=122) (actual time=16.596..16.598 rows=21 loops=3)
              Sort Key: gateway_key_id
              Sort Method: quicksort  Memory: 29kB
              Buffers: shared hit=15 read=4954
              Worker 0:  Sort Method: quicksort  Memory: 29kB
              Worker 1:  Sort Method: quicksort  Memory: 29kB
              ->  Partial HashAggregate  (cost=6689.38..6689.75 rows=21 width=122) (actual time=16.529..16.540 rows=21 loops=3)
                    Group Key: gateway_key_id
                    Batches: 1  Memory Usage: 32kB
                    Buffers: shared read=4953
                    Worker 0:  Batches: 1  Memory Usage: 32kB
                    Worker 1:  Batches: 1  Memory Usage: 32kB
                    ->  Parallel Seq Scan on request_daily_rollups  (cost=0.00..6257.13 rows=34580 width=44) (actual time=1.825..8.510 rows=27785 loops=3)
                          Filter: ((day >= '2026-10-26'::date) AND (day < '2026-11-24'::date) AND (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text))
                          Rows Removed by Filter: 31832
                          Buffers: shared read=4953
Planning Time: 0.169 ms
Execution Time: 22.521 ms
```

### attribution by key (org, 30d): 0.091 ms
```sql
SELECT "public"."gateway_api_keys"."id", "public"."gateway_api_keys"."key_name", "public"."gateway_api_keys"."key_prefix" FROM "public"."gateway_api_keys" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."gateway_api_keys"."project_id") WHERE ("public"."gateway_api_keys"."id" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) AND ("j0"."org_id" = $21 AND ("
```
```
Nested Loop  (cost=4.36..17.73 rows=1 width=96) (actual time=0.044..0.058 rows=20 loops=1)
  Buffers: shared hit=15 read=3
  ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.026..0.027 rows=8 loops=1)
        Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Filter: (id IS NOT NULL)
        Heap Blocks: exact=1
        Buffers: shared hit=1 read=1
        ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.020..0.020 rows=8 loops=1)
              Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared read=1
  ->  Index Scan using gateway_api_keys_project_id_idx on gateway_api_keys  (cost=0.20..8.22 rows=1 width=128) (actual time=0.003..0.003 rows=2 loops=8)
        Index Cond: (project_id = j0.id)
        Filter: (id = ANY ('{14488fa6-7ebe-4011-8b8d-c3ac65bd20bc,2b8b87b3-c353-4461-82f5-badcaa7128e3,65f643dd-d24b-4393-ae18-df113feec7a7,70551420-71a8-4dae-b99d-a6bfc461db46,75c0b7b0-b04b-4594-9427-a3bb553e56b3,76e09d50-3ac2-40d9-ac89-089e62242113,77128165-7243-4387-b090-c51de0632e8b,98953f04-2751-46b8-8cd1-92611f6985c9,99e68309-bf6a-4ca7-801e-5a9e4473cee9,b167e804-8862-4491-99f1-e13d9f876048,b52a038d-2ed9-4641-bcfd-7912b6887170,b5e1e6b7-bed1-40aa-8574-f1ae59c4213c,b662eab1-13e6-4242-9001-b5bbc05ade29,cc2c0e05-201f-452c-8660-4e1adec052fa,e957e821-f736-4b4b-94ad-46bd57675ce0,ea1af094-8321-458e-b7de-dfc4981d4440,eb53383e-1ab8-4b75-bdb8-36f199568cf9,f75b6142-eef9-4de5-80be-31734c2f3e59,f9b71278-c7b0-42bd-848b-5902901c5fa3,fd1f07ce-60ab-4513-9583-0cbb46196901}'::text[]))
        Buffers: shared hit=14 read=2
Planning Time: 0.153 ms
Execution Time: 0.091 ms
```

### attribution by model (1 project, 30d): 0.076 ms
```sql
SELECT "public"."projects"."id", "public"."projects"."name", "public"."projects"."budget_monthly" FROM "public"."projects" WHERE ("public"."projects"."id" = $1 AND "public"."projects"."org_id" = $2) LIMIT $3 OFFSET $4
```
```
Limit  (cost=0.15..8.17 rows=1 width=80) (actual time=0.045..0.045 rows=1 loops=1)
  Buffers: shared hit=1 read=1
  ->  Index Scan using projects_pkey on projects  (cost=0.15..8.17 rows=1 width=80) (actual time=0.043..0.044 rows=1 loops=1)
        Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
        Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Buffers: shared hit=1 read=1
Planning Time: 0.077 ms
Execution Time: 0.076 ms
```

### attribution by model (1 project, 30d): 44.535 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."model" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"."org_
```
```
HashAggregate  (cost=26187.94..26188.02 rows=6 width=67) (actual time=44.296..44.301 rows=6 loops=1)
  Group Key: requests.model
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=4839 read=8893
  ->  Nested Loop  (cost=1103.15..25947.34 rows=19248 width=58) (actual time=5.471..39.780 rows=18397 loops=1)
        Buffers: shared hit=4839 read=8893
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.015..0.021 rows=1 loops=1)
              Index Cond: ((id IS NOT NULL) AND (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text))
              Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=2
        ->  Bitmap Heap Scan on requests  (cost=1103.00..25746.69 rows=19248 width=95) (actual time=5.453..37.834 rows=18397 loops=1)
              Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:09.743'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 969
              Heap Blocks: exact=13517
              Buffers: shared hit=4837 read=8893
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..1098.19 rows=19661 width=0) (actual time=3.849..3.849 rows=19366 loops=1)
                    Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:09.743'::timestamp without time zone))
                    Buffers: shared hit=1 read=212
Planning:
  Buffers: shared read=4
Planning Time: 0.232 ms
Execution Time: 44.535 ms
```

### attribution by model (1 project, 30d): 22.631 ms
```sql
SELECT SUM("tokens_in") AS "_sum$tokens_in", SUM("tokens_out") AS "_sum$tokens_out", SUM("cost_estimate") AS "_sum$cost_estimate", COUNT("id") AS "_count$id" FROM (SELECT "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"
```
```
Aggregate  (cost=26139.82..26139.83 rows=1 width=56) (actual time=22.406..22.408 rows=1 loops=1)
  Buffers: shared hit=13681 read=51
  ->  Nested Loop  (cost=1103.15..25947.34 rows=19248 width=47) (actual time=7.156..20.491 rows=18397 loops=1)
        Buffers: shared hit=13681 read=51
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.027..0.031 rows=1 loops=1)
              Index Cond: ((id IS NOT NULL) AND (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text))
              Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=2
        ->  Bitmap Heap Scan on requests  (cost=1103.00..25746.69 rows=19248 width=84) (actual time=7.124..18.968 rows=18397 loops=1)
              Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:09.743'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 969
              Heap Blocks: exact=13517
              Buffers: shared hit=13679 read=51
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..1098.19 rows=19661 width=0) (actual time=5.495..5.496 rows=19366 loops=1)
                    Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:09.743'::timestamp without time zone))
                    Buffers: shared hit=213
Planning:
  Buffers: shared hit=4
Planning Time: 0.321 ms
Execution Time: 22.631 ms
```

### attribution by model (1 project, 30d): 17.017 ms
```sql
 SELECT model AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND project_id = $2 AND day >= $3::date AND day < $4::date GROUP BY 1
```
```
HashAggregate  (cost=7513.39..7513.50 rows=6 width=116) (actual time=16.926..16.931 rows=6 loops=1)
  Group Key: model
  Batches: 1  Memory Usage: 24kB
  Buffers: shared read=2836
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=1935.42..7282.64 rows=18460 width=38) (actual time=4.117..12.276 rows=19872 loops=1)
        Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (day >= '2026-10-26'::date) AND (day < '2026-11-24'::date))
        Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Heap Blocks: exact=2389
        Buffers: shared read=2836
        ->  Bitmap Index Scan on request_daily_rollups_pkey  (cost=0.00..1930.81 rows=19711 width=0) (actual time=3.876..3.877 rows=19872 loops=1)
              Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (day >= '2026-10-26'::date) AND (day < '2026-11-24'::date))
              Buffers: shared read=447
Planning Time: 0.134 ms
Execution Time: 17.017 ms
```

### attribution by model (1 project, 30d): 9.499 ms
```sql
 SELECT COALESCE(SUM(requests), 0) AS n, COALESCE(SUM(tokens_in), 0) AS ti, COALESCE(SUM(tokens_out), 0) AS tout, COALESCE(SUM(cost_usd), 0) AS cost FROM request_daily_rollups WHERE org_id = $1 AND project_id = $2 AND day >= $3::date AND day < $4::date
```
```
Aggregate  (cost=7467.25..7467.26 rows=1 width=104) (actual time=9.438..9.440 rows=1 loops=1)
  Buffers: shared hit=2836
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=1935.42..7282.64 rows=18460 width=26) (actual time=2.534..6.601 rows=19872 loops=1)
        Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (day >= '2026-10-26'::date) AND (day < '2026-11-24'::date))
        Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Heap Blocks: exact=2389
        Buffers: shared hit=2836
        ->  Bitmap Index Scan on request_daily_rollups_pkey  (cost=0.00..1930.81 rows=19711 width=0) (actual time=2.304..2.305 rows=19872 loops=1)
              Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (day >= '2026-10-26'::date) AND (day < '2026-11-24'::date))
              Buffers: shared hit=447
Planning Time: 0.104 ms
Execution Time: 9.499 ms
```

### investigation 24h vs 7d (org): 17.644 ms
```sql
 SELECT date_trunc('day', r.created_at) AS day, COALESCE(SUM(r.cost_estimate), 0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.created_at >= $2 AND r.created_at < $3 GROUP BY 1 ORDER BY 1
```
```
GroupAggregate  (cost=8423.78..8425.49 rows=76 width=40) (actual time=17.545..17.548 rows=1 loops=1)
  Group Key: (date_trunc('day'::text, r.created_at))
  Buffers: shared hit=3627 read=3344
  ->  Sort  (cost=8423.78..8423.97 rows=76 width=14) (actual time=16.253..16.548 rows=6922 loops=1)
        Sort Key: (date_trunc('day'::text, r.created_at))
        Sort Method: quicksort  Memory: 463kB
        Buffers: shared hit=3627 read=3344
        ->  Nested Loop  (cost=72.99..8421.41 rows=76 width=14) (actual time=0.170..15.416 rows=6922 loops=1)
              Buffers: shared hit=3627 read=3344
              ->  Index Scan using projects_pkey on projects p  (cost=0.15..53.40 rows=2 width=32) (actual time=0.011..0.030 rows=8 loops=1)
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=2
              ->  Bitmap Heap Scan on requests r  (cost=72.84..4171.30 rows=1261 width=51) (actual time=0.275..1.777 rows=865 loops=8)
                    Recheck Cond: ((project_id = p.id) AND (created_at >= '2026-11-23 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-23 10:57:15.944'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 18
                    Heap Blocks: exact=6872
                    Buffers: shared hit=3625 read=3344
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..72.52 rows=1288 width=0) (actual time=0.196..0.196 rows=884 loops=8)
                          Index Cond: ((project_id = p.id) AND (created_at >= '2026-11-23 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-23 10:57:15.944'::timestamp without time zone))
                          Buffers: shared hit=8 read=89
Planning Time: 0.198 ms
Execution Time: 17.644 ms
```

### investigation 24h vs 7d (org): 192.416 ms
```sql
 SELECT GROUPING(r.project_id) AS g_project, r.project_id AS k_project, GROUPING(r.model) AS g_model, r.model AS k_model, GROUPING(r.gateway_key_id) AS g_key, r.gateway_key_id AS k_key, GROUPING(r.application) AS g_application, r.application AS k_application, GROUPING(r.team) AS g_team, r.team AS k_team, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COAL
```
```
MixedAggregate  (cost=29221.86..29353.63 rows=45 width=177) (actual time=95.441..191.641 rows=47 loops=1)
  Hash Key: r.team
  Hash Key: r.application
  Hash Key: r.gateway_key_id
  Hash Key: r.model
  Group Key: r.project_id
  Group Key: ()
  Batches: 1  Memory Usage: 80kB
  Buffers: shared hit=3863 read=21026, temp read=899 written=901
  ->  Gather Merge  (cost=29221.86..29306.88 rows=730 width=115) (actual time=88.215..117.165 rows=108937 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=3863 read=21026, temp read=899 written=901
        ->  Sort  (cost=28221.84..28222.60 rows=304 width=115) (actual time=84.715..89.407 rows=36312 loops=3)
              Sort Key: r.project_id
              Sort Method: external merge  Disk: 3912kB
              Buffers: shared hit=3863 read=21026, temp read=899 written=901
              Worker 0:  Sort Method: external merge  Disk: 3280kB
              Worker 1:  Sort Method: quicksort  Memory: 3977kB
              ->  Hash Join  (cost=2848.38..28209.30 rows=304 width=115) (actual time=10.218..66.280 rows=36312 loops=3)
                    Hash Cond: (r.project_id = p.id)
                    Buffers: shared hit=3848 read=21025
                    ->  Parallel Bitmap Heap Scan on requests r  (cost=2838.85..28078.25 rows=45648 width=115) (actual time=10.066..57.016 rows=37449 loops=3)
                          Recheck Cond: ((created_at >= '2026-11-23 10:57:15.944'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:15.944'::timestamp without time zone))
                          Filter: (NOT is_blocked)
                          Rows Removed by Filter: 746
                          Heap Blocks: exact=9595
                          Buffers: shared hit=3750 read=21015
                          ->  Bitmap Index Scan on requests_created_at_idx  (cost=0.00..2811.47 rows=111904 width=0) (actual time=9.233..9.233 rows=114583 loops=1)
                                Index Cond: ((created_at >= '2026-11-23 10:57:15.944'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:15.944'::timestamp without time zone))
                                Buffers: shared hit=2 read=391
                    ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.024..0.026 rows=8 loops=3)
                          Buckets: 1024  Batches: 1  Memory Usage: 9kB
                          Buffers: shared hit=6 read=2
                          ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.018..0.019 rows=8 loops=3)
                                Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                Heap Blocks: exact=1
                                Buffers: shared hit=6 read=2
                                ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.011..0.011 rows=8 loops=3)
                                      Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
```

### investigation 24h vs 7d (org): 15.495 ms
```sql
 SELECT GROUPING(project_id) AS g_project, project_id AS k_project, GROUPING(model) AS g_model, model AS k_model, GROUPING(gateway_key_id) AS g_key, gateway_key_id AS k_key, GROUPING(application) AS g_application, application AS k_application, GROUPING(team) AS g_team, team AS k_team, COALESCE(SUM(requests),0) AS n, COALESCE(SUM(tokens_in),0) AS ti, COALESCE(SUM(tokens_out),0) AS tout, COALESCE(SU
```
```
MixedAggregate  (cost=289.71..6721.50 rows=48 width=206) (actual time=15.417..15.436 rows=47 loops=1)
  Hash Key: project_id
  Hash Key: model
  Hash Key: gateway_key_id
  Hash Key: application
  Hash Key: team
  Group Key: ()
  Batches: 1  Memory Usage: 88kB
  Buffers: shared read=491
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=289.71..5529.97 rows=16415 width=108) (actual time=0.432..2.482 rows=16455 loops=1)
        Recheck Cond: ((org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
        Heap Blocks: exact=471
        Buffers: shared read=491
        ->  Bitmap Index Scan on request_daily_rollups_org_id_day_idx  (cost=0.00..285.61 rows=16415 width=0) (actual time=0.384..0.384 rows=16455 loops=1)
              Index Cond: ((org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
              Buffers: shared read=20
Planning Time: 0.138 ms
Execution Time: 15.495 ms
```

### investigation 24h vs 7d (org): 0.046 ms
```sql
SELECT "public"."projects"."id", "public"."projects"."name" FROM "public"."projects" WHERE ("public"."projects"."org_id" = $1 AND "public"."projects"."id" IN ($2,$3,$4,$5,$6,$7,$8,$9)) OFFSET $10
```
```
Bitmap Heap Scan on projects  (cost=4.16..9.52 rows=1 width=64) (actual time=0.015..0.017 rows=8 loops=1)
  Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
  Filter: (id = ANY ('{078f22f9-3af2-4c4b-be23-bc73893dca13,554c234b-70e5-40d0-abc4-74e3f6f5e8a5,60a24401-5142-4ea3-8769-e7370b1ddbfe,a26c2bf8-3f9d-4371-802c-fa2273c096a6,c2e55617-442a-42bf-851a-39bfd23b7ff9,c5d30145-53c4-458d-a93d-7e5768971bde,d039080f-b08a-43af-877d-f4e2d16d6a70,e3126c82-173b-4adc-ae90-ba8fbd9c7448}'::text[]))
  Heap Blocks: exact=1
  Buffers: shared hit=2
  ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.009..0.009 rows=8 loops=1)
        Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Buffers: shared hit=1
Planning Time: 0.087 ms
Execution Time: 0.046 ms
```

### investigation 24h vs 7d (org): 127.489 ms
```sql
 SELECT date_trunc('hour', r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.created_at >= $2 AND r.created_at < $3 GROUP BY 1 ORDER BY 1
```
```
Finalize GroupAggregate  (cost=32069.74..32267.47 rows=1451 width=64) (actual time=106.172..126.951 rows=193 loops=1)
  Group Key: (date_trunc('hour'::text, r.created_at))
  Buffers: shared hit=15722 read=8874, temp read=624 written=626
  ->  Gather Merge  (cost=32069.74..32227.56 rows=1210 width=64) (actual time=106.061..126.572 rows=579 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=15722 read=8874, temp read=624 written=626
        ->  Partial GroupAggregate  (cost=31069.72..31087.87 rows=605 width=64) (actual time=94.706..110.434 rows=193 loops=3)
              Group Key: (date_trunc('hour'::text, r.created_at))
              Buffers: shared hit=15722 read=8874, temp read=624 written=626
              ->  Sort  (cost=31069.72..31071.23 rows=605 width=22) (actual time=94.622..99.994 rows=69917 loops=3)
                    Sort Key: (date_trunc('hour'::text, r.created_at))
                    Sort Method: external merge  Disk: 2288kB
                    Buffers: shared hit=15722 read=8874, temp read=624 written=626
                    Worker 0:  Sort Method: external merge  Disk: 2704kB
                    Worker 1:  Sort Method: quicksort  Memory: 3920kB
                    ->  Hash Join  (cost=9.53..31041.77 rows=605 width=22) (actual time=0.130..78.230 rows=69917 loops=3)
                          Hash Cond: (r.project_id = p.id)
                          Buffers: shared hit=15709 read=8873
                          ->  Parallel Seq Scan on requests r  (cost=0.00..30789.36 rows=90670 width=59) (actual time=0.019..56.057 rows=72083 loops=3)
                                Filter: ((NOT is_blocked) AND (created_at >= '2026-11-16 10:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:15.944'::timestamp without time zone))
                                Rows Removed by Filter: 261250
                                Buffers: shared hit=15667 read=8873
                          ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.030..0.031 rows=8 loops=3)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=8
                                ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.020..0.021 rows=8 loops=3)
                                      Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                      Heap Blocks: exact=1
                                      Buffers: shared hit=8
                                      ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.012..0.012 rows=8 loops=3)
                                            Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                            Buffers: shared hit=5
Planning:
  Buffers: shared hit=2 read=2
Planning Time: 0.228 ms
Execution Time: 127.489 ms
```

### investigation 24h vs 7d (org): 241.602 ms
```sql
SELECT "public"."requests"."id", "public"."requests"."created_at", "public"."requests"."project_id", "public"."requests"."model", "public"."requests"."provider"::text, "public"."requests"."gateway_key_id", "public"."requests"."application", "public"."requests"."team", "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."reserv
```
```
Limit  (cost=21817.25..21817.28 rows=10 width=197) (actual time=241.474..241.478 rows=10 loops=1)
  Buffers: shared hit=33227 read=43855
  ->  Sort  (cost=21817.25..21818.16 rows=365 width=197) (actual time=241.473..241.475 rows=10 loops=1)
        Sort Key: requests.cost_estimate DESC
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=33227 read=43855
        ->  Nested Loop  (cost=703.06..21809.36 rows=365 width=197) (actual time=9.746..203.649 rows=108937 loops=1)
              Buffers: shared hit=33227 read=43855
              ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.013..0.025 rows=8 loops=1)
                    Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Filter: (id IS NOT NULL)
                    Heap Blocks: exact=1
                    Buffers: shared hit=2
                    ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.005..0.005 rows=8 loops=1)
                          Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                          Buffers: shared hit=1
              ->  Bitmap Heap Scan on requests  (cost=698.89..21676.30 rows=12173 width=169) (actual time=3.370..22.498 rows=13617 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:57:15.944'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:15.944'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 270
                    Heap Blocks: exact=75881
                    Buffers: shared hit=33225 read=43855
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..695.85 rows=12434 width=0) (actual time=2.290..2.290 rows=13888 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:57:15.944'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:15.944'::timestamp without time zone))
                          Buffers: shared hit=8 read=1191
Planning:
  Buffers: shared hit=4
Planning Time: 0.237 ms
Execution Time: 241.602 ms
```

### investigation 24h vs 7d (1 project): 85.139 ms
```sql
 SELECT GROUPING(r.model) AS g_model, r.model AS k_model, GROUPING(r.gateway_key_id) AS g_key, r.gateway_key_id AS k_key, GROUPING(r.application) AS g_application, r.application AS k_application, GROUPING(r.team) AS g_team, r.team AS k_team, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projec
```
```
MixedAggregate  (cost=2366.11..31311.44 rows=36 width=136) (actual time=84.932..84.949 rows=39 loops=1)
  Hash Key: r.model
  Hash Key: r.gateway_key_id
  Hash Key: r.application
  Hash Key: r.team
  Group Key: ()
  Batches: 1  Memory Usage: 80kB
  Buffers: shared hit=6462 read=14352
  ->  Nested Loop  (cost=2366.11..28833.17 rows=41291 width=78) (actual time=8.520..61.144 rows=40791 loops=1)
        Buffers: shared hit=6462 read=14352
        ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.015..0.019 rows=1 loops=1)
              Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
              Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=1 read=1
        ->  Bitmap Heap Scan on requests r  (cost=2365.96..28412.09 rows=41291 width=115) (actual time=8.503..57.016 rows=40791 loops=1)
              Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-23 10:57:35.542'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:35.542'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 2163
              Heap Blocks: exact=20361
              Buffers: shared hit=6461 read=14351
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..2355.64 rows=42177 width=0) (actual time=6.275..6.275 rows=42954 loops=1)
                    Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-23 10:57:35.542'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:35.542'::timestamp without time zone))
                    Buffers: shared hit=1 read=450
Planning:
  Buffers: shared read=4
Planning Time: 0.226 ms
Execution Time: 85.139 ms
```

### investigation 24h vs 7d (1 project): 6.001 ms
```sql
 SELECT date_trunc('day', r.created_at) AS day, COALESCE(SUM(r.cost_estimate), 0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.project_id = $2 AND r.created_at >= $3 AND r.created_at < $4 GROUP BY 1 ORDER BY 1
```
```
GroupAggregate  (cost=11832.50..11928.83 rows=4281 width=40) (actual time=5.897..5.899 rows=1 loops=1)
  Group Key: (date_trunc('day'::text, r.created_at))
  Buffers: shared hit=1632 read=980
  ->  Sort  (cost=11832.50..11843.21 rows=4281 width=14) (actual time=5.574..5.645 rows=2567 loops=1)
        Sort Key: (date_trunc('day'::text, r.created_at))
        Sort Method: quicksort  Memory: 197kB
        Buffers: shared hit=1632 read=980
        ->  Nested Loop  (cost=248.29..11574.28 rows=4281 width=14) (actual time=0.749..5.254 rows=2567 loops=1)
              Buffers: shared hit=1632 read=980
              ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.025..0.028 rows=1 loops=1)
                    Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests r  (cost=248.15..11512.60 rows=4281 width=51) (actual time=0.720..4.896 rows=2567 loops=1)
                    Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-23 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-23 10:57:35.542'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 148
                    Heap Blocks: exact=2579
                    Buffers: shared hit=1631 read=979
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..247.08 rows=4372 width=0) (actual time=0.498..0.498 rows=2715 loops=1)
                          Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-23 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-23 10:57:35.542'::timestamp without time zone))
                          Buffers: shared hit=1 read=30
Planning Time: 0.146 ms
Execution Time: 6.001 ms
```

### investigation 24h vs 7d (1 project): 4.575 ms
```sql
 SELECT GROUPING(model) AS g_model, model AS k_model, GROUPING(gateway_key_id) AS g_key, gateway_key_id AS k_key, GROUPING(application) AS g_application, application AS k_application, GROUPING(team) AS g_team, team AS k_team, COALESCE(SUM(requests),0) AS n, COALESCE(SUM(tokens_in),0) AS ti, COALESCE(SUM(tokens_out),0) AS tout, COALESCE(SUM(cost_usd),0) AS cost FROM request_daily_rollups WHERE org_
```
```
MixedAggregate  (cost=386.07..5567.21 rows=39 width=165) (actual time=4.492..4.506 rows=39 loops=1)
  Hash Key: model
  Hash Key: gateway_key_id
  Hash Key: application
  Hash Key: team
  Group Key: ()
  Batches: 1  Memory Usage: 80kB
  Buffers: shared read=559
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=386.07..5347.08 rows=3651 width=71) (actual time=0.562..2.117 rows=3781 loops=1)
        Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
        Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Heap Blocks: exact=471
        Buffers: shared read=559
        ->  Bitmap Index Scan on request_daily_rollups_pkey  (cost=0.00..385.16 rows=3899 width=0) (actual time=0.513..0.513 rows=3781 loops=1)
              Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
              Buffers: shared read=88
Planning Time: 0.120 ms
Execution Time: 4.575 ms
```

### investigation 24h vs 7d (1 project): 146.431 ms
```sql
 SELECT date_trunc('hour', r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.project_id = $2 AND r.created_at >= $3 AND r.created_at < $4 GROUP BY 1 ORDER BY 1
```
```
GroupAggregate  (cost=38434.49..40895.18 rows=82023 width=64) (actual time=127.228..145.346 rows=193 loops=1)
  Group Key: (date_trunc('hour'::text, r.created_at))
  Buffers: shared hit=1805 read=22864, temp read=315 written=316
  ->  Sort  (cost=38434.49..38639.54 rows=82023 width=22) (actual time=127.168..133.492 rows=78442 loops=1)
        Sort Key: (date_trunc('hour'::text, r.created_at))
        Sort Method: external merge  Disk: 2520kB
        Buffers: shared hit=1805 read=22864, temp read=315 written=316
        ->  Nested Loop  (cost=4700.37..31739.88 rows=82023 width=22) (actual time=12.625..102.897 rows=78442 loops=1)
              Buffers: shared hit=1805 read=22864
              ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.012..0.019 rows=1 loops=1)
                    Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Buffers: shared hit=2
              ->  Bitmap Heap Scan on requests r  (cost=4700.22..30706.42 rows=82023 width=59) (actual time=12.607..91.246 rows=78442 loops=1)
                    Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-16 10:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:35.542'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 4242
                    Heap Blocks: exact=23790
                    Buffers: shared hit=1803 read=22864
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..4679.71 rows=83783 width=0) (actual time=10.082..10.082 rows=82684 loops=1)
                          Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-16 10:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:35.542'::timestamp without time zone))
                          Buffers: shared hit=30 read=847
Planning:
  Buffers: shared read=4
Planning Time: 0.204 ms
Execution Time: 146.431 ms
```

### investigation 24h vs 7d (1 project): 118.385 ms
```sql
SELECT "public"."requests"."id", "public"."requests"."created_at", "public"."requests"."project_id", "public"."requests"."model", "public"."requests"."provider"::text, "public"."requests"."gateway_key_id", "public"."requests"."application", "public"."requests"."team", "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."reserv
```
```
Limit  (cost=29931.91..29931.93 rows=10 width=197) (actual time=118.141..118.146 rows=10 loops=1)
  Buffers: shared hit=3 read=20811
  ->  Sort  (cost=29931.91..30035.14 rows=41291 width=197) (actual time=118.139..118.142 rows=10 loops=1)
        Sort Key: requests.cost_estimate DESC
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=3 read=20811
        ->  Nested Loop  (cost=2366.11..29039.62 rows=41291 width=197) (actual time=9.766..100.018 rows=40791 loops=1)
              Buffers: shared hit=3 read=20811
              ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.019..0.025 rows=1 loops=1)
                    Index Cond: ((id IS NOT NULL) AND (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text))
                    Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests  (cost=2365.96..28412.09 rows=41291 width=169) (actual time=9.739..88.796 rows=40791 loops=1)
                    Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-23 10:57:35.542'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:35.542'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 2163
                    Heap Blocks: exact=20361
                    Buffers: shared hit=2 read=20810
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..2355.64 rows=42177 width=0) (actual time=7.099..7.100 rows=42954 loops=1)
                          Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-11-23 10:57:35.542'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:35.542'::timestamp without time zone))
                          Buffers: shared hit=1 read=450
Planning:
  Buffers: shared read=4
Planning Time: 0.239 ms
Execution Time: 118.385 ms
```

### investigation 30d vs 7d (org): 363.863 ms
```sql
 SELECT date_trunc('day', r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.created_at >= $2 AND r.created_at < $3 GROUP BY 1 ORDER BY 1
```
```
Finalize GroupAggregate  (cost=32619.00..33207.00 rows=4317 width=64) (actual time=303.908..361.963 rows=38 loops=1)
  Group Key: (date_trunc('day'::text, r.created_at))
  Buffers: shared hit=16211 read=8385, temp read=2533 written=2542
  ->  Gather Merge  (cost=32619.00..33088.27 rows=3598 width=64) (actual time=302.206..361.613 rows=114 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16211 read=8385, temp read=2533 written=2542
        ->  Partial GroupAggregate  (cost=31618.98..31672.95 rows=1799 width=64) (actual time=240.305..297.221 rows=38 loops=3)
              Group Key: (date_trunc('day'::text, r.created_at))
              Buffers: shared hit=16211 read=8385, temp read=2533 written=2542
              ->  Sort  (cost=31618.98..31623.48 rows=1799 width=22) (actual time=238.830..260.791 rows=209948 loops=3)
                    Sort Key: (date_trunc('day'::text, r.created_at))
                    Sort Method: external merge  Disk: 7112kB
                    Buffers: shared hit=16211 read=8385, temp read=2533 written=2542
                    Worker 0:  Sort Method: external merge  Disk: 6824kB
                    Worker 1:  Sort Method: external merge  Disk: 6328kB
                    ->  Hash Join  (cost=9.53..31521.72 rows=1799 width=22) (actual time=0.171..173.874 rows=209948 loops=3)
                          Hash Cond: (r.project_id = p.id)
                          Buffers: shared hit=16199 read=8383
                          ->  Parallel Seq Scan on requests r  (cost=0.00..30789.36 rows=269841 width=59) (actual time=0.027..92.446 rows=216434 loops=3)
                                Filter: ((NOT is_blocked) AND (created_at >= '2026-10-18 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:57:43.264'::timestamp without time zone))
                                Rows Removed by Filter: 116899
                                Buffers: shared hit=16167 read=8373
                          ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.060..0.061 rows=8 loops=3)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=6 read=2
                                ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.046..0.048 rows=8 loops=3)
                                      Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                      Heap Blocks: exact=1
                                      Buffers: shared hit=6 read=2
                                      ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.027..0.027 rows=8 loops=3)
                                            Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                            Buffers: shared hit=3 read=2
Planning:
  Buffers: shared read=4
Planning Time: 0.543 ms
Execution Time: 363.863 ms
```

### forecast (org): 0.081 ms
```sql
SELECT SUM("budget_monthly") AS "_sum$budget_monthly" FROM (SELECT "public"."projects"."budget_monthly" FROM "public"."projects" WHERE "public"."projects"."org_id" = $1 OFFSET $2) AS "sub"
```
```
Aggregate  (cost=9.51..9.52 rows=1 width=32) (actual time=0.029..0.030 rows=1 loops=1)
  Buffers: shared hit=2
  ->  Bitmap Heap Scan on projects  (cost=4.16..9.50 rows=2 width=16) (actual time=0.020..0.021 rows=8 loops=1)
        Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Heap Blocks: exact=1
        Buffers: shared hit=2
        ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.014..0.014 rows=8 loops=1)
              Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
              Buffers: shared hit=1
Planning Time: 0.090 ms
Execution Time: 0.081 ms
```

### model comparison 30d (org): 0.066 ms
```sql
SELECT "public"."provider_api_keys"."id", "public"."provider_api_keys"."provider"::text FROM "public"."provider_api_keys" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."provider_api_keys"."project_id") WHERE ("public"."provider_api_keys"."is_active" = $1 AND ("j0"."org_id" = $2 AND ("j0"."id" IS NOT NULL))) OFFSET $3
```
```
Nested Loop  (cost=8.33..19.02 rows=1 width=64) (actual time=0.020..0.020 rows=0 loops=1)
  Buffers: shared hit=18
  ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.009..0.011 rows=8 loops=1)
        Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Filter: (id IS NOT NULL)
        Heap Blocks: exact=1
        Buffers: shared hit=2
        ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.005..0.005 rows=8 loops=1)
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
Planning Time: 0.572 ms
Execution Time: 0.066 ms
```

### model comparison 30d (org): 720.705 ms
```sql
 SELECT r.model, r.provider::text AS provider, COUNT(*) AS requests, COALESCE(SUM(r.tokens_in),0) AS tokens_in, COALESCE(SUM(r.tokens_out),0) AS tokens_out, COALESCE(SUM(r.cached_tokens_in),0) AS cached_in, COALESCE(SUM(r.cost_estimate),0) AS cost, COUNT(r.cached_tokens_in) AS cache_known, AVG(r.tokens_in) AS avg_in, percentile_cont(0.5) WITHIN GROUP (ORDER BY r.tokens_in) AS p50_in, percentile_co
```
```
Limit  (cost=31996.08..31996.09 rows=5 width=223) (actual time=718.646..718.747 rows=5 loops=1)
  Buffers: shared hit=16271 read=8417, temp read=4644 written=4313
  ->  Sort  (cost=31996.08..31996.14 rows=24 width=223) (actual time=718.643..718.743 rows=5 loops=1)
        Sort Key: (COALESCE(sum(r.cost_estimate), '0'::numeric)) DESC
        Sort Method: quicksort  Memory: 26kB
        Buffers: shared hit=16271 read=8417, temp read=4644 written=4313
        ->  GroupAggregate  (cost=31433.34..31995.68 rows=24 width=223) (actual time=318.905..718.706 rows=6 loops=1)
              Group Key: r.model, r.provider
              Buffers: shared hit=16271 read=8417, temp read=4644 written=4313
              ->  Gather Merge  (cost=31433.34..31851.34 rows=3589 width=33) (actual time=259.868..393.160 rows=523021 loops=1)
                    Workers Planned: 2
                    Workers Launched: 2
                    Buffers: shared hit=16263 read=8417, temp read=2784 written=2793
                    ->  Sort  (cost=30433.32..30437.05 rows=1495 width=33) (actual time=252.695..288.370 rows=174340 loops=3)
                          Sort Key: r.model, r.provider
                          Sort Method: external merge  Disk: 7520kB
                          Buffers: shared hit=16263 read=8417, temp read=2784 written=2793
                          Worker 0:  Sort Method: external merge  Disk: 7728kB
                          Worker 1:  Sort Method: external merge  Disk: 7024kB
                          ->  Hash Join  (cost=9.53..30354.49 rows=1495 width=33) (actual time=0.367..162.843 rows=174340 loops=3)
                                Hash Cond: (r.project_id = p.id)
                                Buffers: shared hit=16232 read=8416
                                ->  Parallel Seq Scan on requests r  (cost=0.00..29747.80 rows=224319 width=70) (actual time=0.033..105.892 rows=179732 loops=3)
                                      Filter: ((NOT is_blocked) AND (created_at >= '2026-10-25 10:58:20.916'::timestamp without time zone))
                                      Rows Removed by Filter: 153602
                                      Buffers: shared hit=16124 read=8416
                                ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.039..0.041 rows=8 loops=3)
                                      Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                      Buffers: shared hit=8
                                      ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.026..0.028 rows=8 loops=3)
                                            Recheck Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                            Heap Blocks: exact=1
                                            Buffers: shared hit=8
                                            ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.016..0.016 rows=8 loops=3)
                                                  Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                                  Buffers: shared hit=5
Planning:
  Buffers: shared hit=22 read=5
Planning Time: 1.089 ms
Execution Time: 720.705 ms
```

### model comparison 30d (1 project): 0.052 ms
```sql
SELECT "public"."provider_api_keys"."id", "public"."provider_api_keys"."provider"::text FROM "public"."provider_api_keys" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."provider_api_keys"."project_id") WHERE ("public"."provider_api_keys"."is_active" = $1 AND ("j0"."org_id" = $2 AND ("j0"."id" IS NOT NULL)) AND "public"."provider_api_keys"."project_id" = $3) OFFSET $4
```
```
Nested Loop  (cost=4.31..17.69 rows=1 width=64) (actual time=0.005..0.006 rows=0 loops=1)
  Buffers: shared hit=2
  ->  Bitmap Heap Scan on provider_api_keys  (cost=4.16..9.50 rows=1 width=68) (actual time=0.005..0.005 rows=0 loops=1)
        Recheck Cond: (project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
        Filter: is_active
        Buffers: shared hit=2
        ->  Bitmap Index Scan on provider_api_keys_project_id_provider_idx  (cost=0.00..4.16 rows=2 width=0) (actual time=0.003..0.004 rows=0 loops=1)
              Index Cond: (project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
              Buffers: shared hit=2
  ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (never executed)
        Index Cond: ((id IS NOT NULL) AND (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text))
        Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
Planning:
  Buffers: shared hit=2
Planning Time: 0.123 ms
Execution Time: 0.052 ms
```

### model comparison 30d (1 project): 345.454 ms
```sql
 SELECT r.model, r.provider::text AS provider, COUNT(*) AS requests, COALESCE(SUM(r.tokens_in),0) AS tokens_in, COALESCE(SUM(r.tokens_out),0) AS tokens_out, COALESCE(SUM(r.cached_tokens_in),0) AS cached_in, COALESCE(SUM(r.cost_estimate),0) AS cost, COUNT(r.cached_tokens_in) AS cache_known, AVG(r.tokens_in) AS avg_in, percentile_cont(0.5) WITHIN GROUP (ORDER BY r.tokens_in) AS p50_in, percentile_co
```
```
Limit  (cost=72855.80..72855.81 rows=5 width=223) (actual time=343.771..343.775 rows=5 loops=1)
  Buffers: shared hit=1 read=26764, temp read=1044 written=1048
  ->  Sort  (cost=72855.80..72855.86 rows=24 width=223) (actual time=343.769..343.772 rows=5 loops=1)
        Sort Key: (COALESCE(sum(r.cost_estimate), '0'::numeric)) DESC
        Sort Method: quicksort  Memory: 26kB
        Buffers: shared hit=1 read=26764, temp read=1044 written=1048
        ->  GroupAggregate  (cost=64230.22..72855.40 rows=24 width=223) (actual time=245.057..343.744 rows=6 loops=1)
              Group Key: r.model, r.provider
              Buffers: shared hit=1 read=26764, temp read=1044 written=1048
              ->  Sort  (cost=64230.22..64737.54 rows=202927 width=33) (actual time=228.431..259.462 rows=196093 loops=1)
                    Sort Key: r.model, r.provider
                    Sort Method: external merge  Disk: 8352kB
                    Buffers: shared hit=1 read=26764, temp read=1044 written=1048
                    ->  Nested Loop  (cost=11104.10..40790.59 rows=202927 width=33) (actual time=33.615..165.054 rows=196093 loops=1)
                          Buffers: shared hit=1 read=26764
                          ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.272..0.278 rows=1 loops=1)
                                Index Cond: (id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text)
                                Filter: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
                                Buffers: shared hit=1 read=1
                          ->  Bitmap Heap Scan on requests r  (cost=11103.96..38753.16 rows=202927 width=70) (actual time=33.339..144.745 rows=196093 loops=1)
                                Recheck Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-10-25 10:58:31.802'::timestamp without time zone))
                                Filter: (NOT is_blocked)
                                Rows Removed by Filter: 10502
                                Heap Blocks: exact=24538
                                Buffers: shared read=26763
                                ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..11053.22 rows=207280 width=0) (actual time=29.657..29.657 rows=206595 loops=1)
                                      Index Cond: ((project_id = '554c234b-70e5-40d0-abc4-74e3f6f5e8a5'::text) AND (created_at >= '2026-10-25 10:58:31.802'::timestamp without time zone))
                                      Buffers: shared read=2225
Planning:
  Buffers: shared hit=3
Planning Time: 0.257 ms
Execution Time: 345.454 ms
```

### recommendations list: 0.018 ms
```sql
SELECT "public"."projects"."id", "public"."projects"."name" FROM "public"."projects" WHERE "public"."projects"."id" IN ($1,$2,$3,$4,$5,$6,$7,$8) OFFSET $9
```
```
Seq Scan on projects  (cost=0.00..16.00 rows=8 width=64) (actual time=0.009..0.012 rows=8 loops=1)
  Filter: (id = ANY ('{554c234b-70e5-40d0-abc4-74e3f6f5e8a5,c2e55617-442a-42bf-851a-39bfd23b7ff9,60a24401-5142-4ea3-8769-e7370b1ddbfe,c5d30145-53c4-458d-a93d-7e5768971bde,d039080f-b08a-43af-877d-f4e2d16d6a70,078f22f9-3af2-4c4b-be23-bc73893dca13,a26c2bf8-3f9d-4371-802c-fa2273c096a6,e3126c82-173b-4adc-ae90-ba8fbd9c7448}'::text[]))
  Rows Removed by Filter: 1
  Buffers: shared hit=1
Planning Time: 0.065 ms
Execution Time: 0.018 ms
```

### notification history (50): 0.205 ms
```sql
SELECT "public"."notification_deliveries"."id", "public"."notification_deliveries"."org_id", "public"."notification_deliveries"."channel_id", "public"."notification_deliveries"."channel_type", "public"."notification_deliveries"."event_id", "public"."notification_deliveries"."event_type", "public"."notification_deliveries"."status", "public"."notification_deliveries"."attempts", "public"."notificat
```
```
Limit  (cost=0.42..6.76 rows=50 width=755) (actual time=0.043..0.186 rows=50 loops=1)
  Buffers: shared hit=1 read=52
  ->  Index Scan Backward using notification_deliveries_org_id_created_at_idx on notification_deliveries  (cost=0.42..12694.92 rows=100000 width=755) (actual time=0.043..0.182 rows=50 loops=1)
        Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Buffers: shared hit=1 read=52
Planning Time: 0.070 ms
Execution Time: 0.205 ms
```

### notification history (50): 9.695 ms
```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."notification_deliveries"."id" FROM "public"."notification_deliveries" WHERE "public"."notification_deliveries"."org_id" = $1 OFFSET $2) AS "sub"
```
```
Aggregate  (cost=3332.29..3332.30 rows=1 width=8) (actual time=9.669..9.670 rows=1 loops=1)
  Buffers: shared read=83
  ->  Index Only Scan using notification_deliveries_org_id_channel_id_read_at_idx on notification_deliveries  (cost=0.29..2082.29 rows=100000 width=32) (actual time=0.047..6.150 rows=100000 loops=1)
        Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Heap Fetches: 0
        Buffers: shared read=83
Planning Time: 0.066 ms
Execution Time: 9.695 ms
```

### inbox page (20) + unread count: 0.070 ms
```sql
SELECT "public"."notification_deliveries"."id", "public"."notification_deliveries"."org_id", "public"."notification_deliveries"."channel_id", "public"."notification_deliveries"."channel_type", "public"."notification_deliveries"."event_id", "public"."notification_deliveries"."event_type", "public"."notification_deliveries"."status", "public"."notification_deliveries"."attempts", "public"."notificat
```
```
Limit  (cost=0.42..3.08 rows=21 width=755) (actual time=0.029..0.048 rows=21 loops=1)
  Buffers: shared hit=24
  ->  Index Scan Backward using notification_deliveries_org_id_created_at_idx on notification_deliveries  (cost=0.42..12694.92 rows=100000 width=755) (actual time=0.028..0.046 rows=21 loops=1)
        Index Cond: (org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text)
        Filter: (channel_id IS NULL)
        Buffers: shared hit=24
Planning Time: 0.095 ms
Execution Time: 0.070 ms
```

### inbox page (20) + unread count: 9.536 ms
```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."notification_deliveries"."id" FROM "public"."notification_deliveries" WHERE ("public"."notification_deliveries"."org_id" = $1 AND "public"."notification_deliveries"."channel_id" IS NULL AND "public"."notification_deliveries"."read_at" IS NULL) OFFSET $2) AS "sub"
```
```
Aggregate  (cost=3832.29..3832.30 rows=1 width=8) (actual time=9.497..9.497 rows=1 loops=1)
  Buffers: shared hit=83
  ->  Index Only Scan using notification_deliveries_org_id_channel_id_read_at_idx on notification_deliveries  (cost=0.29..2582.29 rows=100000 width=32) (actual time=0.043..5.986 rows=100000 loops=1)
        Index Cond: ((org_id = 'a3696567-9735-4cbb-a04d-dc737c5dae30'::text) AND (channel_id IS NULL) AND (read_at IS NULL))
        Heap Fetches: 0
        Buffers: shared hit=83
Planning Time: 0.079 ms
Execution Time: 9.536 ms
```

