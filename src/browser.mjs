// Find a browser to drive. Prefer the Chrome or Edge already on the machine so nothing needs downloading.

import { chromium } from 'playwright-core';

const CHANNELS = ['chrome', 'msedge', 'chromium'];

export async function launchBrowser({ headed = false } = {}) {
  const errors = [];
  for (const channel of CHANNELS) {
    try {
      const browser = await chromium.launch({ channel, headless: !headed });
      return { browser, channel };
    } catch (e) {
      errors.push(`${channel}: ${firstLine(e.message)}`);
    }
  }
  // Last resort: Playwright's own Chromium, if it has been installed.
  try {
    const browser = await chromium.launch({ headless: !headed });
    return { browser, channel: 'playwright-chromium' };
  } catch (e) {
    errors.push(`bundled: ${firstLine(e.message)}`);
  }
  throw new Error(
    'No browser found. Install Google Chrome or Microsoft Edge, or run:\n\n    npx playwright-core install chromium\n\nDetails:\n  ' + errors.join('\n  '),
  );
}

function firstLine(s) {
  return String(s).split('\n')[0];
}

const DESKTOP = [
  { viewport: { width: 1440, height: 900 }, userAgent: undefined, isMobile: false },
  { viewport: { width: 1536, height: 864 }, userAgent: undefined, isMobile: false },
  { viewport: { width: 1280, height: 720 }, userAgent: undefined, isMobile: false },
];
const MOBILE = [
  {
    viewport: { width: 390, height: 844 },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
    isMobile: true,
    hasTouch: true,
  },
  {
    viewport: { width: 412, height: 915 },
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
    isMobile: true,
    hasTouch: true,
  },
];
const LOCALES = ['en-US', 'en-US', 'en-US', 'en-GB', 'de-DE', 'fr-FR', 'es-ES', 'pt-BR'];

const pick = xs => xs[Math.floor(Math.random() * xs.length)];

/** A fresh, isolated browser profile for one visitor: new cookies, new storage, new identity. */
export function visitorProfile(journey) {
  const mobile = journey.devices === 'mobile' ? true : journey.devices === 'desktop' ? false : Math.random() < 0.45;
  const device = pick(mobile ? MOBILE : DESKTOP);
  return {
    kind: mobile ? 'mobile' : 'desktop',
    options: {
      viewport: device.viewport,
      userAgent: device.userAgent,
      isMobile: device.isMobile,
      hasTouch: device.hasTouch,
      locale: pick(LOCALES),
      extraHTTPHeaders: journey.headers,
      httpCredentials: journey.basicAuth,
      ignoreHTTPSErrors: true,
    },
  };
}
