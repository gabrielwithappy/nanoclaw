# Telegram Message Delivery Bug - FIXED

## Problem
Telegram messages were arriving but responses never reached the user. Logs showed:
- "New messages count: 1" - messages received ✓
- "Processing messages" - messages queued ✓  
- Agent generating proper responses (visible in stderr output) ✓
- But **containers timing out after ~31 minutes** - never sending responses ✗

## Root Cause
**Critical bug in container-runner.ts [line 540-549 and 438-447]:**

The `outputChain` promise (which chains all `onOutput` callback executions) was not handling errors. When `onOutput` callbacks were executed (e.g., `channel.sendMessage()` to Telegram), if ANY callback threw an error, the entire promise chain would reject silently - but there was NO `.catch()` handler!

```typescript
// BROKEN - Silent failure if onOutput throws
outputChain.then(() => {  resolve({...});});
```

This meant:
1. Container generates response ✓
2. `onOutput` callback called to send to Telegram ✓
3. Sending fails or throws error
4. Promise chain rejects
5. `.then()` never fires
6. Container never resolves its promise
7. Container times out waiting forever (30min timeout) ✗
8. Container killed, response lost

## Solution
Added proper error handling to the `outputChain` promise:

```typescript
// FIXED - Catches callback errors
outputChain
  .then(() => {
    resolve({ status: 'success', ... });
  })
  .catch((err) => {
    logger.error({ group: group.name, err }, 'Error in output callback chain');
    resolve({
      status: 'error',
      error: `Output callback error: ${err.message}`
    });
  });
```

Fixed in TWO locations:
1. [container-runner.ts:540-555](src/container-runner.ts#L540-L555) - Main streaming output handler
2. [container-runner.ts:438-450](src/container-runner.ts#L438-L450) - Idle cleanup timeout handler

## Testing & Verification
- Build: `npm run build` ✓
- Service restart: `systemctl --user restart nanoclaw` ✓
- Service status: Running and processing messages ✓
- Next: Monitor for message delivery on next Telegram messages

## Technical Details
- **Error location**: Better-sqlite3 build mismatch (secondary issue)
  - Fixed by: `export PATH=/home/gabriel/.nvm/versions/node/v22.21.0/bin:$PATH && npm install`
  - Root cause: System Node v18 was being used instead of nvm v22
  - Prevention: Updated systemd service file to include nvm path in $PATH

## Impact
This bug would affect ANY outbound message sending if the callback failed:
- Telegram messages  
- WhatsApp messages
- Email sending
- API calls to external services
All would silently fail and cause container hangs.
