const path = require('path');
const fs = require('fs');

const args = process.argv;
const targetPathIndex = args.indexOf('--targetPath');
const targetPath = targetPathIndex !== -1 ? args[targetPathIndex + 1] : '';

console.error(`[Disk Cleanup Daemon] Initializing cleanup on path: ${targetPath}`);

// Mock cleanup
console.log(JSON.stringify({
  cleaned: true,
  freedBytes: Math.floor(Math.random() * 500 * 1024 * 1024) + 50 * 1024 * 1024 // Freed between 50MB and 550MB
}));
