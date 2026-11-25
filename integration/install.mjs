import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: {
  frontend: { type: 'string' },
  backend: { type: 'string' },
  apply: { type: 'boolean' },
} });
if (!values.frontend || !values.backend) {
  console.error('Usage: node integration/install.mjs --frontend <DSA frontend checkout> --backend <DSA backend checkout> [--apply]');
  process.exitCode = 1;
} else {
  function run(side, apply) {
    const script = fileURLToPath(new URL('./' + side + '/install.mjs', import.meta.url));
    const args = [script, '--target', values[side]];
    if (apply) args.push('--apply');
    return JSON.parse(execFileSync(process.execPath, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'inherit'] }));
  }

  try {
    const plans = { frontend: run('frontend', false), backend: run('backend', false) };
    if (plans.frontend.target === plans.backend.target) throw new Error('Provide separate frontend and backend checkouts.');
    const results = values.apply ? { frontend: run('frontend', true), backend: run('backend', true) } : plans;
    console.log(JSON.stringify({ mode: values.apply ? 'apply' : 'preflight', ...results }, null, 2));
  } catch (error) {
    if (!error.status) console.error(error.message);
    process.exitCode = 1;
  }
}
