// Token launch radar, model radar-2.
//
// One function of a single sealed DeFiLlama snapshot scores every pre-token
// protocol: what its launch could be worth, how risky that claim is, and what
// a reader should do to farm it. No protocol name is ever special-cased; the
// same arithmetic scores every row, and this file is the single source of
// truth — the dashboard recomputes each row from the same figures.
//
// Implied value:
//   tvl * 0.25
//     * (1 + clamped 7-day growth, half weight)
//     * maturity (0.6 + up to 0.4 for age to 3 years)
//     * risk (the threat model's multipliers)
//
// A protocol records no token when its snapshot entry carries no gecko id and
// no symbol. That is a record, not proof — it may still have a token the
// record does not carry.

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface ModelBreakdown {
  base_multiple: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  age_days: number | null;
  risk_multiplier: number;
  chain_multiplier: number;
  distress_multiplier: number;
  youth_multiplier: number;
  lookalike_multiplier: number;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: string;
  age_days: number | null;
  implied_value_usd: number;
  risk_score: number;
  risk_band: string;
  risk_flags: string[];
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface ModelParams {
  base_multiple: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  unknown_age_days: number;
}

export interface RadarResult {
  board: BoardRow[];
  live: LiveRow[];
  asOf: string;
  source: string;
  floorUsd: number;
  watchlist: string[];
  modelVersion: string;
  watchlistSize: number;
  boardSize: number;
  earlySize: number;
  liveSize: number;
  modelParams: ModelParams;
}

// The model's constants, in one place so the dashboard can quote them.
export const MODEL_PARAMS: ModelParams = {
  base_multiple: 0.25,
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.6,
  maturity_range: 0.4,
  maturity_days: 1095,
  unknown_age_days: 365,
};

export const MODEL_VERSION = "radar-2";

// Categories that mark a bridged, staked or wrapped product of a token that
// already trades. Such a product is discounted and flagged, never hidden:
// it still records no token.
const LOOKALIKE_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
]);

// A name carrying a whole word wrapped, staked or staking is a lookalike too.
const LOOKALIKE_NAME = /\b(wrapped|staked|staking)\b/i;

// A name ending in a version marker: a space, then V2, v2, V12, 2.0 or the
// like. A bare number on its own ("Project 0") is not a version marker.
const VERSION_MARKER = /\s([Vv]\d+|\d+\.\d+)$/;

// The exchanges whose name at the start of a protocol name marks a
// house product, not a farmable launch.
const EXCHANGE_PREFIXES = [
  "Binance",
  "Coinbase",
  "Bybit",
  "Kraken",
  "Bitget",
  "OKX",
  "Bitfinex",
  "Gemini",
];

function clamp(value: number, low: number, high: number): number {
  return Math.max(low, Math.min(high, value));
}

// Four decimals, the precision the board's model block carries.
function round4(value: number): number {
  return Math.round(value * 10000) / 10000;
}

// Whole days from a listed date to the snapshot's date. Null when the
// snapshot reports no first-listed date.
export function ageInDays(protocol: SnapshotProtocol, asOf: string): number | null {
  if (protocol.listed_at === null) return null;
  const listed = Date.parse(`${protocol.listed_at}T00:00:00Z`);
  const taken = Date.parse(`${asOf}T00:00:00Z`);
  if (Number.isNaN(listed) || Number.isNaN(taken)) return null;
  return Math.floor((taken - listed) / 86400000);
}

export function recordsNoToken(protocol: SnapshotProtocol): boolean {
  return protocol.gecko_id === null && protocol.symbol === null;
}

export function isLookalike(protocol: SnapshotProtocol): boolean {
  if (protocol.category !== null && LOOKALIKE_CATEGORIES.has(protocol.category)) {
    return true;
  }
  return LOOKALIKE_NAME.test(protocol.name);
}

function isVersioned(name: string): boolean {
  return VERSION_MARKER.test(name);
}

function beginsWithExchange(name: string): boolean {
  return EXCHANGE_PREFIXES.some((prefix) => name.startsWith(prefix));
}

// The watchlist's own rule, as the snapshot's field guide states it: at or
// above the floor, no token recorded, and not a wrapped, staked or bridged
// product of a token that already trades.
export function onWatchlistRule(protocol: SnapshotProtocol, floorUsd: number): boolean {
  if (protocol.tvl_usd < floorUsd) return false;
  if (!recordsNoToken(protocol)) return false;
  if (protocol.category !== null && LOOKALIKE_CATEGORIES.has(protocol.category)) return false;
  if (protocol.category === "CEX") return false;
  if (isVersioned(protocol.name)) return false;
  if (LOOKALIKE_NAME.test(protocol.name)) return false;
  if (beginsWithExchange(protocol.name)) return false;
  return true;
}

// Whether a protocol belongs on the board at all. The watchlist is the floor,
// never the ceiling: a pre-token protocol below it still ranks, unless it is
// a centralised exchange or a versioned copy of another protocol.
export function rankable(
  protocol: SnapshotProtocol,
  watchlist: Set<string>,
  floorUsd: number,
): boolean {
  if (!recordsNoToken(protocol)) return false;
  if (watchlist.has(protocol.slug)) return true;
  if (protocol.tvl_usd >= floorUsd) return false;
  if (protocol.category === "CEX") return false;
  if (isVersioned(protocol.name)) return false;
  return true;
}

// The threat model: four ways a launch can be worth less than its TVL
// suggests, each a multiplier on implied value and a deduction from a 0-100
// risk score. The flags are pushed in a fixed order — chain, age, distress,
// missing growth, youth, lookalike — so a row reads the same way every time.
export interface RiskAssessment {
  riskMultiplier: number;
  chainMultiplier: number;
  distressMultiplier: number;
  youthMultiplier: number;
  lookalikeMultiplier: number;
  score: number;
  band: string;
  flags: string[];
}

export function assessRisk(
  protocol: SnapshotProtocol,
  ageDays: number | null,
): RiskAssessment {
  const chainCount = protocol.chains.length;
  const chainMultiplier =
    chainCount === 1 ? 0.92 : chainCount === 2 ? 0.97 : 1;
  const growth = protocol.change_7d;
  const distressMultiplier =
    growth !== null && growth < -40 ? 0.7 : growth !== null && growth < -20 ? 0.85 : 1;
  const youthMultiplier =
    ageDays !== null && ageDays < 90 ? 0.88 : ageDays === null ? 0.9 : 1;
  const lookalikeMultiplier = isLookalike(protocol) ? 0.5 : 1;
  const riskMultiplier =
    chainMultiplier * distressMultiplier * youthMultiplier * lookalikeMultiplier;

  let score = 100;
  if (chainCount === 1) score -= 8;
  else if (chainCount === 2) score -= 3;
  if (growth !== null && growth < -40) score -= 30;
  else if (growth !== null && growth < -20) score -= 15;
  if (ageDays !== null && ageDays < 90) score -= 12;
  else if (ageDays === null) score -= 10;
  if (lookalikeMultiplier === 0.5) score -= 25;
  if (growth === null) score -= 5;
  score = Math.max(0, score);

  const band = score >= 80 ? "Low" : score >= 60 ? "Medium" : "High";

  const flags: string[] = [];
  if (chainCount === 1) flags.push("Single-chain: value sits on one chain");
  else if (chainCount === 2) flags.push("Two chains only");
  if (ageDays === null) {
    flags.push("Age unknown: first-listed date not reported");
  }
  if (growth !== null && growth < -40) {
    flags.push("TVL falling fast (7d under -40%)");
  } else if (growth !== null && growth < -20) {
    flags.push("TVL falling (7d under -20%)");
  }
  if (growth === null) flags.push("No 7-day growth reported");
  if (ageDays !== null && ageDays < 90) {
    flags.push("Young: listed under 90 days ago");
  }
  if (lookalikeMultiplier === 0.5) {
    flags.push(
      "Lookalike: bridged, staked or wrapped product of a token that already trades",
    );
  }

  return {
    riskMultiplier,
    chainMultiplier,
    distressMultiplier,
    youthMultiplier,
    lookalikeMultiplier,
    score,
    band,
    flags,
  };
}

// The first deposit for a farm, in dollars, by how much value the protocol
// already holds. A small protocol gets a small first step; a large one can
// take a larger one without the deposit itself moving anything.
function firstDeposit(tvlUsd: number): number {
  if (tvlUsd >= 250000000) return 250;
  if (tvlUsd >= 25000000) return 150;
  return 100;
}

// The week's qualifying action, by what the protocol is. Each one names a
// concrete thing to do on the protocol's own app, with its own cost and time.
function weeklyAction(
  category: string | null,
  name: string,
  chain: string,
): string {
  const tail = " Cost: about $2 of gas a week. Time: 10 minutes a week.";
  switch (category) {
    case "Lending":
      return (
        `Supply an asset to the ${name} lending market on ${chain}, then borrow ` +
        `a small amount against it so the position shows both sides of the market.` + tail
      );
    case "Dexs":
      return (
        `Provide liquidity to a ${name} pool on ${chain} in a pair you already ` +
        `hold, and keep the LP tokens instead of selling them at once.` + tail
      );
    case "Liquid Staking":
      return (
        `Stake through ${name} on ${chain} and hold the receipt token, then use ` +
        `it in one more protocol action a week so the stake is visibly active.` + tail
      );
    case "Bridge":
    case "Canonical Bridge":
      return (
        `Bridge a small amount into ${chain} through ${name} once a week, using ` +
        `the route the app itself suggests, and keep the bridged funds working there.` + tail
      );
    case "Yield":
    case "Yield Aggregator":
      return (
        `Deposit into a ${name} yield vault on ${chain} and let the position ` +
        `compound, topping it up when you do your weekly check-in.` + tail
      );
    case "Derivatives":
      return (
        `Open a small ${name} position on ${chain} with money you can afford to ` +
        `lose, and manage it weekly rather than leaving it untouched.` + tail
      );
    case "CDP":
      return (
        `Lock collateral in ${name} on ${chain} and mint a small amount against ` +
        `it, keeping the ratio well above the liquidation line.` + tail
      );
    case "Risk Curators":
      return (
        `Deposit into a ${name} curated vault on ${chain} and review its ` +
        `allocation each week, moving funds only when the curator's own guidance changes.` + tail
      );
    case "RWA":
      return (
        `Hold a ${name} real-world-asset position on ${chain} and add to it ` +
        `weekly, keeping the receipts in the same wallet as the rest of the farm.` + tail
      );
    case "Staking Pool":
      return (
        `Stake in the ${name} pool on ${chain} and keep the stake through at ` +
        `least one full reward cycle before touching it.` + tail
      );
    case "Liquid Restaking":
    case "Restaking":
      return (
        `Restake through ${name} on ${chain} and hold the restaking receipt, ` +
        `using it in one further action a week.` + tail
      );
    case "Restaked BTC":
    case "Anchor BTC":
    case "Decentralized BTC":
      return (
        `Hold a ${name} BTC position on ${chain} and use it in one protocol ` +
        `action a week so the position stays active.` + tail
      );
    case "Leveraged Farming":
      return (
        `Open a small leveraged farming position through ${name} on ${chain} and ` +
        `check its health weekly, topping up collateral before it gets close to liquidation.` + tail
      );
    case "Prediction Market":
      return (
        `Take a small position in a ${name} market on ${chain} each week and let ` +
        `it resolve, rather than betting everything on one outcome.` + tail
      );
    case "Chain":
      return (
        `Use ${name} on ${chain} once a week — send a transaction, try its main ` +
        `app, and keep the wallet active on the network.` + tail
      );
    case "Farm":
      return (
        `Deposit into the ${name} farm on ${chain} and harvest only when the ` +
        `rewards cover the gas, compounding the rest.` + tail
      );
    case "Indexes":
      return (
        `Buy into the ${name} index on ${chain} and add to it weekly, treating ` +
        `it as a standing position rather than a trade.` + tail
      );
    case "Basis Trading":
      return (
        `Hold a ${name} basis position on ${chain} and roll it weekly, keeping ` +
        `the hedge on while the farm runs.` + tail
      );
    case "Liquidity Manager":
      return (
        `Let ${name} manage a liquidity position for you on ${chain} and check ` +
        `its range weekly, rebalancing only when the app suggests it.` + tail
      );
    case "Onchain Capital Allocator":
      return (
        `Allocate capital through ${name} on ${chain} and review where it is ` +
        `deployed each week, moving it only when the allocator's own strategy changes.` + tail
      );
    case "CeDeFi":
      return (
        `Use the ${name} CeDeFi product on ${chain} once a week and keep the ` +
        `position in the same wallet as the rest of the farm.` + tail
      );
    case "Crypto Card Issuer":
      return (
        `Spend through the ${name} card on ${chain} once a week so the account ` +
        `shows regular use, and keep the balance topped up.` + tail
      );
    case "Dual-Token Stablecoin":
      return (
        `Hold both sides of the ${name} stablecoin system on ${chain} and ` +
        `rebalance weekly so neither side drifts far from target.` + tail
      );
    case "Uncollateralized Lending":
      return (
        `Take a small uncollateralized loan through ${name} on ${chain} only if ` +
        `you can repay it from funds you already hold, and repay on schedule.` + tail
      );
    case "Interest Rate Derivatives":
      return (
        `Hold a small ${name} rate position on ${chain} and adjust it weekly as ` +
        `rates move, keeping the size modest.` + tail
      );
    default:
      return (
        `Use ${name}'s main feature on ${chain} once a week — deposit, swap, vote ` +
        `or whatever the app itself asks of a regular user.` + tail
      );
  }
}

// Seven steps to farm one protocol: a fresh wallet, a first deposit with a
// cap, the category's own weekly action, a second deposit, claiming only from
// the protocol's own published page, a farm log, and an exit that unwinds in
// small steps and revokes approvals. Every step carries what it costs and how
// long it takes.
export function farmPlan(protocol: SnapshotProtocol): string[] {
  const chain =
    protocol.chains.length > 0 ? protocol.chains[0]! : "its home chain";
  const cap = firstDeposit(protocol.tvl_usd);
  return [
    `Open a brand-new wallet that you use only for farming ${protocol.name}, ` +
      `and write its recovery phrase on paper and keep it somewhere safe — never in a ` +
      `screenshot, a notes app, or a chat. Cost: under $3 of gas for the first transaction. ` +
      `Time: 5 minutes.`,
    `Move a first deposit of $${cap} into ${protocol.name} on ${chain} and leave ` +
      `the position alone for a few days so it counts as real use, not a drive-by. ` +
      `Cost: $${cap} of capital and about $8 of gas. Time: 15 minutes to set up.`,
    weeklyAction(protocol.category, protocol.name, chain),
    `A week later, add a second deposit of $${cap} on ${chain}, after the first ` +
      `one has settled, so your activity reads as steady use over time. ` +
      `Cost: $${cap} of capital and about $8 of gas. Time: 10 minutes.`,
    `If a claim opens, take it only from ${protocol.name}'s own published page, ` +
      `reached through its official account — never from a link in a DM, and never pay ` +
      `anyone to claim on your behalf. Cost: gas only. Time: 10 minutes.`,
    `Keep a short log of the farm: the date, amount, chain and transaction hash ` +
      `of every deposit, action and claim, so you can prove later what you did. ` +
      `Cost: free. Time: 2 minutes after each action.`,
    `When you are done, unwind in small steps over several days instead of all ` +
      `at once, then revoke every spending approval you no longer need. ` +
      `Cost: a few dollars of gas. Time: 20 minutes spread over a week.`,
  ];
}

// Score one protocol into a board row, without its rank: ranks are assigned
// after the whole board is sorted by implied value.
export function scoreRow(protocol: SnapshotProtocol, asOf: string): BoardRow {
  const ageDays = ageInDays(protocol, asOf);
  const effectiveAge = ageDays === null ? MODEL_PARAMS.unknown_age_days : ageDays;
  // The reported growth is the clamped one: a 4,448% week and a 161% week
  // both enter the model at the cap, and the board says so.
  const growthPct = clamp(
    protocol.change_7d === null ? 0 : protocol.change_7d,
    MODEL_PARAMS.growth_floor,
    MODEL_PARAMS.growth_cap,
  );
  const growthMultiplier =
    1 +
    (clamp(growthPct, MODEL_PARAMS.growth_floor, MODEL_PARAMS.growth_cap) / 100) *
      MODEL_PARAMS.growth_weight;
  const maturityMultiplier =
    MODEL_PARAMS.maturity_floor +
    (Math.min(effectiveAge, MODEL_PARAMS.maturity_days) / MODEL_PARAMS.maturity_days) *
      MODEL_PARAMS.maturity_range;
  const risk = assessRisk(protocol, ageDays);
  const impliedValue = Math.round(
    protocol.tvl_usd *
      MODEL_PARAMS.base_multiple *
      growthMultiplier *
      maturityMultiplier *
      risk.riskMultiplier,
  );

  return {
    rank: 0,
    slug: protocol.slug,
    name: protocol.name,
    category: protocol.category,
    chains: protocol.chains,
    tvl_usd: protocol.tvl_usd,
    change_7d: protocol.change_7d,
    mcap_usd: protocol.mcap_usd,
    listed_at: protocol.listed_at,
    gecko_id: protocol.gecko_id,
    symbol: protocol.symbol,
    token_status: "pre-token",
    age_days: ageDays,
    implied_value_usd: impliedValue,
    risk_score: risk.score,
    risk_band: risk.band,
    risk_flags: risk.flags,
    model: {
      base_multiple: MODEL_PARAMS.base_multiple,
      growth_pct: growthPct,
      growth_multiplier: round4(growthMultiplier),
      maturity_multiplier: round4(maturityMultiplier),
      age_days: ageDays,
      risk_multiplier: round4(risk.riskMultiplier),
      chain_multiplier: round4(risk.chainMultiplier),
      distress_multiplier: round4(risk.distressMultiplier),
      youth_multiplier: round4(risk.youthMultiplier),
      lookalike_multiplier: round4(risk.lookalikeMultiplier),
    },
    farm_steps: farmPlan(protocol),
  };
}

// The live-token set the dashboard shows beside the board: the 24 largest
// tokens by market cap that are not a centralised exchange's own, each with
// the fields the page needs and nothing more.
function liveSet(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter(
      (protocol) =>
        !recordsNoToken(protocol) &&
        protocol.mcap_usd !== null &&
        protocol.category !== "CEX",
    )
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24)
    .map((protocol) => ({
      slug: protocol.slug,
      name: protocol.name,
      category: protocol.category,
      chains: protocol.chains,
      tvl_usd: protocol.tvl_usd,
      mcap_usd: protocol.mcap_usd,
      change_7d: protocol.change_7d,
    }));
}

// Build the whole radar from one snapshot: the ranked board, the live-token
// set, and everything the dashboard's data file needs to describe them.
export function buildRadar(snapshot: Snapshot): RadarResult {
  const watchlist = new Set(snapshot.watchlist);
  const rows = snapshot.protocols
    .filter((protocol) => rankable(protocol, watchlist, snapshot.floor_usd))
    .map((protocol) => scoreRow(protocol, snapshot.as_of))
    .sort((a, b) => b.implied_value_usd - a.implied_value_usd);
  rows.forEach((row, index) => {
    row.rank = index + 1;
  });
  const live = liveSet(snapshot);
  const earlySize = rows.filter((row) => !watchlist.has(row.slug)).length;
  return {
    board: rows,
    live,
    asOf: snapshot.as_of,
    source: snapshot.source,
    floorUsd: snapshot.floor_usd,
    watchlist: snapshot.watchlist,
    modelVersion: MODEL_VERSION,
    watchlistSize: snapshot.watchlist.length,
    boardSize: rows.length,
    earlySize,
    liveSize: live.length,
    modelParams: MODEL_PARAMS,
  };
}

// Read a snapshot's JSON text into the shape the model expects, refusing
// anything that is not a snapshot at all.
export function parseSnapshot(text: string): Snapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("snapshot is not valid JSON");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("snapshot must be a JSON object");
  }
  const record = parsed as Record<string, unknown>;
  if (typeof record.as_of !== "string") throw new Error("snapshot has no as_of date");
  if (typeof record.source !== "string") throw new Error("snapshot has no source");
  if (typeof record.floor_usd !== "number") throw new Error("snapshot has no floor_usd");
  if (!Array.isArray(record.protocols)) throw new Error("snapshot has no protocols array");
  if (!Array.isArray(record.watchlist)) throw new Error("snapshot has no watchlist array");
  for (const entry of record.protocols as unknown[]) {
    if (typeof entry !== "object" || entry === null) {
      throw new Error("snapshot protocol is not an object");
    }
    const protocol = entry as Record<string, unknown>;
    if (typeof protocol.slug !== "string") throw new Error("snapshot protocol has no slug");
    if (typeof protocol.name !== "string") throw new Error("snapshot protocol has no name");
    if (typeof protocol.tvl_usd !== "number") {
      throw new Error(`snapshot protocol ${protocol.slug} has no tvl_usd`);
    }
    if (!Array.isArray(protocol.chains)) {
      throw new Error(`snapshot protocol ${protocol.slug} has no chains array`);
    }
  }
  return parsed as Snapshot;
}

// The gate's own shape, checked before anything is written: 100 to 4,000
// rows, ranks exactly 1..N, implied value never rising with rank, every
// watchlist slug covered, every farm plan 3 to 12 steps of 20 to 600
// characters. Returns the first problem found, or null when the board is
// sound.
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  if (!Array.isArray(board)) return "board is not an array";
  if (board.length < 100) return `board has ${board.length} rows, fewer than 100`;
  if (board.length > 4000) return `board has ${board.length} rows, more than 4000`;
  const seen = new Set<string>();
  const known = new Set(snapshot.protocols.map((protocol) => protocol.slug));
  for (let index = 0; index < board.length; index += 1) {
    const row = board[index]!;
    if (!known.has(row.slug)) return `row ${index + 1} names an unknown slug ${row.slug}`;
    if (seen.has(row.slug)) return `slug ${row.slug} appears twice`;
    seen.add(row.slug);
    if (row.rank !== index + 1) {
      return `row ${row.slug} has rank ${row.rank}, expected ${index + 1}`;
    }
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      return `row ${row.slug} has no positive whole implied value`;
    }
    if (index > 0 && row.implied_value_usd > board[index - 1]!.implied_value_usd) {
      return `implied value rises from rank ${index} to rank ${index + 1}`;
    }
    if (!Array.isArray(row.farm_steps) || row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      return `row ${row.slug} has ${row.farm_steps?.length ?? 0} farm steps, expected 3 to 12`;
    }
    for (const step of row.farm_steps) {
      const trimmed = typeof step === "string" ? step.trim() : "";
      if (trimmed.length < 20 || trimmed.length > 600) {
        return `row ${row.slug} has a farm step of ${trimmed.length} characters, expected 20 to 600`;
      }
    }
  }
  for (const slug of snapshot.watchlist) {
    if (!seen.has(slug)) return `watchlist slug ${slug} is missing from the board`;
  }
  return null;
}

// The dashboard's data file: the same board in the page's shape, beside the
// live-token set and the model's own parameters, as one script the page
// reads with no network.
export function dataScript(radar: RadarResult): string {
  const rows = radar.board.map((row) => ({
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    risk_multiplier: row.model.risk_multiplier,
    risk_score: row.risk_score,
    risk_band: row.risk_band,
    risk_flags: row.risk_flags,
  }));
  const payload = {
    as_of: radar.asOf,
    source: radar.source,
    floor_usd: radar.floorUsd,
    model: radar.modelParams,
    model_version: radar.modelVersion,
    watchlist_size: radar.watchlistSize,
    watchlist: radar.watchlist,
    board_size: radar.boardSize,
    early_size: radar.earlySize,
    live_size: radar.liveSize,
    rows,
    live: radar.live,
  };
  return `window.RADAR=${JSON.stringify(payload)};\n`;
}
