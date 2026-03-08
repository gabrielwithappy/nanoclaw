/**
 * Health Check System for NanoClaw
 * Monitors critical paths: Telegram → Main Process → Container → Response
 */

import fs from 'fs';
import path from 'path';
import { DATA_DIR } from './config.js';
import { logger } from './logger.js';

export interface HealthCheckResult {
  timestamp: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  components: {
    telegram: { status: boolean; error?: string };
    ipc_filesystem: { status: boolean; error?: string };
    container_communication: { status: boolean; error?: string };
    message_pipeline: { status: boolean; error?: string };
  };
  metrics: {
    last_telegram_message?: string;
    last_container_output?: string;
    ipc_file_count: number;
    queue_size: number;
  };
  details: string[];
}

// Track health metrics
let lastTelegramMessageTime: number | null = null;
let lastContainerOutputTime: number | null = null;
let messageProcessingErrors: Array<{ timestamp: string; error: string }> = [];

export function recordTelegramMessage(): void {
  lastTelegramMessageTime = Date.now();
}

export function recordContainerOutput(): void {
  lastContainerOutputTime = Date.now();
}

export function recordMessageError(error: string): void {
  messageProcessingErrors.push({
    timestamp: new Date().toISOString(),
    error,
  });
  // Keep last 10 errors
  if (messageProcessingErrors.length > 10) {
    messageProcessingErrors.shift();
  }
}

export function performHealthCheck(
  registeredGroupCount: number,
  queueSize: number,
  telegramConnected: boolean,
): HealthCheckResult {
  const details: string[] = [];
  const components = {
    telegram: { status: false, error: undefined as string | undefined },
    ipc_filesystem: { status: false, error: undefined as string | undefined },
    container_communication: { status: false, error: undefined as string | undefined },
    message_pipeline: { status: false, error: undefined as string | undefined },
  };

  // 1. Check Telegram connection
  if (telegramConnected) {
    components.telegram.status = true;
    details.push('✓ Telegram bot connected');
  } else {
    components.telegram.status = false;
    components.telegram.error = 'Telegram bot not connected';
    details.push('✗ Telegram bot disconnected');
  }

  // 2. Check IPC filesystem
  try {
    const ipcDir = path.join(DATA_DIR, 'ipc');
    if (!fs.existsSync(ipcDir)) {
      throw new Error('IPC directory does not exist');
    }

    // Check if main group IPC is accessible
    const mainIpc = path.join(ipcDir, 'main');
    if (!fs.existsSync(mainIpc)) {
      throw new Error('Main IPC directory not found');
    }

    // Try to list input files
    const inputDir = path.join(mainIpc, 'input');
    if (fs.existsSync(inputDir)) {
      const files = fs.readdirSync(inputDir);
      // Having 0-1 input files is normal (Container reads and processes)
      if (files.length > 5) {
        details.push(`⚠ IPC input queue has ${files.length} files (potential backlog)`);
      } else {
        details.push(`✓ IPC filesystem accessible (${files.length} pending files)`);
      }
    }

    components.ipc_filesystem.status = true;
  } catch (err) {
    components.ipc_filesystem.status = false;
    components.ipc_filesystem.error = err instanceof Error ? err.message : String(err);
    details.push(`✗ IPC filesystem error: ${components.ipc_filesystem.error}`);
  }

  // 3. Check container communication
  try {
    const sessionsDir = path.join(DATA_DIR, 'sessions');
    if (!fs.existsSync(sessionsDir)) {
      throw new Error('Sessions directory does not exist');
    }

    // Check if at least one group has recent activity
    const groups = fs.readdirSync(sessionsDir);
    let hasRecentActivity = false;

    for (const group of groups) {
      const groupPath = path.join(sessionsDir, group);
      const claudeDir = path.join(groupPath, '.claude');

      if (fs.existsSync(claudeDir)) {
        const stat = fs.statSync(claudeDir);
        const ageMinutes = (Date.now() - stat.mtimeMs) / 1000 / 60;

        if (ageMinutes < 5) {
          hasRecentActivity = true;
          break;
        }
      }
    }

    if (hasRecentActivity || lastContainerOutputTime) {
      components.container_communication.status = true;
      const timeSinceOutput = lastContainerOutputTime
        ? Math.round((Date.now() - lastContainerOutputTime) / 1000)
        : 'unknown';
      details.push(`✓ Container communication active (last output ${timeSinceOutput}s ago)`);
    } else {
      components.container_communication.status = false;
      components.container_communication.error = 'No recent container activity detected';
      details.push('⚠ No recent container activity (may be idle)');
    }
  } catch (err) {
    components.container_communication.status = false;
    components.container_communication.error = err instanceof Error ? err.message : String(err);
    details.push(`✗ Container communication error: ${components.container_communication.error}`);
  }

  // 4. Check message pipeline
  if (messageProcessingErrors.length === 0) {
    if (lastTelegramMessageTime && lastContainerOutputTime) {
      const lag = lastContainerOutputTime - lastTelegramMessageTime;
      if (lag > 0 && lag < 60000) {
        // Response within 60 seconds
        components.message_pipeline.status = true;
        details.push(`✓ Message pipeline functional (${lag}ms response time)`);
      } else {
        components.message_pipeline.status = false;
        components.message_pipeline.error = `Response lag too high: ${lag}ms`;
        details.push(`✗ Message response time unusual: ${lag}ms`);
      }
    } else if (lastTelegramMessageTime) {
      components.message_pipeline.status = false;
      components.message_pipeline.error = 'Message received but no response detected';
      details.push('✗ Messages received but responses not detected');
    } else {
      // No messages yet
      components.message_pipeline.status = true;
      details.push('⊘ No messages processed yet (pipeline ready)');
    }
  } else {
    components.message_pipeline.status = false;
    const recentErrors = messageProcessingErrors.slice(-3);
    components.message_pipeline.error = `${messageProcessingErrors.length} processing errors`;
    details.push(`✗ Message pipeline errors: ${recentErrors.map((e) => e.error).join('; ')}`);
  }

  // Determine overall status
  const componentStatuses = Object.values(components).map((c) => c.status);
  const healthyCount = componentStatuses.filter((s) => s).length;
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy';

  if (healthyCount === 4) {
    overallStatus = 'healthy';
  } else if (healthyCount >= 2) {
    overallStatus = 'degraded';
  } else {
    overallStatus = 'unhealthy';
  }

  return {
    timestamp: new Date().toISOString(),
    status: overallStatus,
    components,
    metrics: {
      last_telegram_message: lastTelegramMessageTime
        ? new Date(lastTelegramMessageTime).toISOString()
        : undefined,
      last_container_output: lastContainerOutputTime
        ? new Date(lastContainerOutputTime).toISOString()
        : undefined,
      ipc_file_count: fs.existsSync(path.join(DATA_DIR, 'ipc', 'main', 'input'))
        ? fs.readdirSync(path.join(DATA_DIR, 'ipc', 'main', 'input')).length
        : 0,
      queue_size: queueSize,
    },
    details,
  };
}
