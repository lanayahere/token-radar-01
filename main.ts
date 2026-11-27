// Token launch radar — the entry point.
//
// Reads the sealed snapshot, scores every pre-token protocol with the model
// in lib/model.ts, and writes the ranked board, the dashboard's data, the
// dashboard itself and its dossier. Node 22, standard library only; no
// network at any point.
//
//   node main.ts [--input <snapshot.json|directory>] [--output <directory>]
//
// The input defaults to /input/snapshot.json, the output to $MAKEFUN_OUTPUT_DIR
// or /output. Locally that is:
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>

import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { boardIssue, buildRadar, dataScript, parseSnapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

// The dossier's text cap, in bytes: the judge reads the dashboard's source
// through it, so the page must fit inside it whole.
const DOSSIER_TEXT_MAX_BYTES = 65536;

// One --name <value> out of the arguments, or the fallback when absent.
function option(name: string, fallback: string): string {
  const at = process.argv.indexOf(`--${name}`);
  if (at >= 0 && at + 1 < process.argv.length) return process.argv[at + 1]!;
  const glued = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  if (glued !== undefined) return glued.slice(name.length + 3);
  return fallback;
}

// The snapshot lives at <input>/snapshot.json when --input names a directory,
// or at the file itself when it names one.
function snapshotPath(input: string): string {
  if (existsSync(input) && statSync(input).isDirectory()) {
    return join(input, "snapshot.json");
  }
  return input;
}

// Copy a directory whole into another, skipping names that start with a dot
// and anything that is not a regular file or a directory.
function copyTree(from: string, to: string): void {
  if (!existsSync(from)) return;
  mkdirSync(to, { recursive: true });
  for (const entry of readdirSync(from)) {
    if (entry.startsWith(".")) continue;
    const source = join(from, entry);
    const target = join(to, entry);
    const info = statSync(source);
    if (info.isDirectory()) copyTree(source, target);
    else if (info.isFile()) copyFileSync(source, target);
  }
}

function fail(message: string): never {
  process.stderr.write(`token radar: ${message}\n`);
  process.exit(1);
}

const here = fileURLToPath(new URL(".", import.meta.url));
const input = snapshotPath(option("input", "/input"));
const outDir = resolve(
  option("output", process.env.MAKEFUN_OUTPUT_DIR ?? "/output"),
);

if (!existsSync(input)) {
  fail(
    `no snapshot at ${input}: pass --input <snapshot.json|directory> or mount the sealed /input`,
  );
}

const snapshot = parseSnapshot(readFileSync(input, "utf8"));
const radar = buildRadar(snapshot);
const issue = boardIssue(radar.board, snapshot);
if (issue !== null) {
  fail(`the model wrote a board the gate refuses: ${issue}`);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "board.json"), `${JSON.stringify({ rows: radar.board })}\n`);
writeFileSync(join(outDir, "data.js"), dataScript(radar));
copyTree(join(here, "dashboard"), join(outDir, "dashboard"));
copyTree(join(here, "screenshots"), join(outDir, "screenshots"));
writeFileSync(
  join(outDir, "dossier.json"),
  buildDossier(outDir, { text_max_bytes: DOSSIER_TEXT_MAX_BYTES }),
);

process.stdout.write(
  `token radar: wrote ${radar.boardSize} rows ` +
    `(${radar.watchlistSize} watchlist, ${radar.earlySize} below the floor) ` +
    `and ${radar.liveSize} live-token rows to ${outDir}\n`,
);
