# Performance tests

Load, real-time and frontend performance checks for the LMS. Methodology and
results: [docs/performance.md](../docs/performance.md).

| Script | What it measures |
|---|---|
| `load.mjs` | HTTP scenarios (autocannon) at 1/10/25/50/100 connections |
| `flow.mjs` | concurrent test taking (start → submit), write path |
| `socket-latency.mjs` | Socket.IO chat delivery latency |
| `endpoints.mjs` | per-endpoint before/after comparison |
| `prod.mjs` | gentle read-only check of the deployed API |
| `lighthouse.mjs` | Lighthouse desktop/mobile for key pages |
| `db/scale.sql`, `db/explain.sql` | scaled dataset (separate DB only!) and query plans |
| `charts.py` | charts for the report (matplotlib) |

Load tests run against a separate local backend instance with relaxed
throttling (`THROTTLE_LIMIT`, `THROTTLE_AUTH_LIMIT`); never relax production.
