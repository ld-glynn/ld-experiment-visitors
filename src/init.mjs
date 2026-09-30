// `init`: ask a few questions and write journey.json. No dependencies, works in any terminal.

import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import { writeFile, access } from 'node:fs/promises';

// Prompts read from a line iterator rather than rl.question(), so answers piped in from a
// file or script are not dropped between questions (readline's question() loses them).
function prompter() {
  const rl = createInterface({ input: stdin, output: stdout, terminal: stdin.isTTY === true });
  const lines = rl[Symbol.asyncIterator]();
  return {
    rl,
    async ask(question, { def, validate } = {}) {
      for (;;) {
        const suffix = def !== undefined && def !== '' ? ` [${def}]` : '';
        stdout.write(`${question}${suffix}: `);
        const next = await lines.next();
        if (next.done) {
          stdout.write('\n');
          throw new Error('No more input. Run init in an interactive terminal, or pipe one answer per line.');
        }
        const answer = String(next.value).trim();
        if (!stdin.isTTY) stdout.write(answer + '\n');
        const value = answer === '' && def !== undefined ? String(def) : answer;
        const problem = validate ? validate(value) : null;
        if (!problem) return value;
        console.log(`  ${problem}`);
      }
    },
  };
}

const isUrl = v => (/^https?:\/\/\S+/i.test(v) ? null : 'Enter a full URL starting with http:// or https://');
const isPercent = v => (v !== '' && !Number.isNaN(Number(v)) && Number(v) >= 0 && Number(v) <= 100 ? null : 'Enter a number between 0 and 100');
const isPositive = v => (Number(v) > 0 ? null : 'Enter a number greater than 0');
const isNonNegative = v => (v !== '' && Number(v) >= 0 ? null : 'Enter 0 or more');

export async function runInit(outFile = 'journey.json') {
  const { rl, ask: askLine } = prompter();
  const ask = (_rl, q, o) => askLine(q, o);
  try {
    console.log('\nLet’s describe what a visitor does on your staging site.\n');

    const name = await ask(rl, 'A name for this journey', { def: 'Checkout button test' });
    const url = await ask(rl, 'Landing page URL (your staging site)', { validate: isUrl });

    const actions = [];
    console.log('\nHow does a visitor convert? Your site’s own code fires the metric event when they do it.');
    console.log('Add one or more actions. Leave the selector empty to stop adding.\n');
    for (let i = 1; ; i++) {
      const type = await ask(rl, `Action ${i}: (c)lick an element or (v)isit a page`, {
        def: i === 1 ? 'c' : '',
        validate: v => (v === '' || /^[cv]/i.test(v) ? null : 'Type c or v, or leave empty to finish'),
      });
      if (type === '') break;
      if (/^c/i.test(type)) {
        const selector = await ask(rl, '  CSS selector to click (e.g. #buy-now or button.checkout)');
        if (!selector) break;
        const pct = await ask(rl, '  Share of visitors who click it, in percent', { def: 6, validate: isPercent });
        actions.push({ type: 'click', selector, probability: Number(pct) / 100 });
      } else {
        const path = await ask(rl, '  Path or URL to visit (e.g. /thank-you)');
        if (!path) break;
        const pct = await ask(rl, '  Share of visitors who reach it, in percent', { def: 3, validate: isPercent });
        actions.push({ type: 'visit', url: path, probability: Number(pct) / 100 });
      }
    }

    console.log('\nHow much traffic?\n');
    const rate = Number(await ask(rl, 'Visitors per hour', { def: 120, validate: isPositive }));
    const hours = Number(await ask(rl, 'Run for how many hours (0 = until you stop it)', { def: 4, validate: isNonNegative }));
    const devices = await ask(rl, 'Devices: (m)ixed, (d)esktop, or mo(b)ile', {
      def: 'm',
      validate: v => (/^[mdb]/i.test(v) ? null : 'Type m, d or b'),
    });

    console.log('\nIs the site protected? Press Enter to skip each.\n');
    const authUser = await ask(rl, 'Basic auth username', { def: '' });
    const authPass = authUser ? await ask(rl, 'Basic auth password', { def: '' }) : '';
    const headerName = await ask(rl, 'Extra header name (e.g. x-vercel-protection-bypass)', { def: '' });
    const headerValue = headerName ? await ask(rl, `Value for ${headerName}`, { def: '' }) : '';

    const journey = {
      version: 1,
      name,
      url,
      actions,
      visitorsPerHour: rate,
      durationMinutes: Math.round(hours * 60),
      concurrency: rate > 600 ? 4 : 2,
      devices: /^d/i.test(devices) ? 'desktop' : /^b/i.test(devices) ? 'mobile' : 'mixed',
    };
    if (authUser) journey.basicAuth = { username: authUser, password: authPass };
    if (headerName) journey.headers = { [headerName]: headerValue };

    let target = outFile;
    if (await exists(target)) {
      const overwrite = await ask(rl, `${target} already exists. Overwrite? (y/N)`, { def: 'n' });
      if (!/^y/i.test(overwrite)) target = `journey-${Date.now()}.json`;
    }
    await writeFile(target, JSON.stringify(journey, null, 2) + '\n', 'utf8');

    console.log(`\nWrote ${target}\n`);
    console.log('Next:');
    console.log(`  1. Check it works (one visitor, visible browser):`);
    console.log(`       npx -y github:ld-glynn/ld-experiment-visitors ${target} --once --headed`);
    console.log(`  2. Start the traffic (leave the terminal open; Ctrl-C stops it):`);
    console.log(`       npx -y github:ld-glynn/ld-experiment-visitors ${target}\n`);
    console.log('Make sure the flag is on and the experiment is running in LaunchDarkly first.\n');
  } finally {
    rl.close();
  }
}

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}
