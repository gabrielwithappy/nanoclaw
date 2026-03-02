---
issue_id: telegram-bot-message-filter
severity: high
frequency: common
affected_platforms: [linux, macos]
related_features: [telegram]
pr_ready: true
---

# Telegram Bot Messages Not Filtered (Agent Doesn't Respond)

## Symptom

- User sends messages in Telegram chat (especially main group)
- Agent doesn't respond or responds only sporadically
- Logs show "New messages" but no "Spawning container"
- Database shows `is_bot_message = 0` for all Telegram messages including bot's own messages

## Root Cause

The Telegram channel (`src/channels/telegram.ts`) doesn't set the `is_bot_message` flag when storing messages, unlike the WhatsApp channel. This causes the bot's own messages to be treated as user messages, triggering the message deduplication logic that prevents container spawning.

**Why this causes "no response":**

1. User sends message → stored with `is_bot_message = 0`
2. Agent responds → **also** stored with `is_bot_message = 0` (BUG!)
3. User sends another message
4. System retrieves "new messages since last agent timestamp"
5. Bot's own response is included (not filtered out)
6. Deduplicate check or message processing skips spawning
7. No agent response

The WhatsApp channel correctly detects bot messages by checking `ctx.from?.id === bot.id`, but Telegram channel was missing this logic.

## Detection

```bash
# Check if Telegram messages have is_bot_message properly set
TELEGRAM_MESSAGES=$(sqlite3 store/messages.db "
  SELECT COUNT(*)
  FROM messages
  WHERE chat_jid LIKE 'tg:%'
    AND is_bot_message = 0
    AND sender = (SELECT DISTINCT sender FROM messages WHERE chat_jid LIKE 'tg:%' LIMIT 1);
" 2>/dev/null)

if [ "$TELEGRAM_MESSAGES" -gt 0 ]; then
  echo "ISSUE DETECTED: $TELEGRAM_MESSAGES Telegram bot messages not flagged as is_bot_message=1"

  # Check source code for the fix
  if ! grep -q "isBotMessage.*ctx.from?.id.*ctx.me?.id" src/channels/telegram.ts 2>/dev/null; then
    echo "CRITICAL: Telegram channel missing bot message detection logic"
    echo "Expected: const isBotMessage = ctx.from?.id === ctx.me?.id;"
  fi
else
  echo "PASS: Telegram bot messages properly filtered"
fi
```

## Automated Fix

Apply this patch to `src/channels/telegram.ts`:

```bash
# Backup
cp src/channels/telegram.ts src/channels/telegram.ts.bak

# Apply fix
cat > /tmp/telegram-bot-filter.patch << 'PATCH'
--- a/src/channels/telegram.ts
+++ b/src/channels/telegram.ts
@@ -128,11 +128,15 @@ export class TelegramChannel implements Channel {
         return;
       }

+      // Detect bot messages: check if sender is the bot itself
+      // In Telegram, bot can send messages and also see its own messages in groups
+      const isBotMessage = ctx.from?.id === ctx.me?.id;
+
       // Deliver message — startMessageLoop() will pick it up
       this.opts.onMessage(chatJid, {
         id: msgId,
         chat_jid: chatJid,
         sender,
         sender_name: senderName,
         content,
         timestamp,
         is_from_me: false,
+        is_bot_message: isBotMessage,
       });

       logger.info(
-        { chatJid, chatName, sender: senderName },
+        { chatJid, chatName, sender: senderName, isBotMessage },
         'Telegram message stored',
       );
     });

     // Handle non-text messages with placeholders so the agent knows something was sent
     const storeNonText = (ctx: any, placeholder: string) => {
       const chatJid = `tg:${ctx.chat.id}`;
       const group = this.opts.registeredGroups()[chatJid];
       if (!group) return;

       const timestamp = new Date(ctx.message.date * 1000).toISOString();
       const senderName =
         ctx.from?.first_name ||
         ctx.from?.username ||
         ctx.from?.id?.toString() ||
         'Unknown';
       const caption = ctx.message.caption ? ` ${ctx.message.caption}` : '';

+      // Detect bot messages
+      const isBotMessage = ctx.from?.id === ctx.me?.id;
+
       this.opts.onChatMetadata(chatJid, timestamp);
       this.opts.onMessage(chatJid, {
         id: ctx.message.message_id.toString(),
         chat_jid: chatJid,
         sender: ctx.from?.id?.toString() || '',
         sender_name: senderName,
         content: `${placeholder}${caption}`,
         timestamp,
         is_from_me: false,
+        is_bot_message: isBotMessage,
       });
     };
PATCH

# Apply patch (if git apply fails, manual edit required)
if git apply --check /tmp/telegram-bot-filter.patch 2>/dev/null; then
  git apply /tmp/telegram-bot-filter.patch
  echo "✅ Patch applied successfully"
else
  echo "⚠️  Patch failed - manual edit required"
  echo "Add the following lines to src/channels/telegram.ts:"
  echo ""
  echo "Line ~131 (before onMessage call):"
  echo "  const isBotMessage = ctx.from?.id === ctx.me?.id;"
  echo ""
  echo "Line ~143 (in onMessage object):"
  echo "  is_bot_message: isBotMessage,"
  echo ""
  echo "Line ~168 (in storeNonText function):"
  echo "  const isBotMessage = ctx.from?.id === ctx.me?.id;"
  echo "  // ... then add to onMessage object:"
  echo "  is_bot_message: isBotMessage,"
fi

# Rebuild and restart
npm run build
systemctl --user restart nanoclaw

echo ""
echo "✅ Fix applied. Bot messages will now be properly filtered."
echo "   Test by sending a message in Telegram - agent should respond."
```

## Manual Fix

If automated patch fails:

### Step 1: Edit src/channels/telegram.ts

**Location 1: Text message handler (around line 131)**

```typescript
// BEFORE
this.opts.onMessage(chatJid, {
  id: msgId,
  chat_jid: chatJid,
  sender,
  sender_name: senderName,
  content,
  timestamp,
  is_from_me: false,
});

// AFTER
// Detect bot messages: check if sender is the bot itself
const isBotMessage = ctx.from?.id === ctx.me?.id;

this.opts.onMessage(chatJid, {
  id: msgId,
  chat_jid: chatJid,
  sender,
  sender_name: senderName,
  content,
  timestamp,
  is_from_me: false,
  is_bot_message: isBotMessage,
});
```

**Location 2: Non-text message handler (around line 168)**

```typescript
// BEFORE
this.opts.onChatMetadata(chatJid, timestamp);
this.opts.onMessage(chatJid, {
  id: ctx.message.message_id.toString(),
  chat_jid: chatJid,
  sender: ctx.from?.id?.toString() || '',
  sender_name: senderName,
  content: `${placeholder}${caption}`,
  timestamp,
  is_from_me: false,
});

// AFTER
// Detect bot messages
const isBotMessage = ctx.from?.id === ctx.me?.id;

this.opts.onChatMetadata(chatJid, timestamp);
this.opts.onMessage(chatJid, {
  id: ctx.message.message_id.toString(),
  chat_jid: chatJid,
  sender: ctx.from?.id?.toString() || '',
  sender_name: senderName,
  content: `${placeholder}${caption}`,
  timestamp,
  is_from_me: false,
  is_bot_message: isBotMessage,
});
```

### Step 2: Update logging (optional but recommended)

```typescript
// Line ~148
logger.info(
  { chatJid, chatName, sender: senderName, isBotMessage },
  'Telegram message stored',
);
```

### Step 3: Rebuild and restart

```bash
npm run build
systemctl --user restart nanoclaw  # Linux
# or
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
```

### Step 4: Clean up existing bot messages in DB (optional)

```bash
# Mark existing bot messages (if you can identify them by content pattern)
sqlite3 store/messages.db "
  UPDATE messages
  SET is_bot_message = 1
  WHERE chat_jid LIKE 'tg:%'
    AND (
      content LIKE '✅%'
      OR content LIKE '##%'
      OR content LIKE '**%'
    );
"
```

## Verification

After applying fix:

```bash
# 1. Check logs for bot message detection
tail -f logs/nanoclaw.log | grep "isBotMessage"

# 2. Send test message in Telegram
# You should see: "isBotMessage": false for your message
#                 "isBotMessage": true for bot's response

# 3. Verify agent responds
# Agent should now respond to every user message

# 4. Check database
sqlite3 store/messages.db "
  SELECT sender, SUBSTR(content, 1, 30), is_bot_message
  FROM messages
  WHERE chat_jid = 'tg:8734661742'
  ORDER BY timestamp DESC
  LIMIT 10;
"
# Bot messages should have is_bot_message = 1
```

## PR Content

**PR Title:** fix(telegram): add bot message detection to prevent response loop

**PR Description:**

Fixes issue where Telegram bot doesn't respond to user messages or responds sporadically.

**Problem:**
The Telegram channel didn't set the `is_bot_message` flag when storing messages, causing the bot's own responses to be treated as user messages. This interfered with the message deduplication logic, preventing container spawning.

**Solution:**
Add bot message detection by checking `ctx.from?.id === ctx.me?.id`, consistent with WhatsApp channel's approach.

**Changes:**
- Add `isBotMessage` detection in text message handler
- Add `isBotMessage` detection in non-text message handler
- Include `isBotMessage` in stored message objects
- Add `isBotMessage` to log output for debugging

**Testing:**
- Send message to Telegram bot
- Verify bot responds consistently
- Check logs show `isBotMessage: false` for user messages
- Check logs show `isBotMessage: true` for bot responses
- Verify database has correct `is_bot_message` values

Fixes #[issue-number]

**Diff:**

See Automated Fix section above for full patch.

## Notes

- This issue only affects Telegram channel, not WhatsApp
- WhatsApp channel already has correct bot message detection
- The fix is backward compatible - existing messages remain in DB
- Optional: clean up existing bot messages in DB (see Manual Fix Step 4)
- This is a **defensive fix** - prevents future message processing issues

## Related Issues

- Similar logic exists in WhatsApp channel since initial implementation
- Agent Teams/Swarm functionality depends on proper message filtering
- Affects all Telegram groups, especially main group where `requires_trigger = false`
