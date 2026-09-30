// Journey file: what a visitor does on the client's site, and how many of them arrive.
// Written by the Experiment Simulator web app, or by hand.

import { readFile } from 'node:fs/promises';

/**
 * @typedef {Object} Action
 * @property {'click'|'visit'} type
 * @property {string} [selector]   CSS selector to click (type: click)
 * @property {string} [url]        Path or absolute URL to visit (type: visit)
 * @property {number} probability  0-1, share of visitors who do this
 * @property {number} [waitAfterMs] pause after the action so the SDK can flush (default 2000)
 *
 * @typedef {Object} Journey
 * @property {number} version
 * @property {string} [name]
 * @property {string} url                     landing page
 * @property {Action[]} actions
 * @property {number} visitorsPerHour
 * @property {number} durationMinutes         0 = until stopped
 * @property {number} [concurrency]           visitors in flight at once (default 2)
 * @property {[number, number]} [dwellMs]     min/max time on the landing page before acting (default [2000, 8000])
 * @property {'desktop'|'mobile'|'mixed'} [devices]
 * @property {Record<string,string>} [headers] extra request headers (e.g. a protection-bypass header)
 * @property {{username:string,password:string}} [basicAuth]
 * @property {number} [notInExperimentShare]  ignored; reserved
 */

export async function loadJourney(source) {
  let raw;
  if (source.startsWith('b64:')) {
    raw = Buffer.from(source.slice(4), 'base64').toString('utf8');
  } else {
    raw = await readFile(source, 'utf8');
  }
  let j;
  try {
    j = JSON.parse(raw);
  } catch (e) {
    throw new Error(`Journey is not valid JSON: ${e.message}`);
  }
  return normalize(j);
}

export function normalize(j) {
  const problems = [];
  if (!j || typeof j !== 'object') throw new Error('Journey must be a JSON object.');
  if (!j.url || !/^https?:\/\//i.test(j.url)) problems.push('"url" must start with http:// or https://');
  const actions = Array.isArray(j.actions) ? j.actions : [];
  actions.forEach((a, i) => {
    if (a.type !== 'click' && a.type !== 'visit') problems.push(`actions[${i}].type must be "click" or "visit"`);
    if (a.type === 'click' && !a.selector) problems.push(`actions[${i}] needs a "selector"`);
    if (a.type === 'visit' && !a.url) problems.push(`actions[${i}] needs a "url"`);
    const p = Number(a.probability);
    if (!(p >= 0 && p <= 1)) problems.push(`actions[${i}].probability must be between 0 and 1`);
  });
  const vph = Number(j.visitorsPerHour);
  if (!(vph > 0 && vph <= 20000)) problems.push('"visitorsPerHour" must be between 1 and 20000');
  if (problems.length) throw new Error('Journey problems:\n  - ' + problems.join('\n  - '));

  return {
    version: 1,
    name: j.name || 'Unnamed journey',
    url: j.url,
    actions: actions.map(a => ({
      type: a.type,
      selector: a.selector,
      url: a.url,
      probability: Number(a.probability),
      waitAfterMs: Number(a.waitAfterMs) > 0 ? Number(a.waitAfterMs) : 2000,
    })),
    visitorsPerHour: vph,
    durationMinutes: Number(j.durationMinutes) >= 0 ? Number(j.durationMinutes) : 60,
    concurrency: Math.min(Math.max(Number(j.concurrency) || 2, 1), 8),
    dwellMs: Array.isArray(j.dwellMs) && j.dwellMs.length === 2 ? [Number(j.dwellMs[0]), Number(j.dwellMs[1])] : [2000, 8000],
    devices: ['desktop', 'mobile', 'mixed'].includes(j.devices) ? j.devices : 'mixed',
    headers: j.headers && typeof j.headers === 'object' ? j.headers : undefined,
    basicAuth: j.basicAuth && j.basicAuth.username ? j.basicAuth : undefined,
  };
}

export function resolveUrl(base, maybeRelative) {
  try {
    return new URL(maybeRelative, base).toString();
  } catch {
    return maybeRelative;
  }
}
