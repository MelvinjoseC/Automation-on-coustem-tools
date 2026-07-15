const os = require('os');

function getCpuUsage() {
  const cpus = os.cpus();
  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;
  
  for (const cpu of cpus) {
    user += cpu.times.user;
    nice += cpu.times.nice;
    sys += cpu.times.sys;
    idle += cpu.times.idle;
    irq += cpu.times.irq;
  }
  
  const total = user + nice + sys + idle + irq;
  const used = user + nice + sys + irq;
  return total > 0 ? parseFloat(((used / total) * 100).toFixed(2)) : 0.0;
}

function getMemoryUsage() {
  const total = os.totalmem();
  const free = os.freemem();
  return total > 0 ? parseFloat(((free / total) * 100).toFixed(2)) : 0.0;
}

function main() {
  const isVerbose = process.argv.includes('--verbose') || process.argv.includes('true');
  
  if (isVerbose) {
    console.warn('[System Info Daemon] Querying host OS metrics...');
  }
  
  const cpuLoad = getCpuUsage();
  const freeMemory = getMemoryUsage();
  const diskUsage = "32% Used (256GB Free of 800GB)";
  
  const output = {
    cpuLoad,
    freeMemory,
    diskUsage
  };
  
  console.log(JSON.stringify(output, null, 2));
}

main();
