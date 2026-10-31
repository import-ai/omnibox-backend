const { execFileSync } = require('node:child_process');
const fs = require('node:fs');

fs.rmSync('.test-build', { recursive: true, force: true });
// Whole-program emit preserves decorator metadata that isolated transpilation loses.
execFileSync(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc'),
    '--project',
    'tsconfig.test-build.json',
  ],
  { stdio: 'inherit' },
);
for (const directory of [
  'src/i18n',
  'src/mail/templates',
  'src/open-api/templates',
]) {
  fs.cpSync(directory, `.test-build/${directory}`, { recursive: true });
}
