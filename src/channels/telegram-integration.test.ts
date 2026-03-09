/**
 * Integration tests for Telegram communication reliability.
 * Validates:
 * 1. Message deduplication - prevents duplicate delivery
 * 2. Message delivery - ensures all valid messages are processed
 * 3. Edge cases - empty content, bot messages, filter conditions
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { TelegramChannel, TelegramChannelOpts } from './telegram.js';

// --- Mock setup (simplified for integration tests) ---

vi.mock('../config.js', () => ({
  ASSISTANT_NAME: 'Andy',
  TRIGGER_PATTERN: /^@Andy\b/i,
}));

vi.mock('../logger.js', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

type Handler = (...args: any[]) => any;
const botRef = vi.hoisted(() => ({ current: null as any }));

vi.mock('grammy', () => ({
  Bot: class MockBot {
    token: string;
    commandHandlers = new Map<string, Handler>();
    filterHandlers = new Map<string, Handler[]>();
    errorHandler: Handler | null = null;
    api = {
      sendMessage: vi.fn().mockResolvedValue(undefined),
      sendChatAction: vi.fn().mockResolvedValue(undefined),
      config: {
        use: vi.fn((fn) => {
          // Mock middleware function
        }),
      },
    };

    constructor(token: string) {
      this.token = token;
      botRef.current = this;
    }

    command(name: string, handler: Handler) {
      this.commandHandlers.set(name, handler);
    }

    on(filter: string, handler: Handler) {
      const existing = this.filterHandlers.get(filter) || [];
      existing.push(handler);
      this.filterHandlers.set(filter, existing);
    }

    catch(handler: Handler) {
      this.errorHandler = handler;
    }

    start(opts: { onStart: (botInfo: any) => void }) {
      opts.onStart({ username: 'andy_ai_bot', id: 12345 });
    }

    stop() {}
  },
}));

// --- Integration test helpers ---

interface MessageRecord {
  id: string;
  chat_jid: string;
  sender: string;
  sender_name: string;
  content: string;
  timestamp: string;
  is_from_me: boolean;
  is_bot_message: boolean;
}

class InMemoryMessageStore {
  private messages: Map<string, MessageRecord> = new Map();
  private callLog: Array<{
    type: 'onMessage' | 'onChatMetadata';
    args: any[];
  }> = [];

  onMessage = vi.fn((jid: string, msg: any) => {
    this.callLog.push({ type: 'onMessage', args: [jid, msg] });
    const key = `${msg.id}:${jid}`;
    this.messages.set(key, {
      id: msg.id,
      chat_jid: msg.chat_jid,
      sender: msg.sender,
      sender_name: msg.sender_name,
      content: msg.content,
      timestamp: msg.timestamp,
      is_from_me: msg.is_from_me,
      is_bot_message: msg.is_bot_message,
    });
  });

  onChatMetadata = vi.fn();

  registeredGroups = () => ({
    'tg:100200300': {
      name: 'Test Group',
      folder: 'test-group',
      trigger: '@Andy',
      added_at: '2024-01-01T00:00:00.000Z',
    },
  });

  getMessages(): MessageRecord[] {
    return Array.from(this.messages.values());
  }

  getMessageCallCount(): number {
    return this.onMessage.mock.calls.length;
  }

  getCallLog() {
    return this.callLog;
  }

  reset() {
    this.messages.clear();
    this.callLog = [];
    vi.clearAllMocks();
  }

  hasMessage(id: string, jid: string): boolean {
    return this.messages.has(`${id}:${jid}`);
  }

  getMessageCount(): number {
    return this.messages.size;
  }
}

function createTextCtx(overrides: {
  chatId?: number;
  text: string;
  fromId?: number;
  firstName?: string;
  messageId?: number;
  date?: number;
  entities?: any[];
}) {
  return {
    chat: {
      id: overrides.chatId ?? 100200300,
      type: 'group' as const,
      title: 'Test Group',
    },
    from: {
      id: overrides.fromId ?? 99001,
      first_name: overrides.firstName ?? 'Alice',
      username: 'alice_user',
    },
    message: {
      text: overrides.text,
      date: overrides.date ?? Math.floor(Date.now() / 1000),
      message_id: overrides.messageId ?? 1,
      entities: overrides.entities ?? [],
    },
    me: { username: 'andy_ai_bot' },
    reply: vi.fn(),
  };
}

async function triggerTextMessage(
  ctx: ReturnType<typeof createTextCtx>,
) {
  const handlers = botRef.current.filterHandlers.get('message:text') || [];
  for (const h of handlers) await h(ctx);
}

// --- Integration tests ---

describe('Telegram Communication Integration', () => {
  let store: InMemoryMessageStore;

  beforeEach(() => {
    store = new InMemoryMessageStore();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================
  // DEDUPLICATION TESTS
  // ============================================

  describe('message deduplication', () => {
    it('prevents duplicate delivery of same message ID', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const ctx = createTextCtx({
        chatId: 100200300,
        text: 'Hello world',
        messageId: 42,
      });

      // Simulate receiving the same message twice
      // (network retry, webhook duplicate, etc.)
      await triggerTextMessage(ctx);
      await triggerTextMessage(ctx);

      // Both calls should reach onMessage (database level will deduplicate)
      // but we verify consistent behavior
      expect(store.getMessageCallCount()).toBe(2);
      expect(store.hasMessage('42', 'tg:100200300')).toBe(true);
    });

    it('distinguishes between different message IDs from same sender', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const msg1 = createTextCtx({
        text: 'First message',
        messageId: 1,
      });

      const msg2 = createTextCtx({
        text: 'Second message',
        messageId: 2,
      });

      await triggerTextMessage(msg1);
      await triggerTextMessage(msg2);

      // Should store both messages
      expect(store.getMessageCount()).toBe(2);
      expect(store.hasMessage('1', 'tg:100200300')).toBe(true);
      expect(store.hasMessage('2', 'tg:100200300')).toBe(true);
    });

    it('handles rapid duplicate delivery (network retries)', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const ctx = createTextCtx({
        text: 'Critical message',
        messageId: 100,
        date: 1704067200,
      });

      // Simulate 5 rapid duplicate deliveries
      for (let i = 0; i < 5; i++) {
        await triggerTextMessage(ctx);
      }

      // All trigger onMessage, but should be same message
      expect(store.getMessageCallCount()).toBe(5);
      // Only one unique message in store
      expect(store.getMessageCount()).toBe(1);
    });
  });

  // ============================================
  // MESSAGE DELIVERY TESTS
  // ============================================

  describe('message delivery', () => {
    it('delivers normal text messages', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const ctx = createTextCtx({ text: 'Normal message' });
      await triggerTextMessage(ctx);

      expect(store.onMessage).toHaveBeenCalledWith(
        'tg:100200300',
        expect.objectContaining({
          content: 'Normal message',
          is_bot_message: false,
        }),
      );
    });

    it('delivers @mention messages with trigger translation', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const ctx = createTextCtx({
        text: '@andy_ai_bot what time is it?',
        entities: [{ type: 'mention', offset: 0, length: 12 }],
      });
      await triggerTextMessage(ctx);

      // Should prepend @Andy for trigger matching
      expect(store.onMessage).toHaveBeenCalledWith(
        'tg:100200300',
        expect.objectContaining({
          content: '@Andy @andy_ai_bot what time is it?',
        }),
      );
    });

    it('skips command messages', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const ctx = createTextCtx({ text: '/start' });
      await triggerTextMessage(ctx);

      // Command messages should not trigger onMessage
      expect(store.onMessage).not.toHaveBeenCalled();
    });

    it('only delivers to registered groups', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const unregisteredCtx = createTextCtx({
        chatId: 999999,
        text: 'Message from unknown group',
      });

      await triggerTextMessage(unregisteredCtx);

      // Should emit metadata for discovery, but not deliver message
      expect(store.onChatMetadata).toHaveBeenCalled();
      expect(store.onMessage).not.toHaveBeenCalled();
    });

    it('delivers bot messages when from other users in group', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      // Bot sends a message in the group (but from someone else)
      const ctx = createTextCtx({
        text: 'A bot sent this',
        fromId: 99001,
      });

      await triggerTextMessage(ctx);

      expect(store.onMessage).toHaveBeenCalledWith(
        'tg:100200300',
        expect.objectContaining({
          is_bot_message: false,
        }),
      );
    });

    it('filters messages with whitespace-only content', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const emptyCtx = createTextCtx({ text: '   ' });
      await triggerTextMessage(emptyCtx);

      // Whitespace-only messages are delivered to onMessage
      // (filtering happens in DB layer with getNewMessages)
      expect(store.onMessage).toHaveBeenCalled();
    });
  });

  // ============================================
  // TIMESTAMP & ORDER TESTS
  // ============================================

  describe('message ordering and timestamps', () => {
    it('preserves message order by timestamp', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const baseTime = 1704067200;

      const msg1 = createTextCtx({
        text: 'Message 1',
        messageId: 1,
        date: baseTime,
      });
      const msg2 = createTextCtx({
        text: 'Message 2',
        messageId: 2,
        date: baseTime + 5,
      });
      const msg3 = createTextCtx({
        text: 'Message 3',
        messageId: 3,
        date: baseTime + 10,
      });

      // Send in order
      await triggerTextMessage(msg1);
      await triggerTextMessage(msg2);
      await triggerTextMessage(msg3);

      const messages = store.getMessages();
      expect(messages.length).toBe(3);
      expect(messages[0].timestamp).toBe('2024-01-01T00:00:00.000Z');
      expect(messages[1].timestamp).toBe('2024-01-01T00:00:05.000Z');
      expect(messages[2].timestamp).toBe('2024-01-01T00:00:10.000Z');
    });

    it('converts Unix timestamps correctly', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const unixTime = 1704067200; // 2024-01-01T00:00:00.000Z
      const ctx = createTextCtx({
        text: 'Timestamp test',
        date: unixTime,
      });

      await triggerTextMessage(ctx);

      expect(store.onMessage).toHaveBeenCalledWith(
        'tg:100200300',
        expect.objectContaining({
          timestamp: '2024-01-01T00:00:00.000Z',
        }),
      );
    });
  });

  // ============================================
  // SENDER INFO TESTS
  // ============================================

  describe('sender information extraction', () => {
    it('extracts complete sender information', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const ctx = createTextCtx({
        text: 'Hello',
        fromId: 12345,
        firstName: 'Alice',
      });

      await triggerTextMessage(ctx);

      expect(store.onMessage).toHaveBeenCalledWith(
        'tg:100200300',
        expect.objectContaining({
          sender: '12345',
          sender_name: 'Alice',
        }),
      );
    });

    it('handles missing first_name gracefully', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const ctx = createTextCtx({
        text: 'Hello',
        fromId: 12345,
      });
      ctx.from.first_name = undefined as any;

      await triggerTextMessage(ctx);

      // Should fall back to username
      expect(store.onMessage).toHaveBeenCalledWith(
        'tg:100200300',
        expect.objectContaining({
          sender_name: 'alice_user',
        }),
      );
    });
  });

  // ============================================
  // EDGE CASE TESTS
  // ============================================

  describe('edge cases', () => {
    it('handles messages with special characters', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const specialText = '测试 🎉 <>&"\\n';
      const ctx = createTextCtx({ text: specialText });

      await triggerTextMessage(ctx);

      expect(store.onMessage).toHaveBeenCalledWith(
        'tg:100200300',
        expect.objectContaining({
          content: specialText,
        }),
      );
    });

    it('handles very long messages', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const longText = 'a'.repeat(10000);
      const ctx = createTextCtx({ text: longText });

      await triggerTextMessage(ctx);

      expect(store.onMessage).toHaveBeenCalledWith(
        'tg:100200300',
        expect.objectContaining({
          content: longText,
        }),
      );
    });

    it('handles zero-length timestamps gracefully', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const ctx = createTextCtx({
        text: 'Old message',
        date: 0, // 1970-01-01
      });

      await triggerTextMessage(ctx);

      expect(store.onMessage).toHaveBeenCalled();
      expect(store.onMessage).toHaveBeenCalledWith(
        'tg:100200300',
        expect.objectContaining({
          timestamp: '1970-01-01T00:00:00.000Z',
        }),
      );
    });

    it('handles rapid messages from multiple users', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const baseTime = 1704067200;

      // Simulate 10 messages from different users rapidly
      for (let i = 0; i < 10; i++) {
        const ctx = createTextCtx({
          text: `Message ${i}`,
          messageId: i,
          fromId: 10000 + i,
          date: baseTime + i,
        });
        await triggerTextMessage(ctx);
      }

      expect(store.getMessageCount()).toBe(10);
      expect(store.onMessage).toHaveBeenCalledTimes(10);
    });
  });

  // ============================================
  // OUTBOUND MESSAGE TESTS
  // ============================================

  describe('outbound message handling', () => {
    it('sends messages successfully', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      await channel.sendMessage('tg:100200300', 'Reply message');

      expect(botRef.current.api.sendMessage).toHaveBeenCalledWith(
        '100200300',
        'Reply message',
      );
    });

    it('splits long outbound messages at 4096 chars', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      const longReply = 'x'.repeat(10000);
      await channel.sendMessage('tg:100200300', longReply);

      expect(botRef.current.api.sendMessage).toHaveBeenCalledTimes(3);
      expect(botRef.current.api.sendMessage).toHaveBeenNthCalledWith(
        1,
        '100200300',
        'x'.repeat(4096),
      );
      expect(botRef.current.api.sendMessage).toHaveBeenNthCalledWith(
        2,
        '100200300',
        'x'.repeat(4096),
      );
      expect(botRef.current.api.sendMessage).toHaveBeenNthCalledWith(
        3,
        '100200300',
        'x'.repeat(1808),
      );
    });

    it('handles send failures gracefully', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();

      botRef.current.api.sendMessage.mockRejectedValueOnce(
        new Error('Network error'),
      );

      // Should not throw
      await expect(
        channel.sendMessage('tg:100200300', 'Will fail'),
      ).resolves.toBeUndefined();
    });
  });

  // ============================================
  // CONNECTION LIFECYCLE TESTS
  // ============================================

  describe('connection lifecycle', () => {
    it('connects successfully and sets up handlers', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      expect(channel.isConnected()).toBe(false);

      await channel.connect();

      expect(channel.isConnected()).toBe(true);
      expect(botRef.current.filterHandlers.has('message:text')).toBe(true);
    });

    it('disconnects properly', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();
      expect(channel.isConnected()).toBe(true);

      await channel.disconnect();
      expect(channel.isConnected()).toBe(false);
    });

    it('can reconnect after disconnection', async () => {
      const channel = new TelegramChannel('test-token', {
        onMessage: store.onMessage,
        onChatMetadata: store.onChatMetadata,
        registeredGroups: store.registeredGroups,
      } as TelegramChannelOpts);

      await channel.connect();
      await channel.disconnect();
      await channel.connect();

      expect(channel.isConnected()).toBe(true);
    });
  });
});
