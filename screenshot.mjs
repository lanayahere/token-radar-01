// Take the three competition screenshots of the built dashboard with the sandboxed Chromium.
// Usage: node screenshot.mjs <out-dir>   (out-dir holds dashboard/index.html + data.js)
// Screenshots: 1-board.png (board), 2-detail.png (detail dialog of rank 1), 3-filtered.png (Lending filter).
import { chromium } from '/opt/muse/assets/spaces/ts-runtime/dist/node_modules/playwright/index.mjs';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';

const outDir = path.resolve(process.argv[2] ?? '/home/hatch/workspace/makefun/token-radar-01/out');
const policyPath = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const policy = fs.readFileSync(policyPath);

const browser = await chromium.launch({
  headless: true,
  executablePath: '/opt/hatch/bin/hatch-chromium-sandbox',
  chromiumSandbox: true,
  args: [
    '--disable-sync',
    '--disable-domain-reliability',
    '--disable-component-update',
    '--disable-http2',
    '--disable-quic',
    '--webrtc-ip-handling-policy=disable_non_proxied_udp',
    '--force-webrtc-ip-handling-policy',
    '--disable-features=AcceptCHFrame,AvoidUnnecessaryBeforeUnloadCheckSync,DestroyProfileOnBrowserClose,DialMediaRouteProvider,GlobalMediaControls,HttpsUpgrades,LensOverlay,MediaRouter,PaintHolding,ThirdPartyStoragePartitioning,Translate,AutoDeElevate,OptimizationHints,OptimizationGuideModelDownloading,AutofillServerCommunication,HatchFortress',
    `--hatch-webgl-allowed-domains-file=${policyPath}`,
    `--hatch-webgl-allowed-domains-sha256=${crypto.createHash('sha256').update(policy).digest('hex')}`,
    `--hatch-sandbox-read=${outDir}`,
  ],
});

const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const errors = [];

const base = 'file://' + path.join(outDir, 'dashboard/index.html');
const shots = [
  ['1-board.png', base],
  ['2-detail.png', base + '#p=steakhouse-financial'],
  ['3-filtered.png', base + '#category=Lending'],
];
for (const [name, url] of shots) {
  // A fresh page per shot: same-document hash navigation would not reload the app, so the
  // hash the shot needs would never be read.
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(name + ' pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(name + ' console: ' + m.text()); });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForTimeout(800);
  const info = await page.evaluate(() => ({
    rows: document.querySelectorAll('tbody tr').length,
    dialog: !!document.querySelector('dialog[open]'),
    title: document.querySelector('dialog[open] h2') ? document.querySelector('dialog[open] h2').textContent : null,
    count: document.querySelector('.count') ? document.querySelector('.count').textContent : null,
  }));
  await page.screenshot({ path: path.join(outDir, 'screenshots', name) });
  console.log(name, JSON.stringify(info), 'bytes:', fs.statSync(path.join(outDir, 'screenshots', name)).size);
  await page.close();
}
console.log('errors:', errors.length ? errors : 'none');
await browser.close();
