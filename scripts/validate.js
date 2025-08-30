// Backward-compatible wrapper to new CLI module
const { validate } = require('./lib/validate');
const ok = validate();
if (!ok) process.exit(1);
