const fs = require('fs');
const path = require('path');

const args = process.argv;
const pathIndex = args.indexOf('--targetPath');
const targetPath = pathIndex !== -1 ? args[pathIndex + 1] : '.';

const maxLinesIndex = args.indexOf('--maxLines');
const maxLines = maxLinesIndex !== -1 ? parseInt(args[maxLinesIndex + 1], 10) : 500;

console.error(`[Log Analyzer] Scanning target: ${targetPath} (max lines: ${maxLines})`);

let errorCount = 0;
let warnCount = 0;
let sampledErrors = [];

try {
  let fileList = [];
  if (fs.existsSync(targetPath)) {
    const stat = fs.statSync(targetPath);
    if (stat.isDirectory()) {
      fileList = fs.readdirSync(targetPath)
        .filter(f => f.endsWith('.log') || f.endsWith('.txt'))
        .map(f => path.join(targetPath, f));
    } else {
      fileList = [targetPath];
    }
  }

  for (const file of fileList) {
    const content = fs.readFileSync(file, 'utf8');
    const lines = content.split('\n').slice(-maxLines);

    for (const line of lines) {
      if (/error|failed|failure|exception/i.test(line)) {
        errorCount++;
        if (sampledErrors.length < 5) {
          sampledErrors.push(line.trim());
        }
      } else if (/warn|warning/i.test(line)) {
        warnCount++;
      }
    }
  }

  const result = {
    analyzedFiles: fileList.length,
    errorCount,
    warnCount,
    hasAnomalies: errorCount > 0,
    sampledErrors
  };

  console.log(JSON.stringify(result));
} catch (err) {
  console.error(`[Log Analyzer] Scan error: ${err.message}`);
  console.log(JSON.stringify({
    analyzedFiles: 0,
    errorCount: 0,
    warnCount: 0,
    hasAnomalies: false,
    sampledErrors: [],
    error: err.message
  }));
}
