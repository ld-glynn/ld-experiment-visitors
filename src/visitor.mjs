// One synthetic visitor: open a fresh profile, load the page, dwell, maybe convert, leave.

import { visitorProfile } from './browser.mjs';
import { resolveUrl } from './journey.mjs';

const LD_HOSTS = /launchdarkly\.(com|us)/i;
const LD_EVENTS = /events\.(?:[a-z0-9-]+\.)?launchdarkly\.(com|us)/i;

const sleep = ms => new Promise(r => setTimeout(r, ms));
const between = ([lo, hi]) => lo + Math.random() * Math.max(0, hi - lo);

/**
 * @returns {Promise<{ok:boolean, device:string, status:number|null, converted:string[], ldRequests:number, ldEventPosts:number, error?:string, selectorMissing?:string[]}>}
 */
export async function runVisitor(browser, journey, { preflight = false, log = () => {} } = {}) {
  const profile = visitorProfile(journey);
  const context = await browser.newContext(profile.options);
  const result = { ok: false, device: profile.kind, status: null, converted: [], ldRequests: 0, ldEventPosts: 0, selectorMissing: [] };

  context.on('request', req => {
    const u = req.url();
    if (LD_HOSTS.test(u)) {
      result.ldRequests++;
      if (LD_EVENTS.test(u) && req.method() === 'POST') result.ldEventPosts++;
    }
  });

  const page = await context.newPage();
  try {
    const resp = await page.goto(journey.url, { waitUntil: 'load', timeout: 45000 });
    result.status = resp ? resp.status() : null;
    if (resp && resp.status() >= 400) throw new Error(`Landing page returned HTTP ${resp.status()}`);

    // Let the SDK initialise and the page settle, then behave like a person reading.
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await sleep(preflight ? 1500 : between(journey.dwellMs));

    for (const action of journey.actions) {
      if (action.type === 'click') {
        const locator = page.locator(action.selector).first();
        const count = await page.locator(action.selector).count();
        if (count === 0) {
          result.selectorMissing.push(action.selector);
          continue;
        }
        if (preflight || Math.random() < action.probability) {
          await locator.scrollIntoViewIfNeeded({ timeout: 5000 }).catch(() => {});
          await locator.click({ timeout: 10000 });
          result.converted.push(`click ${action.selector}`);
          await sleep(action.waitAfterMs);
        }
      } else if (action.type === 'visit') {
        if (preflight || Math.random() < action.probability) {
          const target = resolveUrl(journey.url, action.url);
          const r = await page.goto(target, { waitUntil: 'load', timeout: 45000 });
          if (r && r.status() >= 400) {
            result.selectorMissing.push(`${action.url} (HTTP ${r.status()})`);
          } else {
            result.converted.push(`visit ${action.url}`);
          }
          await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
          await sleep(action.waitAfterMs);
        }
      }
    }

    // Give the SDK a moment to flush its event queue before the profile is destroyed.
    await sleep(2500);
    result.ok = true;
  } catch (e) {
    result.error = String(e.message || e).split('\n')[0];
  } finally {
    await context.close().catch(() => {});
  }
  return result;
}
