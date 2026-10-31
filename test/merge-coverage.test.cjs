const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { test } = require('node:test');

const script = path.join(__dirname, 'merge-coverage.cjs');

test('merges hits across all shards and rejects a missing shard', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'coverage-merge-'));
  try {
    const source = path.join(directory, 'source.js');
    fs.writeFileSync(source, 'const value = 1;\n');
    const inputs = [0, 1, 2, 3].map((hits) => {
      const input = path.join(directory, `${hits}.json`);
      fs.writeFileSync(
        input,
        JSON.stringify({
          [source]: {
            path: source,
            statementMap: {
              0: {
                start: { line: 1, column: 0 },
                end: { line: 1, column: 16 },
              },
            },
            fnMap: {},
            branchMap: {},
            s: { 0: hits },
            f: {},
            b: {},
          },
        }),
      );
      return input;
    });
    const result = spawnSync(process.execPath, [script, ...inputs], {
      cwd: directory,
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stderr);
    const merged = JSON.parse(
      fs.readFileSync(
        path.join(directory, 'coverage/coverage-final.json'),
        'utf8',
      ),
    );
    assert.equal(merged[source].s[0], 6);
    assert.ok(
      fs.existsSync(path.join(directory, 'coverage/lcov-report/index.html')),
    );
    assert.notEqual(
      spawnSync(process.execPath, [script, ...inputs.slice(1)], {
        cwd: directory,
      }).status,
      0,
    );
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
