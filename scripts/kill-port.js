#!/usr/bin/env node
/**
 * Kills any process occupying port 4004 before dev server starts.
 * Works on Linux and macOS. Safe to run even if nothing is on the port.
 */
const { execSync } = require('child_process');
const PORT = process.env.PORT || 4004;

try {
  // Linux
  execSync(`fuser -k ${PORT}/tcp`, { stdio: 'ignore' });
} catch (_) {
  try {
    // macOS / fallback
    execSync(`lsof -ti:${PORT} | xargs kill -9`, { stdio: 'ignore', shell: true });
  } catch (_) {
    // Nothing was on the port — that's fine
  }
}

console.log(`[predev] Port ${PORT} is clear. Starting cds watch...`);
