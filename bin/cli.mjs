#!/usr/bin/env node
// ld-experiment-visitors: send realistic synthetic visitors to your own site.

import { loadJourney } from '../src/journey.mjs';
import { launchBrowser } from '../src/browser.mjs';
import { runVisitor } from '../src/visitor.mjs';
import { runInit } from '../src/init.mjs';

const HELP = `
ld-experiment-visitors  -  real browser visitors for your LaunchDarkly experiment

Usage:
  npx -y github:ld-glynn/ld-experiment-visitors init [journey.json]
      Answer a few questions and write the journey file.

  npx -y github:ld-glynn/ld-experiment-visitors <journey.json | b64:...> [options]
      Send visitors described by the journey file.

Options:
  --once            Send a single visitor and report what happened (a quick check)
  --headed          Show the browser window so you can watch visitors
  --minutes <n>     Run for n minutes (0 = until you press Ctrl-C); overrides the journey
  --rate <n>        Visitors per hour; overrides the journey
  --concurrency <n> Visitors in flight at once (1-8); overrides the journey
  --help            This text

The journey file describes your staging URL, how a visitor converts (click a
selector or reach a page, with probabilities), and how many visitors arrive.
Run \`init\` to create one, or copy journey.example.json.
`;

function parseArgs(argv) {
  const opts = { once: false, headed: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--once') opts.once = true;
    else if (a === '--headed') opts.headed = true;
    else if (a === '--help' || a === '-h') opts.help = true;
    else if (a === '--minutes') opts.minutes = Number(argv[++i]);
    else if (a === '--rate') opts.rate = Number(argv[++i]);
    else if (a === '--concurrency') opts.concurrency = Number(argv[++i]);
    else if (a.startsWith('--')) throw new Error(`Unknown option ${a}`);
    else rest.push(a);
  }
  return { opts, source: rest[0] };
}

const ts = () => new Date().toTimeString().slice(0, 8);
const info = s => console.log(`${ts()}  ${s}`);
const sleep = ms => new Promise(r => setTimeout(r, ms));

function describe(r, n) {
  const conv = r.converted.length ? `converted (${r.converted.join(', ')})` : 'left without converting';
  const ld = r.ldRequests ? `LD sdk: ${r.ldRequests} requests, ${r.ldEventPosts} event posts` : 'LD sdk: no browser traffic seen';
  return r.ok ? `visitor #${n} ${r.device} · ${conv} · ${ld}` : `visitor #${n} ${r.device} · FAILED: ${r.error}`;
}

async function main() {
  const { opts, source } = parseArgs(process.argv.slice(2));
  if (opts.help || !source) {
    console.log(HELP);
    process.exit(opts.help ? 0 : 1);
  }
  if (source === 'init') {
    await runInit(process.argv.slice(2)[1] || 'journey.json');
    return;
  }

  const journey = await loadJourney(source);
  if (opts.minutes !== undefined && !Number.isNaN(opts.minutes)) journey.durationMinutes = opts.minutes;
  if (opts.rate) journey.visitorsPerHour = opts.rate;
  if (opts.concurrency) journey.concurrency = Math.min(Math.max(opts.concurrency, 1), 8);

  info(`journey "${journey.name}" → ${journey.url}`);
  info(
    `${journey.actions.length} conversion action(s): ` +
      (journey.actions.map(a => `${a.type} ${a.selector || a.url} @ ${(a.probability * 100).toFixed(1)}%`).join('; ') || 'none (page views only)'),
  );

  const { browser, channel } = await launchBrowser({ headed: opts.headed });
  info(`browser: ${channel}${opts.headed ? ' (visible)' : ''}`);

  // ---- Preflight: one visitor that performs every action, so problems show up before the run.
  info('preflight: loading the page and trying every action once…');
  const pre = await runVisitor(browser, journey, { preflight: true });
  if (!pre.ok) {
    console.error(`\nPreflight failed: ${pre.error}\nCheck the URL is reachable from this machine (VPN? basic auth? protection bypass header?).`);
    await browser.close();
    process.exit(2);
  }
  info(`preflight: page loaded (HTTP ${pre.status}), ${pre.converted.length} action(s) worked`);
  if (pre.selectorMissing.length) {
    console.error(`\nThese actions did not work on the page: ${pre.selectorMissing.join(', ')}`);
    console.error('Fix the selector/URL in the journey (or drop the action) and run again.');
    await browser.close();
    process.exit(3);
  }
  if (pre.ldRequests === 0) {
    info('note: no LaunchDarkly browser-SDK traffic was seen. Fine if your site evaluates flags on the server; otherwise check the SDK is loading.');
  } else {
    info(`LaunchDarkly browser SDK detected (${pre.ldRequests} requests, ${pre.ldEventPosts} event posts).`);
  }

  if (opts.once) {
    await browser.close();
    info('done (--once).');
    return;
  }

  // ---- The run: Poisson-ish arrivals at visitorsPerHour, up to `concurrency` visitors in flight.
  const meanGapMs = 3_600_000 / journey.visitorsPerHour;
  const endAt = journey.durationMinutes > 0 ? Date.now() + journey.durationMinutes * 60_000 : Infinity;
  info(
    `sending ~${journey.visitorsPerHour} visitors/hour` +
      (journey.durationMinutes > 0 ? ` for ${journey.durationMinutes} min` : ' until Ctrl-C') +
      ` (up to ${journey.concurrency} at once). Press Ctrl-C to stop.`,
  );

  const totals = { visitors: 0, ok: 0, failed: 0, conversions: {}, ldEventPosts: 0 };
  let stopping = false;
  let inFlight = 0;
  let n = 0;

  const finish = async () => {
    if (stopping) return;
    stopping = true;
    info('stopping… waiting for visitors in flight to finish');
    while (inFlight > 0) await sleep(250);
    await browser.close().catch(() => {});
    console.log('\nSummary');
    console.log(`  visitors: ${totals.visitors} (${totals.ok} completed, ${totals.failed} failed)`);
    for (const [k, v] of Object.entries(totals.conversions)) {
      console.log(`  ${k}: ${v} (${totals.ok ? ((100 * v) / totals.ok).toFixed(1) : 0}% of completed visitors)`);
    }
    console.log(`  LaunchDarkly event posts observed: ${totals.ldEventPosts}`);
    console.log('\nResults appear in LaunchDarkly a few minutes after the events arrive.');
    process.exit(0);
  };
  process.on('SIGINT', finish);
  process.on('SIGTERM', finish);

  while (!stopping && Date.now() < endAt) {
    // Exponential inter-arrival: bursts and lulls, like people.
    const gap = -Math.log(1 - Math.random()) * meanGapMs;
    await sleep(Math.min(gap, 120_000));
    if (stopping) break;
    while (inFlight >= journey.concurrency && !stopping) await sleep(200);
    if (stopping) break;

    const id = ++n;
    inFlight++;
    runVisitor(browser, journey)
      .then(r => {
        totals.visitors++;
        if (r.ok) totals.ok++;
        else totals.failed++;
        for (const c of r.converted) totals.conversions[c] = (totals.conversions[c] ?? 0) + 1;
        totals.ldEventPosts += r.ldEventPosts;
        info(describe(r, id));
      })
      .catch(e => {
        totals.visitors++;
        totals.failed++;
        info(`visitor #${id} · FAILED: ${e.message}`);
      })
      .finally(() => {
        inFlight--;
      });
  }
  await finish();
}

main().catch(e => {
  console.error(`\n${e.message}`);
  process.exit(1);
});
