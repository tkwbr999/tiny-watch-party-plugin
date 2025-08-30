// Backward-compatible wrapper to new CLI module
const { run } = require('./lib/test');
const ok = run();
if (!ok) process.exit(1);
