#!/usr/bin/env node

import { basename } from 'node:path';
import { execSync } from 'node:child_process';

const MIGRATION_RE = /^src\/migrations\/(\d+)-.+\.ts$/;
// Only reject timestamps that end with 000 (e.g. 1755059371000, 1776070800000).
const IMPRECISE_RE = /000$/;

function stagedMigrationFiles() {
  const out = execSync('git diff --cached --name-only --diff-filter=ACM', {
    encoding: 'utf8',
  });
  return out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((f) => MIGRATION_RE.test(f) && !f.endsWith('.e2e-spec.ts'));
}

function checkFiles(files) {
  const invalid = [];
  for (const file of files) {
    const match =
      file.match(MIGRATION_RE) ?? basename(file).match(/^(\d+)-.+\.ts$/);
    if (!match) continue;
    if (file.endsWith('.e2e-spec.ts')) continue;
    const timestamp = match[1];
    if (IMPRECISE_RE.test(timestamp)) {
      invalid.push({ file, timestamp });
    }
  }
  return invalid;
}

const files =
  process.argv.length > 2
    ? process.argv
        .slice(2)
        .filter((f) => /\.ts$/.test(f) && !f.endsWith('.e2e-spec.ts'))
    : stagedMigrationFiles();

const invalid = checkFiles(files);

if (invalid.length === 0) {
  process.exit(0);
}

console.error(
  'Error: migration timestamp must not end with 000 (e.g. xxxx000 is rejected).',
);
console.error(
  'Use a real millisecond timestamp:',
);
console.error('  node -e "console.log(Date.now())"');
console.error('  # or on GNU date: date +%s%3N');
console.error('');
console.error('Invalid migration file(s):');
for (const { file, timestamp } of invalid) {
  console.error(`  - ${file} (timestamp: ${timestamp})`);
}
process.exit(1);
