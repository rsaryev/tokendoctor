# Benchmark history

A row per arm per run of `run.ts`, its medians over the runs: whether the task was solved (every test passed), the time, the cost Claude Code reports, the model requests, the share of input read from the prompt cache, the compactions (summaries / slides) and the seconds they took, and the files read again. Made again from `results/*/run.json` by each run (`bun bench/run.ts --history`).

| when | task | model | window | arm | tokendoctor | runs | solved | pass (median, min) | wall s | cost $ | requests | cache % | summaries / slides | compact s | re-reads |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| [2026-11-01 16:43](results/2026-11-01_1643-fixkit/summary.md) | fixkit | haiku-5-5 | 100K | stock | — | 1 | 1/1 | 238, 238 of 238 | 135.2 | 0.0389 | 14 | 84 | 1 / 0 | 15.6 | 0 |
| [2026-11-01 16:43](results/2026-11-01_1643-fixkit/summary.md) | fixkit | haiku-5-5 | 100K | slide | 0.4.1 f164c95-dirty, slide 25% | 1 | 1/1 | 238, 238 of 238 | 131.4 | 0.0369 | 19 | 87 | 0 / 1 | 0 | 0 |
| [2026-11-01 16:46](results/2026-11-01_1646-fixkit/summary.md) | fixkit | haiku-5-5 | 100K | stock | — | 5 | 5/5 | 238, 238 of 238 | 152 | 0.0459 | 17 | 86 | 1 / 0 | 17.1 | 0 |
| [2026-11-01 16:46](results/2026-11-01_1646-fixkit/summary.md) | fixkit | haiku-5-5 | 100K | slide | 0.4.1 f164c95-dirty, slide 25% | 5 | 5/5 | 238, 238 of 238 | 125.3 | 0.0350 | 15 | 84 | 0 / 1 | 0 | 0 |
| [2026-11-01 16:55](results/2026-11-01_1655-shopkit/summary.md) | shopkit | haiku-5-5 | each profile's own | factory | — | 1 | 1/1 | 69, 69 of 69 | 181.4 | 0.0276 | 8 | 86 | 0 / 0 | 0 | 0 |
| [2026-11-01 16:55](results/2026-11-01_1655-shopkit/summary.md) | shopkit | haiku-5-5 | each profile's own | advised | 0.4.1 f164c95-dirty | 1 | 1/1 | 69, 69 of 69 | 160.4 | 0.0327 | 7 | 83 | 0 / 0 | 0 | 0 |
| [2026-11-01 16:55](results/2026-11-01_1655-shopkit/summary.md) | shopkit | haiku-5-5 | each profile's own | advised+slide | 0.4.1 f164c95-dirty, slide 25% | 1 | 1/1 | 69, 69 of 69 | 111 | 0.0229 | 6 | 80 | 0 / 0 | 0 | 0 |
| [2026-11-01 16:58](results/2026-11-01_1658-workday/summary.md) | workday | haiku-5-5 | each profile's own | factory | — | 1 | 1/1 | 307, 307 of 307 | 997.3 | 0.6252 | 30 | 94 | 0 / 0 | 0 | 0 |
| [2026-11-01 16:58](results/2026-11-01_1658-workday/summary.md) | workday | haiku-5-5 | each profile's own | advised | 0.4.1 f164c95-dirty | 1 | 1/1 | 307, 307 of 307 | 797.3 | 0.6563 | 34 | 95 | 0 / 0 | 0 | 0 |
| [2026-11-01 16:58](results/2026-11-01_1658-workday/summary.md) | workday | haiku-5-5 | each profile's own | advised+slide | 0.4.1 f164c95-dirty, slide 25% | 1 | 1/1 | 307, 307 of 307 | 716.4 | 0.6261 | 28 | 94 | 0 / 0 | 0 | 0 |
| [2026-11-01 17:15](results/2026-11-01_1715-fixkit/summary.md) | fixkit | haiku-5-5 | 100K | factory | — | 5 | 5/5 | 238, 238 of 238 | 153.7 | 0.0373 | 16 | 87 | 1 / 0 | 15.8 | 1 |
| [2026-11-01 17:15](results/2026-11-01_1715-fixkit/summary.md) | fixkit | haiku-5-5 | 100K | factory+slide | 0.4.1 f164c95-dirty, slide 25% | 5 | 5/5 | 238, 238 of 238 | 128.2 | 0.0394 | 16 | 85 | 0 / 1 | 0 | 0 |
| [2026-11-01 17:25](results/2026-11-01_1725-evalkit/summary.md) | evalkit | haiku-5-5 | 100K | factory | — | 3 | 3/3 | 238, 238 of 238 | 728.8 | 0.1257 | 21 | 81 | 3 / 0 | 44.8 | 1 |
| [2026-11-01 17:25](results/2026-11-01_1725-evalkit/summary.md) | evalkit | haiku-5-5 | 100K | factory+slide | 0.4.1 f164c95-dirty, slide 25% | 1 | 1/1 | 238, 238 of 238 | 510.3 | 0.1011 | 21 | 77 | 0 / 4 | 0.1 | 3 |
| [2026-11-01 17:47](results/2026-11-01_1747-week/summary.md) | week | haiku-5-5 | each profile's own | factory | — | 1 | 1/1 | 307, 307 of 307 | 1032.7 | 1.5170 | 69 | 98 | 0 / 0 | 0 | 0 |
| [2026-11-01 17:47](results/2026-11-01_1747-week/summary.md) | week | haiku-5-5 | each profile's own | advised | 0.4.1 f164c95-dirty | 1 | 1/1 | 307, 307 of 307 | 1072.8 | 1.6987 | 91 | 98 | 1 / 0 | 30.1 | 27 |
| [2026-11-01 17:47](results/2026-11-01_1747-week/summary.md) | week | haiku-5-5 | each profile's own | advised+slide | 0.4.1 f164c95-dirty, slide 25% | 1 | 1/1 | 307, 307 of 307 | 978.6 | 1.3087 | 60 | 98 | 0 / 0 | 0 | 0 |
| [2026-11-01 17:50](results/2026-11-01_1750-workday/summary.md) | workday | haiku-5-5 | 100K | factory | — | 2 | 2/2 | 307, 307 of 307 | 1141.35 | 0.1861 | 38.5 | 86 | 4.5 / 0 | 119.75 | 0.5 |
| [2026-11-01 17:50](results/2026-11-01_1750-workday/summary.md) | workday | haiku-5-5 | 100K | factory+slide | 0.4.1 f164c95-dirty, slide 25% | 2 | 2/2 | 307, 307 of 307 | 777.15 | 0.1421 | 34 | 85.5 | 0 / 4 | 0.25 | 1.5 |
| [2026-11-01 18:19](results/2026-11-01_1819-week/summary.md) | week | haiku-5-5 | each profile's own | factory | — | 3 | 3/3 | 307, 307 of 307 | 1395 | 3.1782 | 120 | 99 | 0 / 0 | 0 | 24 |
| [2026-11-01 18:19](results/2026-11-01_1819-week/summary.md) | week | haiku-5-5 | each profile's own | advised | 0.4.1 f164c95-dirty | 3 | 3/3 | 307, 307 of 307 | 1623.6 | 2.8765 | 202 | 98 | 1 / 0 | 29.8 | 60 |
| [2026-11-01 18:19](results/2026-11-01_1819-week/summary.md) | week | haiku-5-5 | each profile's own | advised+slide | 0.4.1 f164c95-dirty, slide 25% | 3 | 3/3 | 307, 307 of 307 | 1380 | 2.5224 | 142 | 97 | 0 / 1 | 0 | 50 |
| [2026-11-01 19:37](results/2026-11-01_1937-evalkit/summary.md) | evalkit | haiku-5-5 | 100K | factory | — | 5 | 5/5 | 238, 238 of 238 | 655.8 | 0.1488 | 17 | 75 | 3 / 0 | 49.6 | 1 |
| [2026-11-01 19:37](results/2026-11-01_1937-evalkit/summary.md) | evalkit | haiku-5-5 | 100K | factory+slide | 0.4.1 f164c95-dirty, slide 25% | 5 | 5/5 | 238, 238 of 238 | 503.8 | 0.0946 | 22 | 82 | 0 / 3 | 0 | 0 |
| [2026-11-01 20:48](results/2026-11-01_2048-evalkit/summary.md) | evalkit | haiku-5-5 | 100K | factory+slide | 0.4.1 f164c95-dirty, slide 25% | 3 | 3/3 | 238, 238 of 238 | 612.7 | 0.1169 | 19 | 78 | 1 / 2 | 18 | 0 |
| [2026-11-01 21:04](results/2026-11-01_2104-evalkit/summary.md) | evalkit | haiku-5-5 | 100K | factory+slide | 0.4.1 f164c95-dirty, slide 25% | 3 | 3/3 | 238, 238 of 238 | 671.1 | 0.1253 | 22 | 76 | 3 / 1 | 52 | 0 |
| [2026-11-01 21:33](results/2026-11-01_2133-evalkit/summary.md) | evalkit | haiku-5-5 | 100K | factory+slide | 0.4.1 f164c95-dirty, slide 25% | 1 | 1/1 | 238, 238 of 238 | 429.7 | 0.0750 | 16 | 82 | 1 / 1 | 16.4 | 1 |
| [2026-11-01 21:57](results/2026-11-01_2157-evalkit/summary.md) | evalkit | haiku-5-5 | 100K | factory+slide | 0.4.1 f164c95-dirty, slide 25% | 3 | 3/3 | 238, 238 of 238 | 472 | 0.0960 | 17 | 75 | 0 / 3 | 0 | 2 |
| [2026-11-01 22:07](results/2026-11-01_2207-workday/summary.md) | workday | haiku-5-5 | 100K | factory+slide | 0.4.1 f164c95-dirty, slide 25% | 2 | 2/2 | 307, 307 of 307 | 762.5 | 0.1509 | 42.5 | 86 | 0 / 5 | 0.05 | 0 |
| [2026-11-01 22:32](results/2026-11-01_2232-week/summary.md) | week | haiku-5-5 | each profile's own | advised+slide | 0.4.1 f164c95-dirty, slide 25% | 2 | 2/2 | 307, 307 of 307 | 1548.65 | 2.8244 | 153.5 | 98 | 0 / 1 | 0 | 0 |
| [2026-11-03 22:14](results/2026-11-03_2214-workday/summary.md) | workday | haiku-5-5 | 100K | factory+slide+reads | 0.4.1 f416dd5-dirty, slide 25%, reads | 2 | 2/2 | 307, 307 of 307 | 905.65 | 0.1868 | 51 | 88 | 0 / 5.5 | 0.1 | 6 |
| [2026-11-03 22:33](results/2026-11-03_2233-workday/summary.md) | workday | haiku-5-5 | 100K | factory+slide | 0.4.1 f416dd5-dirty, slide 25% | 2 | 2/2 | 307, 307 of 307 | 814.45 | 0.1583 | 45.5 | 88 | 0.5 / 4 | 11.55 | 0 |
