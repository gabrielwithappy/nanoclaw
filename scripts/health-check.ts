#!/usr/bin/env tsx
/**
 * NanoClaw Health Check CLI
 * 
 * Run: npm run test:health
 * 
 * Checks critical system paths and reports status
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

interface HealthReport {
  timestamp: string;
  overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
  checks: Array<{
    name: string;
    status: 'PASS' | 'WARN' | 'FAIL';
    message: string;
  }>;
  recommendations: string[];
}

const checks: HealthReport['checks'] = [];
const recommendations: string[] = [];

function addCheck(name: string, status: 'PASS' | 'WARN' | 'FAIL', message: string) {
  checks.push({ name, status, message });
}

function checkTelegramBot(): void {
  try {
    const processOutput = execSync("pgrep -f 'node.*dist/index' || true", { encoding: 'utf-8' }).trim();
    const pids = processOutput.split('\n').filter((p) => p);

    if (pids.length === 0) {
      addCheck('Telegram Bot Process', 'FAIL', 'NanoClaw process not running');
      recommendations.push('Start NanoClaw: npm start');
      return;
    }

    if (pids.length > 1) {
      addCheck('Telegram Bot Process', 'FAIL', `Multiple instances running (${pids.length} PIDs)`);
      recommendations.push('Kill all instances: killall -9 node');
      recommendations.push('Start single instance: npm start');
      return;
    }

    // Check if log shows connection
    const logPath = '/tmp/nanoclaw-single.log';
    if (fs.existsSync(logPath)) {
      const logs = fs.readFileSync(logPath, 'utf-8');

      if (logs.includes('Telegram bot connected')) {
        addCheck('Telegram Bot Connection', 'PASS', 'Bot connected and polling');
        return;
      }

      if (logs.includes('409: Conflict')) {
        addCheck('Telegram Bot Connection', 'FAIL', 'Conflict: multiple instances trying to poll');
        recommendations.push('Kill all node processes and restart');
        return;
      }

      if (logs.includes('FATAL') || logs.includes('Error')) {
        const lastError = logs.split('\n').reverse().find((l) => l.includes('FATAL') || l.includes('Error'));
        addCheck('Telegram Bot Connection', 'FAIL', `Bot error: ${lastError || 'unknown'}`);
        return;
      }
    }

    addCheck('Telegram Bot Connection', 'WARN', 'Bot running but status unclear - check logs');
  } catch (err) {
    addCheck('Telegram Bot Process', 'FAIL', `Error checking: ${err}`);
  }
}

function checkIpcFilesystem(): void {
  const ipcDir = path.join(process.cwd(), 'data', 'ipc', 'main');

  if (!fs.existsSync(ipcDir)) {
    addCheck('IPC Filesystem', 'FAIL', 'IPC directory not initialized');
    recommendations.push('Send a message to activate message processing');
    return;
  }

  const inputDir = path.join(ipcDir, 'input');
  if (fs.existsSync(inputDir)) {
    const files = fs.readdirSync(inputDir);
    if (files.length > 3) {
      addCheck('IPC Input Queue', 'WARN', `${files.length} pending files (possible backlog)`);
      recommendations.push('Check if Container is processing messages');
      return;
    }
    addCheck('IPC Input Queue', 'PASS', `Queue healthy (${files.length} files)`);
  } else {
    addCheck('IPC Input Queue', 'FAIL', 'Input directory not found');
  }
}

function checkContainerInfrastructure(): void {
  try {
    execSync('docker ps > /dev/null 2>&1');
    addCheck('Docker daemon', 'PASS', 'Docker daemon accessible');
  } catch {
    addCheck('Docker daemon', 'FAIL', 'Docker daemon not accessible');
    recommendations.push('Start Docker daemon');
    return;
  }

  try {
    const output = execSync('docker images nanoclaw-agent --format "{{.CreatedAt}}"', {
      encoding: 'utf-8',
    }).trim();
    if (output) {
      addCheck('nanoclaw-agent image', 'PASS', `Image available (created ${output})`);
    } else {
      addCheck('nanoclaw-agent image', 'FAIL', 'Image not found');
      recommendations.push('Build image: npm run build (in container dir)');
    }
  } catch {
    addCheck('nanoclaw-agent image', 'FAIL', 'Cannot check Docker image');
  }
}

function checkMessagePipeline(): void {
  const logPath = '/tmp/nanoclaw-single.log';

  if (!fs.existsSync(logPath)) {
    addCheck('Message Pipeline', 'WARN', 'No logs found - send a test message');
    return;
  }

  const logs = fs.readFileSync(logPath, 'utf-8');

  // Check for processing activity
  if (logs.includes('Processing messages')) {
    const lastProcessing = logs
      .split('\n')
      .reverse()
      .find((l) => l.includes('Processing messages'));
    addCheck('Message Processing', 'PASS', 'Messages being processed');

    // Check for successful container output
    if (logs.includes('Container completed')) {
      addCheck('Container Response', 'PASS', 'Responses being generated');
    } else if (logs.includes('Container')) {
      addCheck('Container Response', 'WARN', 'Container active but check logs for errors');
    } else {
      addCheck('Container Response', 'FAIL', 'No container output detected');
      recommendations.push('Check Container logs: docker logs <container-name>');
    }
  } else {
    addCheck('Message Pipeline', 'WARN', 'No messages processed yet');
    recommendations.push('Send a test message to Telegram');
  }
}

function checkErrorConditions(): void {
  const logPath = '/tmp/nanoclaw-single.log';

  if (!fs.existsSync(logPath)) {
    return;
  }

  const logs = fs.readFileSync(logPath, 'utf-8');

  if (logs.includes('409: Conflict')) {
    addCheck('Critical: Multiple Instances', 'FAIL', '409 Conflict detected');
    recommendations.push('CRITICAL: Multiple bot instances detected!');
    recommendations.push('Run: killall -9 node && npm start');
    return;
  }

  if (logs.includes('Container spawn error')) {
    addCheck('Container Startup', 'FAIL', 'Container cannot spawn');
    recommendations.push('Check: docker inspect nanoclaw-agent');
    return;
  }

  if (logs.includes('No channels connected')) {
    addCheck('Channel Registration', 'FAIL', 'No Telegram channel found');
    recommendations.push('Channels not registered - this is a configuration issue');
    return;
  }

  addCheck('Error Monitoring', 'PASS', 'No critical errors detected');
}

function printReport(report: HealthReport): void {
  const colors = {
    reset: '\x1b[0m',
    bold: '\x1b[1m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    red: '\x1b[31m',
  };

  console.log('\n' + '='.repeat(60));
  console.log(`${colors.bold}NanoClaw Health Check Report${colors.reset}`);
  console.log(`Timestamp: ${report.timestamp}`);
  console.log(
    `Status: ${
      report.overallStatus === 'HEALTHY'
        ? colors.green + 'HEALTHY' + colors.reset
        : report.overallStatus === 'DEGRADED'
          ? colors.yellow + 'DEGRADED' + colors.reset
          : colors.red + 'UNHEALTHY' + colors.reset
    }`,
  );
  console.log('='.repeat(60));

  console.log('\n📋 Checks:\n');
  for (const check of report.checks) {
    const icon =
      check.status === 'PASS' ? '✓' : check.status === 'WARN' ? '⚠' : '✗';
    const color =
      check.status === 'PASS' ? colors.green : check.status === 'WARN' ? colors.yellow : colors.red;
    console.log(`${color}${icon} ${check.name}${colors.reset}`);
    console.log(`  ${check.message}`);
  }

  if (report.recommendations.length > 0) {
    console.log('\n💡 Recommendations:\n');
    for (const rec of report.recommendations) {
      console.log(`  • ${rec}`);
    }
  }

  console.log('\n' + '='.repeat(60));

  // Exit with appropriate code
  const failCount = report.checks.filter((c) => c.status === 'FAIL').length;
  if (failCount > 0) {
    process.exit(1);
  } else if (report.overallStatus === 'DEGRADED') {
    process.exit(0); // Warning but not failure
  }
}

// Run all checks
console.log('🔍 Running NanoClaw health checks...\n');

checkTelegramBot();
checkIpcFilesystem();
checkContainerInfrastructure();
checkMessagePipeline();
checkErrorConditions();

// Calculate overall status
const failCount = checks.filter((c) => c.status === 'FAIL').length;
const warnCount = checks.filter((c) => c.status === 'WARN').length;

let overallStatus: 'HEALTHY' | 'DEGRADED' | 'UNHEALTHY';
if (failCount > 0) {
  overallStatus = 'UNHEALTHY';
} else if (warnCount > 0) {
  overallStatus = 'DEGRADED';
} else {
  overallStatus = 'HEALTHY';
}

const report: HealthReport = {
  timestamp: new Date().toISOString(),
  overallStatus,
  checks,
  recommendations,
};

printReport(report);
