# Cost Insights benchmark (2026-11-24) — daily rollups ON

Environment: node v24.22.1, win32; Postgres 16.15, shared_buffers=128MB, work_mem=4MB. Single machine, Postgres in Docker, the benchmark and database share CPU. **These numbers describe this environment only.**
Data: synthetic. 8 projects (skewed: the busiest holds roughly 40% of rows), 6 models (skewed), 5 applications + 25% unattributed, 4 teams + 30% unattributed, 20 gateway keys on 10% of rows, 60 days of history with a denser last day, 2% blocked, plus a second organization holding ~3% of rows. Warm cache (each endpoint is run once untimed first).

## 1,000,000 request rows

| endpoint | p50 ms | p95 ms | p99 ms | max ms | DB queries/call | DB time/call ms | heap Δ MB |
|---|---:|---:|---:|---:|---:|---:|---:|
| attribution by model (org, 30d) | 307.4 | 505.2 | 505.2 | 505.2 | 6 | 553.1 | 0.3 |
| attribution by application (org, 30d) | 269.6 | 450.2 | 450.2 | 450.2 | 6 | 471.1 | 0.3 |
| attribution by key (org, 30d) | 292.8 | 647.6 | 647.6 | 647.6 | 7 | 555.5 | 0.4 |
| attribution by model (1 project, 30d) | 176.9 | 388.3 | 388.3 | 388.3 | 7 | 333.7 | 0.3 |
| investigation 24h vs 7d (org) | 1527.9 | 2140.8 | 2140.8 | 2140.8 | 41 | 7545.4 | 1.6 |
| investigation 24h vs 7d (1 project) | 459.0 | 600.8 | 600.8 | 600.8 | 36 | 2024.1 | 1.8 |
| investigation 30d vs 7d (org) | 2616.2 | 3885.5 | 3885.5 | 3885.5 | 48 | 6689.1 | 1.6 |
| forecast (org) | 148.3 | 444.4 | 444.4 | 444.4 | 4 | 185.4 | 0.3 |
| forecast (1 project) | 46.9 | 53.1 | 53.1 | 53.1 | 4 | 42.1 | 0.3 |
| model comparison 30d (org) | 725.2 | 906.8 | 906.8 | 906.8 | 2 | 708.3 | 0.5 |
| model comparison 30d (1 project) | 352.8 | 667.4 | 667.4 | 667.4 | 3 | 380.4 | 0.5 |
| recommendations list | 7.3 | 9.7 | 9.7 | 9.7 | 2 | 2.4 | 0.3 |
| notification history (50) | 14.0 | 34.6 | 34.6 | 34.6 | 2 | 14.7 | 0.2 |
| inbox page (20) + unread count | 21.4 | 40.3 | 40.3 | 40.3 | 3 | 41.0 | 0.2 |

Iterations per endpoint: 15 (so p99 is effectively the max of 15 samples).

## Query plans at 1,000,000 rows (EXPLAIN ANALYZE, BUFFERS; one per distinct query)

### attribution by model (org, 30d): 146.970 ms
```sql
SELECT SUM("tokens_in") AS "_sum$tokens_in", SUM("tokens_out") AS "_sum$tokens_out", SUM("cost_estimate") AS "_sum$cost_estimate", COUNT("id") AS "_count$id" FROM (SELECT "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"
```
```
Aggregate  (cost=12998.61..12998.62 rows=1 width=56) (actual time=146.792..146.795 rows=1 loops=1)
  Buffers: shared hit=19858 read=19888
  ->  Nested Loop  (cost=289.93..12997.10 rows=151 width=47) (actual time=1.353..136.764 rows=46106 loops=1)
        Buffers: shared hit=19858 read=19888
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..54.11 rows=1 width=32) (actual time=0.024..0.085 rows=8 loops=1)
              Index Cond: (id IS NOT NULL)
              Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Rows Removed by Filter: 1
              Buffers: shared hit=1 read=1
        ->  Bitmap Heap Scan on requests  (cost=289.78..12892.78 rows=5021 width=84) (actual time=2.329..16.141 rows=5763 loops=8)
              Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:21:52.841'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 119
              Heap Blocks: exact=39226
              Buffers: shared hit=19857 read=19887
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..288.53 rows=5128 width=0) (actual time=1.572..1.572 rows=5882 loops=8)
                    Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:21:52.841'::timestamp without time zone))
                    Buffers: shared hit=7 read=511
Planning:
  Buffers: shared read=4
Planning Time: 0.503 ms
Execution Time: 146.970 ms
```

### attribution by model (org, 30d): 183.471 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."model" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"."org_
```
```
GroupAggregate  (cost=13002.57..13004.91 rows=6 width=67) (actual time=164.369..182.350 rows=6 loops=1)
  Group Key: requests.model
  Buffers: shared hit=21425 read=18321, temp read=401 written=402
  ->  Sort  (cost=13002.57..13002.94 rows=151 width=58) (actual time=161.595..169.701 rows=46106 loops=1)
        Sort Key: requests.model
        Sort Method: external merge  Disk: 3208kB
        Buffers: shared hit=21425 read=18321, temp read=401 written=402
        ->  Nested Loop  (cost=289.93..12997.10 rows=151 width=58) (actual time=1.983..132.830 rows=46106 loops=1)
              Buffers: shared hit=21425 read=18321
              ->  Index Scan using projects_pkey on projects j0  (cost=0.15..54.11 rows=1 width=32) (actual time=0.043..0.103 rows=8 loops=1)
                    Index Cond: (id IS NOT NULL)
                    Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests  (cost=289.78..12892.78 rows=5021 width=95) (actual time=2.882..15.673 rows=5763 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:21:52.841'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 119
                    Heap Blocks: exact=39226
                    Buffers: shared hit=21424 read=18320
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..288.53 rows=5128 width=0) (actual time=2.026..2.026 rows=5882 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:21:52.841'::timestamp without time zone))
                          Buffers: shared hit=8 read=510
Planning:
  Buffers: shared read=4
Planning Time: 0.746 ms
Execution Time: 183.471 ms
```

### attribution by model (org, 30d): 31.480 ms
```sql
 SELECT COALESCE(SUM(requests), 0) AS n, COALESCE(SUM(tokens_in), 0) AS ti, COALESCE(SUM(tokens_out), 0) AS tout, COALESCE(SUM(cost_usd), 0) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date
```
```
Finalize Aggregate  (cost=7609.93..7609.94 rows=1 width=104) (actual time=27.375..31.415 rows=1 loops=1)
  Buffers: shared read=4958
  ->  Gather  (cost=7609.68..7609.89 rows=2 width=104) (actual time=27.135..31.384 rows=3 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared read=4958
        ->  Partial Aggregate  (cost=6609.68..6609.69 rows=1 width=104) (actual time=19.796..19.797 rows=1 loops=3)
              Buffers: shared read=4958
              ->  Parallel Seq Scan on request_daily_rollups  (cost=0.00..6263.33 rows=34634 width=26) (actual time=1.271..12.895 rows=27858 loops=3)
                    Filter: ((day >= '2026-10-26'::date) AND (day < '2026-11-24'::date) AND (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text))
                    Rows Removed by Filter: 31815
                    Buffers: shared read=4958
Planning Time: 0.124 ms
Execution Time: 31.480 ms
```

### attribution by model (org, 30d): 31.588 ms
```sql
 SELECT model AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1
```
```
Finalize GroupAggregate  (cost=7696.46..7698.21 rows=6 width=116) (actual time=27.865..31.490 rows=6 loops=1)
  Group Key: model
  Buffers: shared hit=112 read=4862
  ->  Gather Merge  (cost=7696.46..7697.86 rows=12 width=116) (actual time=27.843..31.441 rows=18 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=112 read=4862
        ->  Sort  (cost=6696.44..6696.45 rows=6 width=116) (actual time=22.236..22.238 rows=6 loops=3)
              Sort Key: model
              Sort Method: quicksort  Memory: 26kB
              Buffers: shared hit=112 read=4862
              Worker 0:  Sort Method: quicksort  Memory: 26kB
              Worker 1:  Sort Method: quicksort  Memory: 26kB
              ->  Partial HashAggregate  (cost=6696.26..6696.36 rows=6 width=116) (actual time=22.139..22.144 rows=6 loops=3)
                    Group Key: model
                    Batches: 1  Memory Usage: 24kB
                    Buffers: shared hit=97 read=4861
                    Worker 0:  Batches: 1  Memory Usage: 24kB
                    Worker 1:  Batches: 1  Memory Usage: 24kB
                    ->  Parallel Seq Scan on request_daily_rollups  (cost=0.00..6263.33 rows=34634 width=38) (actual time=1.106..11.613 rows=27858 loops=3)
                          Filter: ((day >= '2026-10-26'::date) AND (day < '2026-11-24'::date) AND (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text))
                          Rows Removed by Filter: 31815
                          Buffers: shared hit=97 read=4861
Planning Time: 0.124 ms
Execution Time: 31.588 ms
```

### attribution by application (org, 30d): 171.639 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."application" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"
```
```
GroupAggregate  (cost=13002.57..13004.89 rows=5 width=66) (actual time=156.772..170.755 rows=6 loops=1)
  Group Key: requests.application
  Buffers: shared hit=20631 read=19115, temp read=380 written=381
  ->  Sort  (cost=13002.57..13002.94 rows=151 width=57) (actual time=154.617..161.169 rows=46106 loops=1)
        Sort Key: requests.application
        Sort Method: external merge  Disk: 3040kB
        Buffers: shared hit=20631 read=19115, temp read=380 written=381
        ->  Nested Loop  (cost=289.93..12997.10 rows=151 width=57) (actual time=1.841..129.539 rows=46106 loops=1)
              Buffers: shared hit=20631 read=19115
              ->  Index Scan using projects_pkey on projects j0  (cost=0.15..54.11 rows=1 width=32) (actual time=0.048..0.111 rows=8 loops=1)
                    Index Cond: (id IS NOT NULL)
                    Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests  (cost=289.78..12892.78 rows=5021 width=94) (actual time=2.492..15.280 rows=5763 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:21:59.473'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 119
                    Heap Blocks: exact=39226
                    Buffers: shared hit=20630 read=19114
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..288.53 rows=5128 width=0) (actual time=1.689..1.689 rows=5882 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:21:59.473'::timestamp without time zone))
                          Buffers: shared hit=8 read=510
Planning:
  Buffers: shared read=4
Planning Time: 0.700 ms
Execution Time: 171.639 ms
```

### attribution by application (org, 30d): 30.161 ms
```sql
 SELECT application AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1
```
```
Finalize GroupAggregate  (cost=7696.46..7698.21 rows=6 width=114) (actual time=27.141..30.072 rows=6 loops=1)
  Group Key: application
  Buffers: shared hit=15 read=4959
  ->  Gather Merge  (cost=7696.46..7697.86 rows=12 width=114) (actual time=27.120..30.028 rows=18 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=15 read=4959
        ->  Sort  (cost=6696.44..6696.45 rows=6 width=114) (actual time=22.272..22.273 rows=6 loops=3)
              Sort Key: application
              Sort Method: quicksort  Memory: 26kB
              Buffers: shared hit=15 read=4959
              Worker 0:  Sort Method: quicksort  Memory: 26kB
              Worker 1:  Sort Method: quicksort  Memory: 26kB
              ->  Partial HashAggregate  (cost=6696.26..6696.36 rows=6 width=114) (actual time=22.186..22.191 rows=6 loops=3)
                    Group Key: application
                    Batches: 1  Memory Usage: 24kB
                    Buffers: shared read=4958
                    Worker 0:  Batches: 1  Memory Usage: 24kB
                    Worker 1:  Batches: 1  Memory Usage: 24kB
                    ->  Parallel Seq Scan on request_daily_rollups  (cost=0.00..6263.33 rows=34634 width=36) (actual time=1.438..11.751 rows=27858 loops=3)
                          Filter: ((day >= '2026-10-26'::date) AND (day < '2026-11-24'::date) AND (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text))
                          Rows Removed by Filter: 31815
                          Buffers: shared read=4958
Planning Time: 0.136 ms
Execution Time: 30.161 ms
```

### attribution by key (org, 30d): 159.057 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."gateway_key_id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("
```
```
GroupAggregate  (cost=13002.57..13005.08 rows=20 width=93) (actual time=144.777..158.179 rows=21 loops=1)
  Group Key: requests.gateway_key_id
  Buffers: shared hit=21236 read=18510, temp read=352 written=353
  ->  Sort  (cost=13002.57..13002.94 rows=151 width=84) (actual time=144.681..149.495 rows=46106 loops=1)
        Sort Key: requests.gateway_key_id
        Sort Method: external merge  Disk: 2816kB
        Buffers: shared hit=21236 read=18510, temp read=352 written=353
        ->  Nested Loop  (cost=289.93..12997.10 rows=151 width=84) (actual time=1.100..125.427 rows=46106 loops=1)
              Buffers: shared hit=21236 read=18510
              ->  Index Scan using projects_pkey on projects j0  (cost=0.15..54.11 rows=1 width=32) (actual time=0.024..0.083 rows=8 loops=1)
                    Index Cond: (id IS NOT NULL)
                    Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests  (cost=289.78..12892.78 rows=5021 width=121) (actual time=2.136..14.714 rows=5763 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:05.346'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 119
                    Heap Blocks: exact=39226
                    Buffers: shared hit=21235 read=18509
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..288.53 rows=5128 width=0) (actual time=1.460..1.460 rows=5882 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:05.346'::timestamp without time zone))
                          Buffers: shared hit=8 read=510
Planning:
  Buffers: shared read=4
Planning Time: 0.505 ms
Execution Time: 159.057 ms
```

### attribution by key (org, 30d): 32.023 ms
```sql
 SELECT gateway_key_id AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1
```
```
Finalize GroupAggregate  (cost=7697.11..7703.22 rows=21 width=122) (actual time=28.958..31.917 rows=21 loops=1)
  Group Key: gateway_key_id
  Buffers: shared hit=15 read=4959
  ->  Gather Merge  (cost=7697.11..7702.01 rows=42 width=122) (actual time=28.930..31.784 rows=63 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=15 read=4959
        ->  Sort  (cost=6697.09..6697.14 rows=21 width=122) (actual time=21.965..21.968 rows=21 loops=3)
              Sort Key: gateway_key_id
              Sort Method: quicksort  Memory: 29kB
              Buffers: shared hit=15 read=4959
              Worker 0:  Sort Method: quicksort  Memory: 29kB
              Worker 1:  Sort Method: quicksort  Memory: 29kB
              ->  Partial HashAggregate  (cost=6696.26..6696.62 rows=21 width=122) (actual time=21.800..21.816 rows=21 loops=3)
                    Group Key: gateway_key_id
                    Batches: 1  Memory Usage: 32kB
                    Buffers: shared read=4958
                    Worker 0:  Batches: 1  Memory Usage: 32kB
                    Worker 1:  Batches: 1  Memory Usage: 32kB
                    ->  Parallel Seq Scan on request_daily_rollups  (cost=0.00..6263.33 rows=34634 width=44) (actual time=1.046..11.266 rows=27858 loops=3)
                          Filter: ((day >= '2026-10-26'::date) AND (day < '2026-11-24'::date) AND (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text))
                          Rows Removed by Filter: 31815
                          Buffers: shared read=4958
Planning Time: 0.116 ms
Execution Time: 32.023 ms
```

### attribution by key (org, 30d): 0.150 ms
```sql
SELECT "public"."gateway_api_keys"."id", "public"."gateway_api_keys"."key_name", "public"."gateway_api_keys"."key_prefix" FROM "public"."gateway_api_keys" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."gateway_api_keys"."project_id") WHERE ("public"."gateway_api_keys"."id" IN ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20) AND ("j0"."org_id" = $21 AND ("
```
```
Hash Join  (cost=9.57..10.90 rows=1 width=48) (actual time=0.054..0.064 rows=20 loops=1)
  Hash Cond: (gateway_api_keys.project_id = j0.id)
  Buffers: shared hit=1 read=2
  ->  Seq Scan on gateway_api_keys  (cost=0.05..1.35 rows=13 width=85) (actual time=0.020..0.024 rows=20 loops=1)
        Filter: (id = ANY ('{08a1e3a4-02a5-4023-9c1c-3c753d1f1271,11a86767-bc71-47e7-9bde-687c3cdf4faa,151dc6da-46a9-46cd-821d-41f81d0c591e,2187f3c9-a267-46b8-8cec-64739e811dc7,4c7e5769-ebed-4b9c-8627-bad299ce59ac,4e2c87e1-67c5-44e6-b7dc-f8f5bdf72118,572c3493-5c7a-444a-838d-54a63efa59bd,67592888-b5d4-4be8-ad9d-c9750fc89579,6930fa0b-edf8-4883-932f-82009465e3ae,783c114a-bcf1-48bb-9334-31ad9ecd29b2,8b7dcdeb-da91-4474-bd1c-defd39831d38,9db7a1c0-ccb5-4539-b951-80649789b3a0,b3e50251-1ea3-424d-9d85-d292583d4806,c03ccb50-4ffb-4b26-864f-681a11e3ce76,c3da9945-2d46-4671-9f42-01c37e286011,cb9c0522-88a3-494f-b3c5-527c99cd5390,cff7188b-db5e-41f4-aae1-45b507d34ed8,daa8f629-e8fe-4585-b331-1b14bad680a6,eab093a8-52e3-4140-8b6a-7699f08cdd59,f6ce3b24-c4f6-47fe-92d3-6b78649bad60}'::text[]))
        Buffers: shared read=1
  ->  Hash  (cost=9.50..9.50 rows=1 width=32) (actual time=0.024..0.025 rows=8 loops=1)
        Buckets: 1024  Batches: 1  Memory Usage: 9kB
        Buffers: shared hit=1 read=1
        ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.016..0.017 rows=8 loops=1)
              Recheck Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Filter: (id IS NOT NULL)
              Heap Blocks: exact=1
              Buffers: shared hit=1 read=1
              ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.010..0.010 rows=8 loops=1)
                    Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Buffers: shared read=1
Planning Time: 0.177 ms
Execution Time: 0.150 ms
```

### attribution by model (1 project, 30d): 0.061 ms
```sql
SELECT "public"."projects"."id", "public"."projects"."name", "public"."projects"."budget_monthly" FROM "public"."projects" WHERE ("public"."projects"."id" = $1 AND "public"."projects"."org_id" = $2) LIMIT $3 OFFSET $4
```
```
Limit  (cost=0.15..8.17 rows=1 width=80) (actual time=0.039..0.040 rows=1 loops=1)
  Buffers: shared hit=1 read=1
  ->  Index Scan using projects_pkey on projects  (cost=0.15..8.17 rows=1 width=80) (actual time=0.038..0.038 rows=1 loops=1)
        Index Cond: (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text)
        Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Buffers: shared hit=1 read=1
Planning Time: 0.061 ms
Execution Time: 0.061 ms
```

### attribution by model (1 project, 30d): 60.749 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."model" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"."org_
```
```
HashAggregate  (cost=25157.16..25157.24 rows=6 width=67) (actual time=60.531..60.536 rows=6 loops=1)
  Group Key: requests.model
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=6778 read=6407
  ->  Nested Loop  (cost=973.94..24944.56 rows=17008 width=58) (actual time=5.824..52.799 rows=17368 loops=1)
        Buffers: shared hit=6778 read=6407
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.019..0.025 rows=1 loops=1)
              Index Cond: ((id IS NOT NULL) AND (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text))
              Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Buffers: shared hit=2
        ->  Bitmap Heap Scan on requests  (cost=973.79..24766.31 rows=17008 width=95) (actual time=5.801..48.655 rows=17368 loops=1)
              Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:12.125'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 949
              Heap Blocks: exact=12978
              Buffers: shared hit=6776 read=6407
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..969.54 rows=17369 width=0) (actual time=3.939..3.939 rows=18317 loops=1)
                    Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:12.125'::timestamp without time zone))
                    Buffers: shared hit=1 read=204
Planning:
  Buffers: shared read=4
Planning Time: 0.263 ms
Execution Time: 60.749 ms
```

### attribution by model (1 project, 30d): 30.049 ms
```sql
SELECT SUM("tokens_in") AS "_sum$tokens_in", SUM("tokens_out") AS "_sum$tokens_out", SUM("cost_estimate") AS "_sum$cost_estimate", COUNT("id") AS "_count$id" FROM (SELECT "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"
```
```
Aggregate  (cost=25114.64..25114.65 rows=1 width=56) (actual time=29.884..29.886 rows=1 loops=1)
  Buffers: shared hit=12596 read=589
  ->  Nested Loop  (cost=973.94..24944.56 rows=17008 width=47) (actual time=5.532..27.077 rows=17368 loops=1)
        Buffers: shared hit=12596 read=589
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.016..0.021 rows=1 loops=1)
              Index Cond: ((id IS NOT NULL) AND (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text))
              Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Buffers: shared hit=2
        ->  Bitmap Heap Scan on requests  (cost=973.79..24766.31 rows=17008 width=84) (actual time=5.513..24.899 rows=17368 loops=1)
              Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:12.125'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 949
              Heap Blocks: exact=12978
              Buffers: shared hit=12594 read=589
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..969.54 rows=17369 width=0) (actual time=3.608..3.608 rows=18317 loops=1)
                    Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-24 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:12.125'::timestamp without time zone))
                    Buffers: shared hit=205
Planning:
  Buffers: shared hit=4
Planning Time: 0.277 ms
Execution Time: 30.049 ms
```

### attribution by model (1 project, 30d): 19.208 ms
```sql
 SELECT COALESCE(SUM(requests), 0) AS n, COALESCE(SUM(tokens_in), 0) AS ti, COALESCE(SUM(tokens_out), 0) AS tout, COALESCE(SUM(cost_usd), 0) AS cost FROM request_daily_rollups WHERE org_id = $1 AND project_id = $2 AND day >= $3::date AND day < $4::date
```
```
Aggregate  (cost=7522.84..7522.85 rows=1 width=104) (actual time=19.099..19.100 rows=1 loops=1)
  Buffers: shared read=2847
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=1978.64..7335.92 rows=18691 width=26) (actual time=5.392..15.400 rows=20012 loops=1)
        Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (day >= '2026-10-26'::date) AND (day < '2026-11-24'::date))
        Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Heap Blocks: exact=2398
        Buffers: shared read=2847
        ->  Bitmap Index Scan on request_daily_rollups_pkey  (cost=0.00..1973.97 rows=19964 width=0) (actual time=5.052..5.052 rows=20012 loops=1)
              Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (day >= '2026-10-26'::date) AND (day < '2026-11-24'::date))
              Buffers: shared read=449
Planning Time: 0.165 ms
Execution Time: 19.208 ms
```

### attribution by model (1 project, 30d): 41.924 ms
```sql
 SELECT model AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND project_id = $2 AND day >= $3::date AND day < $4::date GROUP BY 1
```
```
Finalize GroupAggregate  (cost=7547.36..7549.11 rows=6 width=116) (actual time=37.951..41.802 rows=6 loops=1)
  Group Key: model
  Buffers: shared hit=2414 read=2560
  ->  Gather Merge  (cost=7547.36..7548.76 rows=12 width=116) (actual time=37.911..41.740 rows=18 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=2414 read=2560
        ->  Sort  (cost=6547.34..6547.36 rows=6 width=116) (actual time=30.901..30.904 rows=6 loops=3)
              Sort Key: model
              Sort Method: quicksort  Memory: 26kB
              Buffers: shared hit=2414 read=2560
              Worker 0:  Sort Method: quicksort  Memory: 26kB
              Worker 1:  Sort Method: quicksort  Memory: 26kB
              ->  Partial HashAggregate  (cost=6547.16..6547.26 rows=6 width=116) (actual time=30.724..30.732 rows=6 loops=3)
                    Group Key: model
                    Batches: 1  Memory Usage: 24kB
                    Buffers: shared hit=2398 read=2560
                    Worker 0:  Batches: 1  Memory Usage: 24kB
                    Worker 1:  Batches: 1  Memory Usage: 24kB
                    ->  Parallel Seq Scan on request_daily_rollups  (cost=0.00..6449.81 rows=7788 width=38) (actual time=1.982..26.671 rows=6671 loops=3)
                          Filter: ((day >= '2026-10-26'::date) AND (day < '2026-11-24'::date) AND (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text) AND (project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text))
                          Rows Removed by Filter: 53002
                          Buffers: shared hit=2398 read=2560
Planning Time: 0.170 ms
Execution Time: 41.924 ms
```

### investigation 24h vs 7d (org): 336.191 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."team" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"."org_i
```
```
GroupAggregate  (cost=21675.69..21681.14 rows=4 width=62) (actual time=304.336..334.455 rows=5 loops=1)
  Group Key: requests.team
  Buffers: shared hit=35893 read=40741, temp read=875 written=877
  ->  Sort  (cost=21675.69..21676.59 rows=360 width=53) (actual time=295.306..312.469 rows=108305 loops=1)
        Sort Key: requests.team
        Sort Method: external merge  Disk: 7000kB
        Buffers: shared hit=35893 read=40741, temp read=875 written=877
        ->  Nested Loop  (cost=692.75..21660.40 rows=360 width=53) (actual time=12.583..248.246 rows=108305 loops=1)
              Buffers: shared hit=35893 read=40741
              ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.032..0.046 rows=8 loops=1)
                    Recheck Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Filter: (id IS NOT NULL)
                    Heap Blocks: exact=1
                    Buffers: shared hit=1 read=1
                    ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.022..0.022 rows=8 loops=1)
                          Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                          Buffers: shared read=1
              ->  Bitmap Heap Scan on requests  (cost=688.59..21530.92 rows=11998 width=90) (actual time=4.603..29.076 rows=13538 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:22:19.323'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:19.323'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 280
                    Heap Blocks: exact=75436
                    Buffers: shared hit=35892 read=40740
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..685.59 rows=12253 width=0) (actual time=3.217..3.217 rows=13818 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:22:19.323'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:19.323'::timestamp without time zone))
                          Buffers: shared hit=211 read=985
Planning:
  Buffers: shared hit=4
Planning Time: 0.358 ms
Execution Time: 336.191 ms
```

### investigation 24h vs 7d (org): 458.625 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."project_id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0".
```
```
GroupAggregate  (cost=688.73..21709.62 rows=9 width=93) (actual time=20.432..458.259 rows=8 loops=1)
  Group Key: requests.project_id
  Buffers: shared hit=39129 read=37505
  ->  Nested Loop  (cost=688.73..21705.00 rows=360 width=84) (actual time=2.788..410.911 rows=108305 loops=1)
        Buffers: shared hit=39129 read=37505
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..54.11 rows=1 width=32) (actual time=0.018..0.074 rows=8 loops=1)
              Index Cond: (id IS NOT NULL)
              Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Rows Removed by Filter: 1
              Buffers: shared hit=1 read=1
        ->  Bitmap Heap Scan on requests  (cost=688.59..21530.92 rows=11998 width=84) (actual time=7.974..48.377 rows=13538 loops=8)
              Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:22:19.323'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:19.323'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 280
              Heap Blocks: exact=75436
              Buffers: shared hit=39128 read=37504
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..685.59 rows=12253 width=0) (actual time=5.913..5.913 rows=13818 loops=8)
                    Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:22:19.323'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:19.323'::timestamp without time zone))
                    Buffers: shared hit=79 read=1117
Planning:
  Buffers: shared read=4
Planning Time: 0.434 ms
Execution Time: 458.625 ms
```

### investigation 24h vs 7d (org): 58.456 ms
```sql
 SELECT date_trunc('day', r.created_at) AS day, COALESCE(SUM(r.cost_estimate), 0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.created_at >= $2 AND r.created_at < $3 GROUP BY 1 ORDER BY 1
```
```
GroupAggregate  (cost=6530.69..6531.95 rows=56 width=40) (actual time=58.080..58.085 rows=1 loops=1)
  Group Key: (date_trunc('day'::text, r.created_at))
  Buffers: shared hit=4570 read=2662
  ->  Sort  (cost=6530.69..6530.83 rows=56 width=14) (actual time=55.964..56.495 rows=7199 loops=1)
        Sort Key: (date_trunc('day'::text, r.created_at))
        Sort Method: quicksort  Memory: 474kB
        Buffers: shared hit=4570 read=2662
        ->  Nested Loop  (cost=56.78..6529.07 rows=56 width=14) (actual time=0.396..51.567 rows=7199 loops=1)
              Buffers: shared hit=4570 read=2662
              ->  Index Scan using projects_pkey on projects p  (cost=0.15..53.40 rows=2 width=32) (actual time=0.069..0.135 rows=8 loops=1)
                    Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Rows Removed by Filter: 1
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests r  (cost=56.63..3228.38 rows=938 width=51) (actual time=1.037..5.971 rows=900 loops=8)
                    Recheck Cond: ((project_id = p.id) AND (created_at >= '2026-11-23 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-23 10:22:19.323'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 20
                    Heap Blocks: exact=7130
                    Buffers: shared hit=4569 read=2661
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..56.40 rows=958 width=0) (actual time=0.801..0.801 rows=919 loops=8)
                          Index Cond: ((project_id = p.id) AND (created_at >= '2026-11-23 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-23 10:22:19.323'::timestamp without time zone))
                          Buffers: shared hit=12 read=88
Planning Time: 0.748 ms
Execution Time: 58.456 ms
```

### investigation 24h vs 7d (org): 15.418 ms
```sql
 SELECT team AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1
```
```
HashAggregate  (cost=5736.78..5736.87 rows=5 width=109) (actual time=15.261..15.267 rows=5 loops=1)
  Group Key: team
  Batches: 1  Memory Usage: 24kB
  Buffers: shared read=493
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=288.70..5532.58 rows=16336 width=31) (actual time=0.764..5.789 rows=16531 loops=1)
        Recheck Cond: ((org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
        Heap Blocks: exact=473
        Buffers: shared read=493
        ->  Bitmap Index Scan on request_daily_rollups_org_id_day_idx  (cost=0.00..284.62 rows=16336 width=0) (actual time=0.686..0.687 rows=16531 loops=1)
              Index Cond: ((org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
              Buffers: shared read=20
Planning Time: 0.179 ms
Execution Time: 15.418 ms
```

### investigation 24h vs 7d (org): 21.145 ms
```sql
 SELECT project_id AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND day >= $2::date AND day < $3::date GROUP BY 1
```
```
HashAggregate  (cost=5736.78..5736.94 rows=9 width=141) (actual time=20.775..20.785 rows=8 loops=1)
  Group Key: project_id
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=493
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=288.70..5532.58 rows=16336 width=63) (actual time=0.680..5.640 rows=16531 loops=1)
        Recheck Cond: ((org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
        Heap Blocks: exact=473
        Buffers: shared hit=493
        ->  Bitmap Index Scan on request_daily_rollups_org_id_day_idx  (cost=0.00..284.62 rows=16336 width=0) (actual time=0.611..0.612 rows=16531 loops=1)
              Index Cond: ((org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
              Buffers: shared hit=20
Planning Time: 0.623 ms
Execution Time: 21.145 ms
```

### investigation 24h vs 7d (org): 0.183 ms
```sql
SELECT "public"."projects"."id", "public"."projects"."name" FROM "public"."projects" WHERE ("public"."projects"."org_id" = $1 AND "public"."projects"."id" IN ($2,$3,$4,$5,$6,$7,$8,$9)) OFFSET $10
```
```
Bitmap Heap Scan on projects  (cost=4.16..9.52 rows=1 width=64) (actual time=0.069..0.073 rows=8 loops=1)
  Recheck Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
  Filter: (id = ANY ('{070c519e-b334-403b-b94c-51e12af6415f,1c6e6d76-81a8-4aae-a726-228a0cf45876,28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2,2ffd4794-9095-4d1e-a2a2-d294f3e3d969,48a16d6a-f14e-4b33-a1f3-90802b7dc6b4,97521982-f627-44ff-896a-d9cf03cd7b45,9affb457-fcaa-4d44-9e50-4d68e8a79077,b40b4a2d-c199-43c7-979b-ba6dd7b5f5c6}'::text[]))
  Heap Blocks: exact=1
  Buffers: shared hit=1 read=1
  ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.057..0.057 rows=8 loops=1)
        Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Buffers: shared read=1
Planning Time: 0.145 ms
Execution Time: 0.183 ms
```

### investigation 24h vs 7d (org): 320.679 ms
```sql
 SELECT date_trunc('hour', r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.created_at >= $2 AND r.created_at < $3 GROUP BY 1 ORDER BY 1
```
```
Finalize GroupAggregate  (cost=32068.05..32263.84 rows=1438 width=64) (actual time=275.091..319.772 rows=193 loops=1)
  Group Key: (date_trunc('hour'::text, r.created_at))
  Buffers: shared hit=15517 read=9079, temp read=843 written=846
  ->  Gather Merge  (cost=32068.05..32224.30 rows=1198 width=64) (actual time=274.926..318.707 rows=579 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=15517 read=9079, temp read=843 written=846
        ->  Partial GroupAggregate  (cost=31068.02..31085.99 rows=599 width=64) (actual time=255.896..292.177 rows=193 loops=3)
              Group Key: (date_trunc('hour'::text, r.created_at))
              Buffers: shared hit=15517 read=9079, temp read=843 written=846
              ->  Sort  (cost=31068.02..31069.52 rows=599 width=22) (actual time=255.758..268.244 rows=69803 loops=3)
                    Sort Key: (date_trunc('hour'::text, r.created_at))
                    Sort Method: external merge  Disk: 2520kB
                    Buffers: shared hit=15517 read=9079, temp read=843 written=846
                    Worker 0:  Sort Method: external merge  Disk: 2144kB
                    Worker 1:  Sort Method: external merge  Disk: 2080kB
                    ->  Hash Join  (cost=9.53..31040.39 rows=599 width=22) (actual time=0.280..210.584 rows=69803 loops=3)
                          Hash Cond: (r.project_id = p.id)
                          Buffers: shared hit=15505 read=9077
                          ->  Parallel Seq Scan on requests r  (cost=0.00..30790.14 rows=89860 width=59) (actual time=0.038..156.484 rows=71956 loops=3)
                                Filter: ((NOT is_blocked) AND (created_at >= '2026-11-16 10:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:19.323'::timestamp without time zone))
                                Rows Removed by Filter: 261377
                                Buffers: shared hit=15472 read=9068
                          ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.068..0.070 rows=8 loops=3)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=7 read=1
                                ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.050..0.053 rows=8 loops=3)
                                      Recheck Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                                      Heap Blocks: exact=1
                                      Buffers: shared hit=7 read=1
                                      ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.020..0.021 rows=8 loops=3)
                                            Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                                            Buffers: shared hit=4 read=1
Planning:
  Buffers: shared read=4
Planning Time: 0.772 ms
Execution Time: 320.679 ms
```

### investigation 24h vs 7d (org): 417.781 ms
```sql
SELECT "public"."requests"."id", "public"."requests"."created_at", "public"."requests"."project_id", "public"."requests"."model", "public"."requests"."provider"::text, "public"."requests"."gateway_key_id", "public"."requests"."application", "public"."requests"."team", "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."reserv
```
```
Limit  (cost=21669.98..21670.01 rows=10 width=197) (actual time=417.529..417.535 rows=10 loops=1)
  Buffers: shared hit=38343 read=38291
  ->  Sort  (cost=21669.98..21670.88 rows=360 width=197) (actual time=417.526..417.530 rows=10 loops=1)
        Sort Key: requests.cost_estimate DESC
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=38343 read=38291
        ->  Nested Loop  (cost=692.75..21662.20 rows=360 width=197) (actual time=21.981..351.355 rows=108305 loops=1)
              Buffers: shared hit=38343 read=38291
              ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.027..0.041 rows=8 loops=1)
                    Recheck Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Filter: (id IS NOT NULL)
                    Heap Blocks: exact=1
                    Buffers: shared hit=2
                    ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.015..0.016 rows=8 loops=1)
                          Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                          Buffers: shared hit=1
              ->  Bitmap Heap Scan on requests  (cost=688.59..21530.92 rows=11998 width=169) (actual time=6.439..38.683 rows=13538 loops=8)
                    Recheck Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:22:19.323'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:19.323'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 280
                    Heap Blocks: exact=75436
                    Buffers: shared hit=38341 read=38291
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..685.59 rows=12253 width=0) (actual time=4.686..4.686 rows=13818 loops=8)
                          Index Cond: ((project_id = j0.id) AND (created_at >= '2026-11-23 10:22:19.323'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:19.323'::timestamp without time zone))
                          Buffers: shared hit=10 read=1186
Planning:
  Buffers: shared hit=4
Planning Time: 0.775 ms
Execution Time: 417.781 ms
```

### investigation 24h vs 7d (1 project): 117.145 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."team" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"."org_i
```
```
HashAggregate  (cost=29348.43..29348.48 rows=4 width=62) (actual time=116.885..116.890 rows=5 loops=1)
  Group Key: requests.team
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=6883 read=13937
  ->  Nested Loop  (cost=2329.52..28840.43 rows=40640 width=53) (actual time=14.450..100.733 rows=40677 loops=1)
        Buffers: shared hit=6883 read=13937
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.054..0.060 rows=1 loops=1)
              Index Cond: ((id IS NOT NULL) AND (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text))
              Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Buffers: shared hit=1 read=1
        ->  Bitmap Heap Scan on requests  (cost=2329.37..28425.86 rows=40640 width=90) (actual time=14.390..94.083 rows=40677 loops=1)
              Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 10:22:44.238'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 2239
              Heap Blocks: exact=20347
              Buffers: shared hit=6882 read=13936
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..2319.21 rows=41503 width=0) (actual time=10.950..10.950 rows=42916 loops=1)
                    Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 10:22:44.238'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
                    Buffers: shared hit=1 read=470
Planning:
  Buffers: shared read=4
Planning Time: 0.570 ms
Execution Time: 117.145 ms
```

### investigation 24h vs 7d (1 project): 12.413 ms
```sql
 SELECT date_trunc('day', r.created_at) AS day, COALESCE(SUM(r.cost_estimate), 0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.project_id = $2 AND r.created_at >= $3 AND r.created_at < $4 GROUP BY 1 ORDER BY 1
```
```
GroupAggregate  (cost=9442.56..9514.11 rows=3180 width=40) (actual time=12.234..12.237 rows=1 loops=1)
  Group Key: (date_trunc('day'::text, r.created_at))
  Buffers: shared hit=1746 read=1020
  ->  Sort  (cost=9442.56..9450.51 rows=3180 width=14) (actual time=11.353..11.540 rows=2748 loops=1)
        Sort Key: (date_trunc('day'::text, r.created_at))
        Sort Method: quicksort  Memory: 204kB
        Buffers: shared hit=1746 read=1020
        ->  Nested Loop  (cost=185.97..9257.56 rows=3180 width=14) (actual time=1.107..10.228 rows=2748 loops=1)
              Buffers: shared hit=1746 read=1020
              ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.036..0.042 rows=1 loops=1)
                    Index Cond: (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text)
                    Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests r  (cost=185.82..9209.65 rows=3180 width=51) (actual time=1.065..8.909 rows=2748 loops=1)
                    Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-23 10:22:44.238'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 157
                    Heap Blocks: exact=2728
                    Buffers: shared hit=1745 read=1019
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..185.03 rows=3248 width=0) (actual time=0.727..0.727 rows=2905 loops=1)
                          Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-23 10:22:44.238'::timestamp without time zone))
                          Buffers: shared hit=1 read=35
Planning Time: 0.223 ms
Execution Time: 12.413 ms
```

### investigation 24h vs 7d (1 project): 115.631 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."application" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("j0"
```
```
HashAggregate  (cost=29348.43..29348.50 rows=5 width=66) (actual time=115.397..115.402 rows=6 loops=1)
  Group Key: requests.application
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=2473 read=18347
  ->  Nested Loop  (cost=2329.52..28840.43 rows=40640 width=57) (actual time=13.251..101.302 rows=40677 loops=1)
        Buffers: shared hit=2473 read=18347
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.022..0.028 rows=1 loops=1)
              Index Cond: ((id IS NOT NULL) AND (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text))
              Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Buffers: shared hit=2
        ->  Bitmap Heap Scan on requests  (cost=2329.37..28425.86 rows=40640 width=94) (actual time=13.225..95.405 rows=40677 loops=1)
              Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 10:22:44.238'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 2239
              Heap Blocks: exact=20347
              Buffers: shared hit=2471 read=18347
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..2319.21 rows=41503 width=0) (actual time=9.419..9.419 rows=42916 loops=1)
                    Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 10:22:44.238'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
                    Buffers: shared hit=3 read=468
Planning:
  Buffers: shared read=4
Planning Time: 0.341 ms
Execution Time: 115.631 ms
```

### investigation 24h vs 7d (1 project): 120.054 ms
```sql
SELECT SUM("public"."requests"."tokens_in") AS "_sum$tokens_in", SUM("public"."requests"."tokens_out") AS "_sum$tokens_out", SUM("public"."requests"."cost_estimate") AS "_sum$cost_estimate", COUNT("public"."requests"."id") AS "_count$id", "public"."requests"."gateway_key_id" FROM "public"."requests" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."requests"."project_id") WHERE (("
```
```
HashAggregate  (cost=29348.43..29348.68 rows=20 width=93) (actual time=119.795..119.810 rows=21 loops=1)
  Group Key: requests.gateway_key_id
  Batches: 1  Memory Usage: 32kB
  Buffers: shared hit=348 read=20472
  ->  Nested Loop  (cost=2329.52..28840.43 rows=40640 width=84) (actual time=13.038..106.838 rows=40677 loops=1)
        Buffers: shared hit=348 read=20472
        ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.021..0.028 rows=1 loops=1)
              Index Cond: ((id IS NOT NULL) AND (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text))
              Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Buffers: shared hit=2
        ->  Bitmap Heap Scan on requests  (cost=2329.37..28425.86 rows=40640 width=121) (actual time=13.013..100.450 rows=40677 loops=1)
              Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 10:22:44.238'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
              Filter: (NOT is_blocked)
              Rows Removed by Filter: 2239
              Heap Blocks: exact=20347
              Buffers: shared hit=346 read=20472
              ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..2319.21 rows=41503 width=0) (actual time=9.221..9.222 rows=42916 loops=1)
                    Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 10:22:44.238'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
                    Buffers: shared hit=3 read=468
Planning:
  Buffers: shared read=4
Planning Time: 0.381 ms
Execution Time: 120.054 ms
```

### investigation 24h vs 7d (1 project): 5.369 ms
```sql
 SELECT team AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND project_id = $2 AND day >= $3::date AND day < $4::date GROUP BY 1
```
```
HashAggregate  (cost=5409.60..5409.69 rows=5 width=109) (actual time=5.213..5.219 rows=5 loops=1)
  Group Key: team
  Batches: 1  Memory Usage: 24kB
  Buffers: shared read=567
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=390.39..5363.69 rows=3673 width=31) (actual time=1.312..3.720 rows=4025 loops=1)
        Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
        Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Heap Blocks: exact=473
        Buffers: shared read=567
        ->  Bitmap Index Scan on request_daily_rollups_pkey  (cost=0.00..389.47 rows=3924 width=0) (actual time=1.220..1.220 rows=4025 loops=1)
              Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
              Buffers: shared read=94
Planning Time: 0.170 ms
Execution Time: 5.369 ms
```

### investigation 24h vs 7d (1 project): 3.380 ms
```sql
 SELECT gateway_key_id AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND project_id = $2 AND day >= $3::date AND day < $4::date GROUP BY 1
```
```
HashAggregate  (cost=5409.60..5409.97 rows=21 width=122) (actual time=3.258..3.272 rows=21 loops=1)
  Group Key: gateway_key_id
  Batches: 1  Memory Usage: 32kB
  Buffers: shared hit=567
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=390.39..5363.69 rows=3673 width=44) (actual time=0.628..1.838 rows=4025 loops=1)
        Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
        Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Heap Blocks: exact=473
        Buffers: shared hit=567
        ->  Bitmap Index Scan on request_daily_rollups_pkey  (cost=0.00..389.47 rows=3924 width=0) (actual time=0.569..0.570 rows=4025 loops=1)
              Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
              Buffers: shared hit=94
Planning Time: 0.126 ms
Execution Time: 3.380 ms
```

### investigation 24h vs 7d (1 project): 3.473 ms
```sql
 SELECT application AS k, SUM(requests) AS n, SUM(tokens_in) AS ti, SUM(tokens_out) AS tout, SUM(cost_usd) AS cost FROM request_daily_rollups WHERE org_id = $1 AND project_id = $2 AND day >= $3::date AND day < $4::date GROUP BY 1
```
```
HashAggregate  (cost=5409.60..5409.71 rows=6 width=114) (actual time=3.335..3.339 rows=6 loops=1)
  Group Key: application
  Batches: 1  Memory Usage: 24kB
  Buffers: shared hit=567
  ->  Bitmap Heap Scan on request_daily_rollups  (cost=390.39..5363.69 rows=3673 width=36) (actual time=0.984..2.093 rows=4025 loops=1)
        Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
        Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Heap Blocks: exact=473
        Buffers: shared hit=567
        ->  Bitmap Index Scan on request_daily_rollups_pkey  (cost=0.00..389.47 rows=3924 width=0) (actual time=0.918..0.919 rows=4025 loops=1)
              Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (day >= '2026-11-17'::date) AND (day < '2026-11-23'::date))
              Buffers: shared hit=94
Planning Time: 0.173 ms
Execution Time: 3.473 ms
```

### investigation 24h vs 7d (1 project): 246.685 ms
```sql
 SELECT date_trunc('hour', r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.project_id = $2 AND r.created_at >= $3 AND r.created_at < $4 GROUP BY 1 ORDER BY 1
```
```
GroupAggregate  (cost=38277.07..40712.03 rows=81162 width=64) (actual time=221.291..245.604 rows=193 loops=1)
  Group Key: (date_trunc('hour'::text, r.created_at))
  Buffers: shared hit=2 read=24731, temp read=317 written=318
  ->  Sort  (cost=38277.07..38479.99 rows=81169 width=22) (actual time=221.204..229.044 rows=78917 loops=1)
        Sort Key: (date_trunc('hour'::text, r.created_at))
        Sort Method: external merge  Disk: 2536kB
        Buffers: shared hit=2 read=24731, temp read=317 written=318
        ->  Nested Loop  (cost=4645.03..31658.29 rows=81169 width=22) (actual time=20.846..187.066 rows=78917 loops=1)
              Buffers: shared hit=2 read=24731
              ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.020..0.028 rows=1 loops=1)
                    Index Cond: (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text)
                    Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests r  (cost=4644.88..30635.51 rows=81169 width=59) (actual time=20.818..161.724 rows=78917 loops=1)
                    Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-16 10:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 4394
                    Heap Blocks: exact=23824
                    Buffers: shared hit=1 read=24730
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..4624.59 rows=82893 width=0) (actual time=16.975..16.975 rows=83311 loops=1)
                          Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-16 10:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
                          Buffers: shared hit=1 read=906
Planning:
  Buffers: shared read=4
Planning Time: 0.303 ms
Execution Time: 246.685 ms
```

### investigation 24h vs 7d (1 project): 141.984 ms
```sql
SELECT "public"."requests"."id", "public"."requests"."created_at", "public"."requests"."project_id", "public"."requests"."model", "public"."requests"."provider"::text, "public"."requests"."gateway_key_id", "public"."requests"."application", "public"."requests"."team", "public"."requests"."tokens_in", "public"."requests"."tokens_out", "public"."requests"."cost_estimate", "public"."requests"."reserv
```
```
Limit  (cost=29921.85..29921.87 rows=10 width=197) (actual time=141.765..141.769 rows=10 loops=1)
  Buffers: shared hit=1 read=20819
  ->  Sort  (cost=29921.85..30023.45 rows=40640 width=197) (actual time=141.762..141.765 rows=10 loops=1)
        Sort Key: requests.cost_estimate DESC
        Sort Method: top-N heapsort  Memory: 29kB
        Buffers: shared hit=1 read=20819
        ->  Nested Loop  (cost=2329.52..29043.63 rows=40640 width=197) (actual time=14.259..119.337 rows=40677 loops=1)
              Buffers: shared hit=1 read=20819
              ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (actual time=0.026..0.032 rows=1 loops=1)
                    Index Cond: ((id IS NOT NULL) AND (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text))
                    Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                    Buffers: shared hit=1 read=1
              ->  Bitmap Heap Scan on requests  (cost=2329.37..28425.86 rows=40640 width=169) (actual time=14.224..105.013 rows=40677 loops=1)
                    Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 10:22:44.238'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
                    Filter: (NOT is_blocked)
                    Rows Removed by Filter: 2239
                    Heap Blocks: exact=20347
                    Buffers: shared read=20818
                    ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..2319.21 rows=41503 width=0) (actual time=10.359..10.359 rows=42916 loops=1)
                          Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-11-23 10:22:44.238'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:44.238'::timestamp without time zone))
                          Buffers: shared read=471
Planning:
  Buffers: shared read=4
Planning Time: 0.301 ms
Execution Time: 141.984 ms
```

### investigation 30d vs 7d (org): 473.418 ms
```sql
 SELECT date_trunc('day', r.created_at) AS b, COUNT(*) AS n, COALESCE(SUM(r.tokens_in),0) AS ti, COALESCE(SUM(r.tokens_out),0) AS tout, COALESCE(SUM(r.cost_estimate),0) AS cost FROM requests r JOIN projects p ON p.id = r.project_id WHERE p.org_id = $1 AND r.is_blocked = false AND r.created_at >= $2 AND r.created_at < $3 GROUP BY 1 ORDER BY 1
```
```
Finalize GroupAggregate  (cost=32623.48..33214.10 rows=4337 width=64) (actual time=391.020..471.733 rows=38 loops=1)
  Group Key: (date_trunc('day'::text, r.created_at))
  Buffers: shared hit=16211 read=8385, temp read=2531 written=2540
  ->  Gather Merge  (cost=32623.48..33094.83 rows=3614 width=64) (actual time=388.545..471.360 rows=114 loops=1)
        Workers Planned: 2
        Workers Launched: 2
        Buffers: shared hit=16211 read=8385, temp read=2531 written=2540
        ->  Partial GroupAggregate  (cost=31623.45..31677.66 rows=1807 width=64) (actual time=302.959..381.528 rows=38 loops=3)
              Group Key: (date_trunc('day'::text, r.created_at))
              Buffers: shared hit=16211 read=8385, temp read=2531 written=2540
              ->  Sort  (cost=31623.45..31627.97 rows=1807 width=22) (actual time=301.094..332.649 rows=209793 loops=3)
                    Sort Key: (date_trunc('day'::text, r.created_at))
                    Sort Method: external merge  Disk: 7112kB
                    Buffers: shared hit=16211 read=8385, temp read=2531 written=2540
                    Worker 0:  Sort Method: external merge  Disk: 6552kB
                    Worker 1:  Sort Method: external merge  Disk: 6584kB
                    ->  Hash Join  (cost=9.53..31525.70 rows=1807 width=22) (actual time=0.200..219.251 rows=209793 loops=3)
                          Hash Cond: (r.project_id = p.id)
                          Buffers: shared hit=16199 read=8383
                          ->  Parallel Seq Scan on requests r  (cost=0.00..30790.14 rows=271034 width=59) (actual time=0.035..118.387 rows=216271 loops=3)
                                Filter: ((NOT is_blocked) AND (created_at >= '2026-10-18 00:00:00'::timestamp without time zone) AND (created_at < '2026-11-24 10:22:55.311'::timestamp without time zone))
                                Rows Removed by Filter: 117063
                                Buffers: shared hit=16167 read=8373
                          ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.047..0.049 rows=8 loops=3)
                                Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                Buffers: shared hit=6 read=2
                                ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.034..0.037 rows=8 loops=3)
                                      Recheck Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                                      Heap Blocks: exact=1
                                      Buffers: shared hit=6 read=2
                                      ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.019..0.019 rows=8 loops=3)
                                            Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                                            Buffers: shared hit=3 read=2
Planning:
  Buffers: shared read=4
Planning Time: 0.335 ms
Execution Time: 473.418 ms
```

### forecast (org): 0.085 ms
```sql
SELECT SUM("budget_monthly") AS "_sum$budget_monthly" FROM (SELECT "public"."projects"."budget_monthly" FROM "public"."projects" WHERE "public"."projects"."org_id" = $1 OFFSET $2) AS "sub"
```
```
Aggregate  (cost=9.51..9.52 rows=1 width=32) (actual time=0.030..0.031 rows=1 loops=1)
  Buffers: shared hit=2
  ->  Bitmap Heap Scan on projects  (cost=4.16..9.50 rows=2 width=16) (actual time=0.021..0.022 rows=8 loops=1)
        Recheck Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Heap Blocks: exact=1
        Buffers: shared hit=2
        ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.014..0.015 rows=8 loops=1)
              Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Buffers: shared hit=1
Planning Time: 0.095 ms
Execution Time: 0.085 ms
```

### model comparison 30d (org): 0.098 ms
```sql
SELECT "public"."provider_api_keys"."id", "public"."provider_api_keys"."provider"::text FROM "public"."provider_api_keys" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."provider_api_keys"."project_id") WHERE ("public"."provider_api_keys"."is_active" = $1 AND ("j0"."org_id" = $2 AND ("j0"."id" IS NOT NULL))) OFFSET $3
```
```
Nested Loop  (cost=8.33..19.02 rows=1 width=64) (actual time=0.030..0.030 rows=0 loops=1)
  Buffers: shared hit=18
  ->  Bitmap Heap Scan on projects j0  (cost=4.16..9.50 rows=1 width=32) (actual time=0.018..0.019 rows=8 loops=1)
        Recheck Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Filter: (id IS NOT NULL)
        Heap Blocks: exact=1
        Buffers: shared hit=2
        ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.011..0.011 rows=8 loops=1)
              Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
              Buffers: shared hit=1
  ->  Bitmap Heap Scan on provider_api_keys  (cost=4.16..9.50 rows=1 width=68) (actual time=0.001..0.001 rows=0 loops=8)
        Recheck Cond: (project_id = j0.id)
        Filter: is_active
        Buffers: shared hit=16
        ->  Bitmap Index Scan on provider_api_keys_project_id_provider_idx  (cost=0.00..4.16 rows=2 width=0) (actual time=0.000..0.000 rows=0 loops=8)
              Index Cond: (project_id = j0.id)
              Buffers: shared hit=16
Planning:
  Buffers: shared read=2
Planning Time: 0.600 ms
Execution Time: 0.098 ms
```

### model comparison 30d (org): 910.078 ms
```sql
 SELECT r.model, r.provider::text AS provider, COUNT(*) AS requests, COALESCE(SUM(r.tokens_in),0) AS tokens_in, COALESCE(SUM(r.tokens_out),0) AS tokens_out, COALESCE(SUM(r.cached_tokens_in),0) AS cached_in, COALESCE(SUM(r.cost_estimate),0) AS cost, COUNT(r.cached_tokens_in) AS cache_known, AVG(r.tokens_in) AS avg_in, percentile_cont(0.5) WITHIN GROUP (ORDER BY r.tokens_in) AS p50_in, percentile_co
```
```
Limit  (cost=32001.54..32001.55 rows=5 width=223) (actual time=907.650..907.784 rows=5 loops=1)
  Buffers: shared hit=16263 read=8417, temp read=4640 written=4311
  ->  Sort  (cost=32001.54..32001.60 rows=24 width=223) (actual time=907.647..907.780 rows=5 loops=1)
        Sort Key: (COALESCE(sum(r.cost_estimate), '0'::numeric)) DESC
        Sort Method: quicksort  Memory: 26kB
        Buffers: shared hit=16263 read=8417, temp read=4640 written=4311
        ->  GroupAggregate  (cost=31436.62..32001.14 rows=24 width=223) (actual time=389.424..907.736 rows=6 loops=1)
              Group Key: r.model, r.provider
              Buffers: shared hit=16263 read=8417, temp read=4640 written=4311
              ->  Gather Merge  (cost=31436.62..31856.24 rows=3603 width=33) (actual time=319.285..488.704 rows=523385 loops=1)
                    Workers Planned: 2
                    Workers Launched: 2
                    Buffers: shared hit=16263 read=8417, temp read=2786 written=2795
                    ->  Sort  (cost=30436.59..30440.34 rows=1501 width=33) (actual time=311.031..361.909 rows=174462 loops=3)
                          Sort Key: r.model, r.provider
                          Sort Method: external merge  Disk: 8168kB
                          Buffers: shared hit=16263 read=8417, temp read=2786 written=2795
                          Worker 0:  Sort Method: external merge  Disk: 7048kB
                          Worker 1:  Sort Method: external merge  Disk: 7072kB
                          ->  Hash Join  (cost=9.53..30357.40 rows=1501 width=33) (actual time=0.270..196.833 rows=174462 loops=3)
                                Hash Cond: (r.project_id = p.id)
                                Buffers: shared hit=16233 read=8415
                                ->  Parallel Seq Scan on requests r  (cost=0.00..29748.45 rows=225167 width=70) (actual time=0.027..130.794 rows=179821 loops=3)
                                      Filter: ((NOT is_blocked) AND (created_at >= '2026-10-25 10:23:42.499'::timestamp without time zone))
                                      Rows Removed by Filter: 153513
                                      Buffers: shared hit=16125 read=8415
                                ->  Hash  (cost=9.50..9.50 rows=2 width=32) (actual time=0.040..0.042 rows=8 loops=3)
                                      Buckets: 1024  Batches: 1  Memory Usage: 9kB
                                      Buffers: shared hit=8
                                      ->  Bitmap Heap Scan on projects p  (cost=4.16..9.50 rows=2 width=32) (actual time=0.026..0.028 rows=8 loops=3)
                                            Recheck Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                                            Heap Blocks: exact=1
                                            Buffers: shared hit=8
                                            ->  Bitmap Index Scan on projects_org_id_slug_key  (cost=0.00..4.16 rows=2 width=0) (actual time=0.013..0.014 rows=8 loops=3)
                                                  Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                                                  Buffers: shared hit=5
Planning:
  Buffers: shared read=3
Planning Time: 0.791 ms
Execution Time: 910.078 ms
```

### model comparison 30d (1 project): 0.069 ms
```sql
SELECT "public"."provider_api_keys"."id", "public"."provider_api_keys"."provider"::text FROM "public"."provider_api_keys" LEFT JOIN "public"."projects" AS "j0" ON ("j0"."id") = ("public"."provider_api_keys"."project_id") WHERE ("public"."provider_api_keys"."is_active" = $1 AND ("j0"."org_id" = $2 AND ("j0"."id" IS NOT NULL)) AND "public"."provider_api_keys"."project_id" = $3) OFFSET $4
```
```
Nested Loop  (cost=4.31..17.69 rows=1 width=64) (actual time=0.005..0.006 rows=0 loops=1)
  Buffers: shared hit=2
  ->  Bitmap Heap Scan on provider_api_keys  (cost=4.16..9.50 rows=1 width=68) (actual time=0.005..0.005 rows=0 loops=1)
        Recheck Cond: (project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text)
        Filter: is_active
        Buffers: shared hit=2
        ->  Bitmap Index Scan on provider_api_keys_project_id_provider_idx  (cost=0.00..4.16 rows=2 width=0) (actual time=0.003..0.003 rows=0 loops=1)
              Index Cond: (project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text)
              Buffers: shared hit=2
  ->  Index Scan using projects_pkey on projects j0  (cost=0.15..8.17 rows=1 width=32) (never executed)
        Index Cond: ((id IS NOT NULL) AND (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text))
        Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
Planning:
  Buffers: shared hit=2
Planning Time: 0.144 ms
Execution Time: 0.069 ms
```

### model comparison 30d (1 project): 482.070 ms
```sql
 SELECT r.model, r.provider::text AS provider, COUNT(*) AS requests, COALESCE(SUM(r.tokens_in),0) AS tokens_in, COALESCE(SUM(r.tokens_out),0) AS tokens_out, COALESCE(SUM(r.cached_tokens_in),0) AS cached_in, COALESCE(SUM(r.cost_estimate),0) AS cost, COUNT(r.cached_tokens_in) AS cache_known, AVG(r.tokens_in) AS avg_in, percentile_cont(0.5) WITHIN GROUP (ORDER BY r.tokens_in) AS p50_in, percentile_co
```
```
Limit  (cost=72957.28..72957.29 rows=5 width=223) (actual time=479.977..479.982 rows=5 loops=1)
  Buffers: shared hit=17 read=26753, temp read=1048 written=1052
  ->  Sort  (cost=72957.28..72957.34 rows=24 width=223) (actual time=479.974..479.978 rows=5 loops=1)
        Sort Key: (COALESCE(sum(r.cost_estimate), '0'::numeric)) DESC
        Sort Method: quicksort  Memory: 26kB
        Buffers: shared hit=17 read=26753, temp read=1048 written=1052
        ->  GroupAggregate  (cost=64312.11..72956.88 rows=24 width=223) (actual time=314.539..479.937 rows=6 loops=1)
              Group Key: r.model, r.provider
              Buffers: shared hit=17 read=26753, temp read=1048 written=1052
              ->  Sort  (cost=64312.11..64820.58 rows=203388 width=33) (actual time=291.418..340.138 rows=196750 loops=1)
                    Sort Key: r.model, r.provider
                    Sort Method: external merge  Disk: 8384kB
                    Buffers: shared hit=17 read=26753, temp read=1048 written=1052
                    ->  Nested Loop  (cost=11120.50..40818.02 rows=203388 width=33) (actual time=37.179..205.021 rows=196750 loops=1)
                          Buffers: shared hit=17 read=26753
                          ->  Index Scan using projects_pkey on projects p  (cost=0.15..8.17 rows=1 width=32) (actual time=0.379..0.386 rows=1 loops=1)
                                Index Cond: (id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text)
                                Filter: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
                                Buffers: shared hit=1 read=1
                          ->  Bitmap Heap Scan on requests r  (cost=11120.35..38775.97 rows=203388 width=70) (actual time=36.793..179.677 rows=196750 loops=1)
                                Recheck Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-10-25 10:23:54.983'::timestamp without time zone))
                                Filter: (NOT is_blocked)
                                Rows Removed by Filter: 10861
                                Heap Blocks: exact=24539
                                Buffers: shared hit=16 read=26752
                                ->  Bitmap Index Scan on requests_project_id_created_at_idx  (cost=0.00..11069.50 rows=207708 width=0) (actual time=32.954..32.954 rows=207611 loops=1)
                                      Index Cond: ((project_id = '28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2'::text) AND (created_at >= '2026-10-25 10:23:54.983'::timestamp without time zone))
                                      Buffers: shared read=2229
Planning:
  Buffers: shared hit=3
Planning Time: 0.350 ms
Execution Time: 482.070 ms
```

### recommendations list: 0.038 ms
```sql
SELECT "public"."projects"."id", "public"."projects"."name" FROM "public"."projects" WHERE "public"."projects"."id" IN ($1,$2,$3,$4,$5,$6,$7,$8) OFFSET $9
```
```
Seq Scan on projects  (cost=0.00..16.00 rows=8 width=64) (actual time=0.019..0.023 rows=8 loops=1)
  Filter: (id = ANY ('{28a6e5a9-b4b3-4cde-bb71-ad1db8b3f2b2,1c6e6d76-81a8-4aae-a726-228a0cf45876,48a16d6a-f14e-4b33-a1f3-90802b7dc6b4,b40b4a2d-c199-43c7-979b-ba6dd7b5f5c6,9affb457-fcaa-4d44-9e50-4d68e8a79077,2ffd4794-9095-4d1e-a2a2-d294f3e3d969,97521982-f627-44ff-896a-d9cf03cd7b45,070c519e-b334-403b-b94c-51e12af6415f}'::text[]))
  Rows Removed by Filter: 1
  Buffers: shared hit=1
Planning Time: 0.118 ms
Execution Time: 0.038 ms
```

### notification history (50): 0.924 ms
```sql
SELECT "public"."notification_deliveries"."id", "public"."notification_deliveries"."org_id", "public"."notification_deliveries"."channel_id", "public"."notification_deliveries"."channel_type", "public"."notification_deliveries"."event_id", "public"."notification_deliveries"."event_type", "public"."notification_deliveries"."status", "public"."notification_deliveries"."attempts", "public"."notificat
```
```
Limit  (cost=0.42..6.87 rows=50 width=760) (actual time=0.084..0.855 rows=50 loops=1)
  Buffers: shared hit=1 read=54
  ->  Index Scan Backward using notification_deliveries_org_id_created_at_idx on notification_deliveries  (cost=0.42..12906.21 rows=99963 width=760) (actual time=0.083..0.842 rows=50 loops=1)
        Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Buffers: shared hit=1 read=54
Planning Time: 0.202 ms
Execution Time: 0.924 ms
```

### notification history (50): 23.267 ms
```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."notification_deliveries"."id" FROM "public"."notification_deliveries" WHERE "public"."notification_deliveries"."org_id" = $1 OFFSET $2) AS "sub"
```
```
Aggregate  (cost=3331.18..3331.19 rows=1 width=8) (actual time=23.219..23.220 rows=1 loops=1)
  Buffers: shared read=83
  ->  Index Only Scan using notification_deliveries_org_id_channel_id_read_at_idx on notification_deliveries  (cost=0.29..2081.64 rows=99963 width=32) (actual time=0.065..15.210 rows=100000 loops=1)
        Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Heap Fetches: 0
        Buffers: shared read=83
Planning Time: 0.209 ms
Execution Time: 23.267 ms
```

### inbox page (20) + unread count: 0.168 ms
```sql
SELECT "public"."notification_deliveries"."id", "public"."notification_deliveries"."org_id", "public"."notification_deliveries"."channel_id", "public"."notification_deliveries"."channel_type", "public"."notification_deliveries"."event_id", "public"."notification_deliveries"."event_type", "public"."notification_deliveries"."status", "public"."notification_deliveries"."attempts", "public"."notificat
```
```
Limit  (cost=0.42..3.13 rows=21 width=760) (actual time=0.053..0.099 rows=21 loops=1)
  Buffers: shared hit=26
  ->  Index Scan Backward using notification_deliveries_org_id_created_at_idx on notification_deliveries  (cost=0.42..12906.21 rows=99963 width=760) (actual time=0.052..0.095 rows=21 loops=1)
        Index Cond: (org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text)
        Filter: (channel_id IS NULL)
        Buffers: shared hit=26
Planning Time: 0.217 ms
Execution Time: 0.168 ms
```

### inbox page (20) + unread count: 16.610 ms
```sql
SELECT COUNT(*) AS "_count$_all" FROM (SELECT "public"."notification_deliveries"."id" FROM "public"."notification_deliveries" WHERE ("public"."notification_deliveries"."org_id" = $1 AND "public"."notification_deliveries"."channel_id" IS NULL AND "public"."notification_deliveries"."read_at" IS NULL) OFFSET $2) AS "sub"
```
```
Aggregate  (cost=3831.00..3831.01 rows=1 width=8) (actual time=16.524..16.526 rows=1 loops=1)
  Buffers: shared hit=83
  ->  Index Only Scan using notification_deliveries_org_id_channel_id_read_at_idx on notification_deliveries  (cost=0.29..2581.46 rows=99963 width=32) (actual time=0.070..10.570 rows=100000 loops=1)
        Index Cond: ((org_id = '9acfae2c-580a-4c1b-8987-ce2fee98d8f3'::text) AND (channel_id IS NULL) AND (read_at IS NULL))
        Heap Fetches: 0
        Buffers: shared hit=83
Planning Time: 0.434 ms
Execution Time: 16.610 ms
```

