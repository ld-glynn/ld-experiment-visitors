# ld-experiment-visitors

Real browser traffic for a LaunchDarkly experiment on your own staging site.

You have wired an experiment into staging and want to see results come through the way they would with production traffic, without launching anywhere. This tool sends a stream of realistic visitors: each one opens a fresh browser profile (so your site sees a brand-new person), loads the page, reads for a moment, and with the probabilities you set clicks your call to action or reaches a page. Your site's own LaunchDarkly SDK does every flag evaluation and sends every metric event. Nothing is faked on the LaunchDarkly side, so evaluation charts, the Results tab, and the Audience tab fill in exactly as they would for real users.

## Prerequisites

- Node.js 18 or newer.
- Google Chrome or Microsoft Edge installed. (No Chrome? See Docker below, or run `npx playwright-core install chromium` once.)
- A machine that can open your staging site. If staging is behind a VPN, run this from inside it.
- In LaunchDarkly: the flag is **on** in that environment and the experiment is **running**. If your page uses the browser SDK, the flag must be available to client-side SDKs ("SDKs using Client-side ID" in the flag's settings).

## Quick start

```bash
# 1. Describe what a visitor does. Answers a few questions, writes journey.json.
npx -y github:ld-glynn/ld-experiment-visitors init

# 2. Check it works: one visitor, visible browser, tries every action, reports what it saw.
npx -y github:ld-glynn/ld-experiment-visitors journey.json --once --headed

# 3. Start the traffic. Leave the terminal open. Ctrl-C stops it and prints a summary.
npx -y github:ld-glynn/ld-experiment-visitors journey.json
```

`npx -y github:...` downloads the tool on first use. Nothing else is installed on your machine. If you would rather have the source, `git clone https://github.com/ld-glynn/ld-experiment-visitors && cd ld-experiment-visitors && npm install`, then use `node bin/cli.mjs` in place of the `npx` prefix.

## What you will see

Before the run, a preflight visitor loads the page and tries every action once. If the page fails to load, or a selector is not on the page, it stops and tells you which one. It also reports whether it saw LaunchDarkly browser-SDK traffic, so you know the SDK is loading. Then, one line per visitor:

```
15:02:11  visitor #37 mobile · converted (click #buy-now) · LD sdk: 6 requests, 3 event posts
15:02:19  visitor #38 desktop · left without converting · LD sdk: 4 requests, 2 event posts
```

On Ctrl-C:

```
Summary
  visitors: 412 (410 completed, 2 failed)
  click #buy-now: 26 (6.3% of completed visitors)
  LaunchDarkly event posts observed: 1187
```

Results appear in LaunchDarkly a few minutes after events arrive. With 120 visitors an hour you have a readable chart within the hour; a few hundred an hour for a day gets most experiments to significance.

## The journey file

`init` writes this for you. You can also copy [`journey.example.json`](journey.example.json) and edit it.

```json
{
  "version": 1,
  "name": "Checkout button test",
  "url": "https://staging.example.com/",
  "actions": [
    { "type": "click", "selector": "#buy-now", "probability": 0.06 },
    { "type": "visit", "url": "/thank-you", "probability": 0.02 }
  ],
  "visitorsPerHour": 120,
  "durationMinutes": 240,
  "concurrency": 2,
  "devices": "mixed",
  "headers": { "x-vercel-protection-bypass": "..." },
  "basicAuth": { "username": "staging", "password": "secret" }
}
```

| Field | Meaning |
| --- | --- |
| `url` | Landing page. Use staging, never production. |
| `actions` | Run in order for each visitor. Each happens with its `probability` (0 to 1). `click` needs a CSS `selector`; `visit` needs a `url` (path or absolute). Visitors who do nothing still count as exposures. |
| `visitorsPerHour` | An average. Arrivals are uneven, like people. |
| `durationMinutes` | `0` means run until you stop it. |
| `concurrency` | Visitors in flight at once, 1 to 8. Default 2. |
| `devices` | `mixed` (55% desktop, 45% mobile), `desktop`, or `mobile`. |
| `dwellMs` | `[min, max]` time on the landing page before acting. Default `[2000, 8000]`. |
| `headers`, `basicAuth` | Optional, for protected staging sites. |

Command-line overrides: `--rate 300`, `--minutes 60`, `--concurrency 4`, `--headed`, `--once`.

## Making a winner

Real experiments have a winner because one variation converts better. This tool cannot know which variation a visitor was shown (your site decides that), so it applies the same click probability to everyone. To produce a lift, make the variation itself easier to convert on your staging page, for example give the challenger's button the selector you target and the control's button a different one, or have the challenger's page include the `/thank-you` link. If you only want numbers in the Results tab and do not need traffic on your site, use the [Experiment Simulator](https://ld-metric-simulator.vercel.app) instead: it sends events straight to LaunchDarkly with a conversion rate per variation.

## Docker

For a machine without Chrome or Edge:

```bash
docker build -t ld-experiment-visitors https://github.com/ld-glynn/ld-experiment-visitors.git
docker run --rm -it -v "$PWD/journey.json:/journey.json:ro" ld-experiment-visitors /journey.json
```

## Troubleshooting

- **Preflight failed: HTTP 401/403.** Add `basicAuth` or the protection-bypass `headers` to the journey.
- **These actions did not work on the page: #buy-now.** The selector is not on the landing page. Right-click the element, Inspect, and use its `id` (as `#the-id`) or a stable class.
- **No LaunchDarkly browser-SDK traffic was seen.** Fine if your site evaluates flags on the server. Otherwise the SDK is not loading on that page.
- **Visitors arrive but no conversions in LaunchDarkly.** Your page must fire the metric when the action happens: `client.track('event-key')` for a custom metric, or a click or page-view metric configured for that selector or URL.
- **Everyone gets the same variation.** The experiment is not running, the flag is off, or the flag is not available to client-side SDKs.

## License

MIT.
