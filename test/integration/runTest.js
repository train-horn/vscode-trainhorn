'use strict';
// Extension-host smoke test: downloads VS Code (stable) and runs suite/index.js inside it.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runTests } = require('@vscode/test-electron');

async function main() {
  try {
    await runTests({
      extensionDevelopmentPath: path.resolve(__dirname, '../..'),
      extensionTestsPath: path.resolve(__dirname, './suite/index.js'),
      // A short user-data dir: VS Code's IPC socket path must stay under 103 chars on macOS.
      launchArgs: ['--disable-extensions', '--disable-workspace-trust', `--user-data-dir=${fs.mkdtempSync(path.join(os.tmpdir(), 'th-'))}`],
    });
  } catch (err) {
    console.error('Extension-host tests failed:', err);
    process.exit(1);
  }
}

main();
