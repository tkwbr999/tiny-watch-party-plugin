#!/usr/bin/env node
const path = require('path');

function printHeader() {
  // keep it minimal and friendly
  console.log('Tiny Watch Party CLI');
}

function printHelp() {
  printHeader();
  console.log('\nUsage: node scripts/cli.js <command>');
  console.log('\nCommands:');
  console.log('  validate     検証を実行 (manifest, files, permissions)');
  console.log('  test         簡易テストを実行');
  console.log('  help         このヘルプを表示');
}

async function main(argv) {
  const cmd = argv[2];
  switch (cmd) {
    case 'validate': {
      const { validate } = require('./lib/validate');
      const ok = validate();
      if (!ok) process.exitCode = 1;
      return;
    }
    case 'test': {
      const { run } = require('./lib/test');
      const ok = run();
      if (!ok) process.exitCode = 1;
      return;
    }
    case 'help':
    case undefined:
      printHelp();
      return;
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exitCode = 1;
  }
}

if (require.main === module) {
  main(process.argv);
}

