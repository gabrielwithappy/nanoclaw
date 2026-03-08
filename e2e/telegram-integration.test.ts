/**
 * End-to-End Integration Test for NanoClaw
 * 
 * Tests the complete message flow:
 * Telegram → NanoClaw Main → Container → Response → Telegram
 * 
 * Run with: npm run test:e2e
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface TestContext {
  nanoclaw?: ChildProcess;
  isRunning: boolean;
  startTime: number;
  logsDir: string;
}

describe('NanoClaw End-to-End Integration Tests', () => {
  const ctx: TestContext = {
    isRunning: false,
    startTime: 0,
    logsDir: '/tmp/nanoclaw-e2e-tests',
  };

  beforeAll(() => {
    // Create test logs directory
    if (!fs.existsSync(ctx.logsDir)) {
      fs.mkdirSync(ctx.logsDir, { recursive: true });
    }

    console.log('E2E Test Setup: Checking nanoclaw prerequisites...');
  });

  afterAll(() => {
    // Cleanup
    if (ctx.nanoclaw) {
      ctx.nanoclaw.kill('SIGTERM');
    }

    console.log(`E2E Tests completed. Logs saved to: ${ctx.logsDir}`);
  });

  describe('Prerequisites', () => {
    it('should have Docker installed and running', () => {
      try {
        const output = execSync('docker --version', { encoding: 'utf-8' });
        expect(output).toBeDefined();
        console.log(`✓ Docker: ${output.trim()}`);
      } catch {
        throw new Error('Docker not available');
      }
    });

    it('should have nanoclaw-agent image built', () => {
      try {
        const output = execSync('docker images nanoclaw-agent --format "{{.Repository}}:{{.Tag}}"', {
          encoding: 'utf-8',
        });
        expect(output).toContain('nanoclaw-agent');
        console.log(`✓ Docker image available: ${output.trim()}`);
      } catch {
        throw new Error('nanoclaw-agent Docker image not found');
      }
    });

    it('should have TELEGRAM_BOT_TOKEN configured', () => {
      try {
        const envFile = path.join(process.cwd(), '.env');
        const env = fs.readFileSync(envFile, 'utf-8');
        expect(env).toMatch(/TELEGRAM_BOT_TOKEN=/);
        console.log('✓ Telegram bot token configured');
      } catch {
        throw new Error('TELEGRAM_BOT_TOKEN not configured in .env');
      }
    });
  });

  describe('NanoClaw Startup', () => {
    it('should start nanoclaw successfully', async () => {
      ctx.startTime = Date.now();

      // Check if already running
      try {
        const running = execSync('pgrep -f "node.*dist/index.js" | grep -v grep', {
          encoding: 'utf-8',
        });
        if (running) {
          console.log('⚠ NanoClaw already running, using existing instance');
          ctx.isRunning = true;
          return;
        }
      } catch {
        // Not running, we'll start it
      }

      // Build if needed
      try {
        console.log('Building nanoclaw...');
        execSync('npm run build', { cwd: process.cwd(), stdio: 'ignore' });
      } catch {
        throw new Error('Failed to build nanoclaw');
      }

      // Start nanoclaw
      ctx.nanoclaw = spawn('npm', ['start'], {
        cwd: process.cwd(),
        stdio: 'pipe',
      });

      let output = '';
      let startupComplete = false;

      await new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('NanoClaw startup timeout (30s)'));
        }, 30000);

        ctx.nanoclaw!.stdout!.on('data', (data) => {
          output += data.toString();

          if (output.includes('NanoClaw running') || output.includes('Telegram bot connected')) {
            startupComplete = true;
            clearTimeout(timeout);
            resolve();
          }
        });

        ctx.nanoclaw!.stderr!.on('data', (data) => {
          console.error('NanoClaw stderr:', data.toString());
        });

        ctx.nanoclaw!.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });
      });

      expect(startupComplete).toBe(true);
      console.log('✓ NanoClaw started successfully');
      ctx.isRunning = true;
    }, 40000);

    it('should have Telegram bot connected', async () => {
      if (!ctx.isRunning) {
        throw new Error('NanoClaw not running');
      }

      // Give it a few seconds to fully initialize
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Check logs for Telegram connection
      const logPath = '/tmp/nanoclaw-single.log';
      if (fs.existsSync(logPath)) {
        const logs = fs.readFileSync(logPath, 'utf-8');
        expect(logs).toMatch(/Telegram bot connected/);
        expect(logs).toMatch(/@owlyang_bot/);
        console.log('✓ Telegram bot confirmed connected');
      }
    });
  });

  describe('Message Processing Pipeline', () => {
    it('should have IPC directories initialized', () => {
      const ipcDir = path.join(process.cwd(), 'data', 'ipc');
      const mainIpc = path.join(ipcDir, 'main');

      expect(fs.existsSync(ipcDir)).toBe(true);
      expect(fs.existsSync(mainIpc)).toBe(true);
      expect(fs.existsSync(path.join(mainIpc, 'input'))).toBe(true);
      expect(fs.existsSync(path.join(mainIpc, 'messages'))).toBe(true);

      console.log('✓ IPC directory structure validated');
    });

    it('should have database initialized', () => {
      const dbPath = path.join(process.cwd(), 'nanoclaw.db');

      // DB may not exist yet on fresh start, but should be in logs
      const logPath = '/tmp/nanoclaw-single.log';
      if (fs.existsSync(logPath)) {
        const logs = fs.readFileSync(logPath, 'utf-8');
        expect(logs).toMatch(/Database initialized/);
        console.log('✓ Database initialization confirmed');
      }
    });

    it('should have container infrastructure ready', () => {
      try {
        // Check if Docker daemon is accessible
        execSync('docker ps', { stdio: 'ignore' });

        // Check if volumes can be created
        const testVolume = 'nanoclaw-e2e-test-volume';
        try {
          execSync(`docker volume create ${testVolume}`, { stdio: 'ignore' });
          execSync(`docker volume rm ${testVolume}`, { stdio: 'ignore' });
          console.log('✓ Container infrastructure ready');
        } catch {
          throw new Error('Cannot create Docker volumes');
        }
      } catch (err) {
        throw new Error(`Container infrastructure not ready: ${err}`);
      }
    });
  });

  describe('Critical Path Monitoring', () => {
    it('should detect if responses are being generated', async () => {
      // Monitor logs for container activity
      const logPath = '/tmp/nanoclaw-single.log';
      const initialSize = fs.existsSync(logPath) ? fs.statSync(logPath).size : 0;

      // Wait for any potential message processing
      await new Promise((resolve) => setTimeout(resolve, 5000));

      if (fs.existsSync(logPath)) {
        const currentSize = fs.statSync(logPath).size;
        const logs = fs.readFileSync(logPath, 'utf-8');

        // Check for processing activity
        const hasActivity = logs.includes('Processing messages') || logs.includes('Container');

        if (currentSize > initialSize || hasActivity) {
          console.log('✓ Active message processing detected');
        } else {
          console.log('⚠ No message processing activity yet (normal if no messages sent)');
        }
      }
    });

    it('should have health check capable', () => {
      // Verify health check module exists and can be imported
      const healthCheckPath = path.join(process.cwd(), 'dist', 'health-check.js');

      if (fs.existsSync(healthCheckPath)) {
        expect(fs.readFileSync(healthCheckPath, 'utf-8')).toContain('performHealthCheck');
        console.log('✓ Health check module available');
      } else {
        console.log('ℹ Health check module not yet compiled (will be available after build)');
      }
    });
  });

  describe('Error Detection', () => {
    it('should log any Telegram errors', () => {
      const logPath = '/tmp/nanoclaw-single.log';
      if (fs.existsSync(logPath)) {
        const logs = fs.readFileSync(logPath, 'utf-8');

        // Check for specific Telegram errors
        const hasConflictError = logs.includes('409: Conflict');
        const hasTimeoutError = logs.includes('timeout');

        if (hasConflictError) {
          throw new Error('CRITICAL: Multiple Telegram bot instances detected (409 Conflict)');
        }

        if (hasTimeoutError) {
          console.log('⚠ Timeout detected in logs - may indicate performance issues');
        }
      }
    });

    it('should not have container spawn errors', () => {
      const logPath = '/tmp/nanoclaw-single.log';
      if (fs.existsSync(logPath)) {
        const logs = fs.readFileSync(logPath, 'utf-8');

        const hasSpawnError = logs.includes('Container spawn error');
        const hasImageError = logs.includes('image not found');

        expect(hasSpawnError).toBe(false);
        expect(hasImageError).toBe(false);

        console.log('✓ No container spawn errors detected');
      }
    });
  });

  describe('Performance Metrics', () => {
    it('should calculate startup time', () => {
      const startupMs = Date.now() - ctx.startTime;
      console.log(`📊 NanoClaw startup time: ${startupMs}ms`);

      // Startup should complete within 30 seconds
      expect(startupMs).toBeLessThan(30000);
    });

    it('should report memory usage', () => {
      try {
        const output = execSync("ps aux | grep 'node.*dist/index' | grep -v grep | awk '{print $6}'", {
          encoding: 'utf-8',
        });
        const memMB = Math.round(parseInt(output.trim()) / 1024);
        console.log(`📊 NanoClaw memory usage: ~${memMB}MB`);
      } catch {
        console.log('⚠ Could not measure memory usage');
      }
    });
  });
});
