# token-radar-01

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/lanayahere/token-radar-01/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/lanayahere/token-radar-01/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

A token launch radar over a single sealed DeFiLlama snapshot (758 protocols, 2026-11-14): 226 pre-token protocols ranked by implied value, risk-adjusted by a bug-bounty-style threat model (chain concentration, TVL distress, youth/unknown age, and bridged/staked/wrapped lookalikes). Each row carries a 7-step farm plan, and the offline dashboard lets a reader browse, filter, and recompute every number from the snapshot.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=k5sns8aa&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>

---

# Token Launch Radar — make.fun `token-radar-01`

A token launch radar: the pre-token protocols with the most implied value, ranked by one
function of a single DeFiLlama snapshot, with a farm plan for each and a dashboard to browse
them. Built for the make.fun competition **token-radar-01** ("Build the best token launch
radar"), deadline 2026-12-14T10:00:00Z.

## Scope gate (how this entry was scoped, bug-bounty style)

- **Program:** make.fun competition `token-radar-01`. Primary source: the competition kit at
  `https://make.fun/c/token-radar-01/kit` (`RULES.txt`, `competition.yaml`, `input/snapshot.json`).
- **Asset in scope:** the snapshot file only — 758 protocols as of 2026-11-14, watchlist 40
  (TVL ≥ $50,000,000, no token recorded, not wrapped/staked/bridged, not Bridge/Canonical
  Bridge/Liquid Staking/Liquid Restaking/Restaked BTC/CEX, name not versioned and carrying no
  whole word wrapped/staked/staking, not beginning with an exchange name).
- **Out of scope:** live networks, live prices, any site other than the kit. The program makes
  no network calls at runtime; it reads `/input/snapshot.json` and writes `/output`.
- **Language rule:** a protocol is said to **record no token**, never to "have no token".
  The snapshot is a record, not proof — a protocol may still have a token the record does not
  carry, and the dashboard says so in every detail view.

## What it does

`main.ts` (Node 22, standard library only) reads the snapshot and writes:

- `board.json` — the ranked board: 40 watchlist protocols + every rankable pre-token
  protocol below the floor (186), **226 rows**, ranked by implied value, rank 1..226.
- `data.js` — the same board for the dashboard, plus the live-token set (416 protocols
  whose token already trades, shown with market cap, never mixed into the ranked board).
- `dashboard/` — search, category and risk filters, watchlist-only toggle, Pre-token /
  Live token tabs, sortable columns, a detail view per protocol that recomputes its implied
  value from the snapshot figures and says when it differs from the board.
- `dossier.json` — `buildDossier('/output', { text_max_bytes: 65536 })` from
  `vendor/makefun-board.ts`, byte-for-byte.

## The model (radar-2)

```
implied = round( tvl_usd × 0.25
               × (1 + clamp(change_7d, -60, 120) / 100 × 0.5)
               × (0.6 + min(age_days, 1095) / 1095 × 0.4)
               × risk )
```

- **Base:** TVL × 0.25 — the house multiple for what a launch could be worth.
- **Growth:** 7-day TVL change, clamped to −60%..+120%, half weight — momentum, not a
  straight line.
- **Maturity:** age since first listing, up to 3 years — how long it has run with no token.
  Unknown age uses 365 days.
- **Risk:** the threat model below. No protocol name is ever special-cased; the same
  function scores every row, and `lib/model.ts` is the single source of truth — the
  dashboard recomputes each row from the same figures.

## Threat model: what can make a launch worth less

Four risk factors, each a multiplier on implied value and a deduction from a 0–100 risk
score (Low ≥ 80, Medium 60–79, High < 60). Every row carries `risk_score`, `risk_band`
and `risk_flags`, so a reader can check the deduction against the row's own fields.

| Factor | Rule | Multiplier | Score |
| --- | --- | --- | --- |
| Chain concentration | 1 chain / 2 chains | 0.92 / 0.97 | −8 / −3 |
| TVL distress | 7d change < −20% / < −40% | 0.85 / 0.70 | −15 / −30 |
| Youth / unknown age | age < 90 days / age not reported | 0.88 / 0.90 | −12 / −10 |
| Lookalike | Bridge / Liquid Staking / Liquid Restaking / Restaked BTC / name has whole word wrapped, staked or staking | 0.50 | −25 |
| Missing growth | 7-day change not reported | — | −5 |

Why each: value on one chain is a single point of failure; a sharp 7-day fall is outflow,
not noise; a young protocol is unproven and an unknown age is unverifiable; a bridged,
staked or wrapped product of a token that already trades is not a fresh launch — it is
discounted and flagged, never hidden, because it still records no token.

Snapshot facts the model was tested against: 342 of 758 protocols record no token; 16 of
the 40 watchlist protocols sit on a single chain; 4 watchlist protocols are under 90 days
old; 1 watchlist protocol fell more than 20% in 7 days; 48 of the 186 rankable protocols
below the floor are lookalikes, discounted to the bottom of the board rather than excluded.

## Farm plans

Seven steps per row, each with a cost and a time, derived from the protocol's own record
(category, chains, TVL, age): a fresh wallet, a first deposit with a cap, the
category-specific action, a second deposit, claiming only from the protocol's own
published link (never a DM link, never paying anyone to claim), a farm log, and an exit
that unwinds in small steps and revokes approvals no longer needed.

## Build and grade

```sh
# Run the program (writes out/ with board.json, data.js, dashboard/, dossier.json)
node --experimental-strip-types main.ts

# Grade locally (from the kit directory, process driver — no Docker on this machine)
NODE_USE_ENV_PROXY=1 node cli/makefun.mjs grade-local --kit . \
  --bot /home/hatch/workspace/makefun/token-radar-01 --driver process
```

Screenshots (`screenshots/1-board.png`, `2-detail.png`, `3-filtered.png`, 1440×900) are
taken from the built dashboard in headless Chromium by `screenshot.mjs` (Playwright with
the VM's sandboxed Chromium at `/opt/meta-chromium/chrome`; direct Chrome refuses to start
without the Hatch WebGL domain policy, so the script passes it via the sandbox launcher).
`out/` is the program's own output directory, kept here as the evidence of the local run;
the grader re-runs `main.ts` and rebuilds it.

## What this entry does not do

- No network calls at runtime, no live prices, no invented data. Every number traces to
  a snapshot field.
- No claim that a protocol "has no token" — only that its snapshot entry records none.
- No financial advice: implied value is an estimate from TVL, growth, age and risk, not a
  price.

## License

MIT — see `LICENSE`.
