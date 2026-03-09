#!/usr/bin/env node

/**
 * Telegram Communication Validation Script
 *
 * Purpose: Verify message deduplication and delivery mechanisms
 *
 * Usage:
 *   npm run validate:telegram
 *   npm run validate:telegram -- --watch
 *   npm run validate:telegram -- --verbose
 */

import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, '..');

interface ValidationResult {
  name: string;
  status: 'pass' | 'fail' | 'skip';
  duration: number;
  message?: string;
}

const VALIDATION_CHECKS = {
  integration: {
    name: 'Telegram Integration Tests',
    pattern: 'src/channels/telegram-integration.test.ts',
    critical: true,
  },
  unit: {
    name: 'Telegram Unit Tests',
    pattern: 'src/channels/telegram.test.ts',
    critical: true,
  },
  database: {
    name: 'Database Deduplication Tests',
    pattern: 'src/db.test.ts',
    critical: true,
  },
};

async function runTest(pattern: string): Promise<{
  passed: boolean;
  output: string;
  duration: number;
}> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const proc = spawn('npm', ['test', '--', pattern], {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout?.on('data', (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on('data', (data) => {
      stderr += data.toString();
    });

    proc.on('close', (code) => {
      const duration = Date.now() - startTime;
      resolve({
        passed: code === 0,
        output: stdout + stderr,
        duration,
      });
    });
  });
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function printHeader(text: string): void {
  console.log('\n' + '='.repeat(60));
  console.log(`  ${text}`);
  console.log('='.repeat(60));
}

function printCheckmark(status: 'pass' | 'fail' | 'skip'): string {
  switch (status) {
    case 'pass':
      return '✅';
    case 'fail':
      return '❌';
    case 'skip':
      return '⏭️ ';
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const watch = args.includes('--watch');
  const verbose = args.includes('--verbose');

  const validateOnce = async (): Promise<void> => {
    printHeader('Telegram Communication Validation Suite');

    const results: ValidationResult[] = [];
    let allPassed = true;

    for (const [key, check] of Object.entries(VALIDATION_CHECKS)) {
      process.stdout.write(`\n${check.name}... `);

      const result = await runTest(check.pattern);
      const status = result.passed ? 'pass' : 'fail';

      results.push({
        name: check.name,
        status,
        duration: result.duration,
      });

      console.log(`${printCheckmark(status)} ${formatDuration(result.duration)}`);

      if (!result.passed) {
        allPassed = false;
        if (verbose) {
          console.log('\nTest output:');
          console.log(result.output);
        }
      }
    }

    // Summary
    printHeader('Summary');

    const passed = results.filter((r) => r.status === 'pass').length;
    const failed = results.filter((r) => r.status === 'fail').length;
    const total = results.length;

    console.log(`\n✓ Passed: ${passed}/${total}`);
    if (failed > 0) {
      console.log(`✗ Failed: ${failed}/${total}`);
    }

    const totalTime = results.reduce((sum, r) => sum + r.duration, 0);
    console.log(`⏱ Total time: ${formatDuration(totalTime)}\n`);

    // Recommendations
    if (!allPassed) {
      printHeader('Issues Found');
      console.log(
        '\nRecommendations:\n' +
        '1. Check database deduplication logic\n' +
        '2. Verify message filtering in getNewMessages()\n' +
        '3. Ensure Telegram bot message detection works\n' +
        '4. Review timestamp handling and ordering\n',
      );
    } else {
      console.log('\n🎉 All validation checks passed!');
      console.log(
        '\nTelegram communication reliability verified:\n' +
        '✓ Message deduplication working\n' +
        '✓ Message delivery mechanisms sound\n' +
        '✓ Edge cases handled\n',
      );
    }

    return allPassed ? Promise.resolve() : Promise.reject();
  };

  if (watch) {
    console.log('Watch mode enabled. Running tests on changes...\n');
    const watchInterval = setInterval(validateOnce, 5000);

    // Run once immediately
    try {
      await validateOnce();
    } catch {
      // Continue in watch mode even if tests fail
    }
  } else {
    try {
      await validateOnce();
    } catch {
      process.exit(1);
    }
  }
}

main().catch((err) => {
  console.error('Validation failed:', err);
  process.exit(1);
});
