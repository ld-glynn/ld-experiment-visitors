# ld-experiment-visitors

Real browser visitors for your LaunchDarkly experiment.

Point it at your staging site and it sends a stream of realistic visitors: each one opens a fresh browser profile (so your site sees a brand-new person), loads the page, reads for a moment, and with the probabilities you choose clicks your call to action or reaches a page. Your site's own LaunchDarkly SDK does every flag evaluation and sends every metric event, so the experiment fills in exactly the way it would with production traffic. Nothing is faked on the LaunchDarkly side.

Companion to the [Experiment Simulator](https://ld-metric-simulator.vercel.app), which writes the journey file and the command for you.

## Run it

You need Node.js 18 or newer and Google Chrome or Microsoft Edge on the machine. Nothing else to install.

```bash
# one visitor, visible browser, tries every action and reports what it saw
npx -y github:ld-glynn/ld-experiment-visitors journey.json --once --headed

# the real thing; leave the terminal open, Ctrl-C stops it and prints a summary
npx -y github:ld-glynn/ld-experiment-visitors journey.json
```

Run it from a machine that can reach your staging site (on the VPN, if there is one).

If there is no Chrome or Edge, run `npx playwright-core install chromium` once.

## The journey file

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

- `actions` run in order for each visitor. Each happens with its `probability` (0 to 1). Visitors who do nothing still count as exposures.
- `visitorsPerHour` is an average. Arrivals are uneven, like people.
- `durationMinutes` 0 means run until you stop it.
- `devices` is `mixed` (55% desktop, 45% mobile), `desktop`, or `mobile`.
- `headers` and `basicAuth` are optional, for protected staging sites.

Options on the command line override the file: `--rate 300`, `--minutes 60`, `--concurrency 4`.

## What it tells you

Before the run, a preflight visitor loads the page and tries every action. If the page fails to load, or a selector is not on the page, it stops and says so. It also reports whether it saw LaunchDarkly browser-SDK traffic, so you know the SDK is loading. Then, one line per visitor:

```
15:02:11  visitor #37 mobile · converted (click #buy-now) · LD sdk: 6 requests, 3 event posts
```

## Before you start

- The flag must be on in that environment and the experiment must be running, or LaunchDarkly records nothing.
- If your page uses the browser SDK, the flag must be available to client-side SDKs ("SDKs using Client-side ID" in the flag's settings).
- Use staging, never production.

## License

MIT.
