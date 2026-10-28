import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { score, type DrabbleRecord } from './src/metrics.js';

const here = dirname(fileURLToPath(import.meta.url));

interface GoldStandard {
  reference: { mean_sentence_len: number };
  records: DrabbleRecord[];
}

async function loadGold(): Promise<GoldStandard> {
  const raw = await readFile(
    join(here, '..', 'datasets', 'gold_standard.json'),
    'utf8',
  );
  return JSON.parse(raw) as GoldStandard;
}

function runPythonEngine(datasetPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('python', [join(here, 'engine', 'evaluator.py'), datasetPath], {
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`engine exited ${code}`)),
    );
  });
}

async function main(): Promise<void> {
  const gold = await loadGold();
  const scored = gold.records.map((r) => score(r, gold.reference));

  console.table(
    scored.map(({ id, token_count, within_token_constraint, style_alignment }) => ({
      id,
      token_count,
      within_token_constraint,
      style_alignment,
    })),
  );

  const failed = scored.filter((s) => !s.within_token_constraint);
  if (failed.length > 0) {
    console.error(`${failed.length} record(s) violate the 100-token constraint`);
    process.exitCode = 1;
    return;
  }

  await runPythonEngine(join(here, '..', 'datasets', 'gold_standard.json'));
  console.log('eval batch complete');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
