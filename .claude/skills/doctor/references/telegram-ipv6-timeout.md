---
issue_id: telegram-ipv6-timeout
severity: high
frequency: common
affected_platforms: [linux, macos]
related_features: [telegram]
pr_ready: true
---

# Telegram API IPv6 Connection Timeout

## Symptom

- Telegram bot doesn't respond to messages
- Logs show: `Failed to send Telegram message`, `Network request for 'sendMessage' failed`, `ETIMEDOUT`
- Manual `curl` test shows IPv6 connection fails but IPv4 works:
  ```bash
  curl -6 -m 5 https://api.telegram.org/  # Times out
  curl -4 -m 5 https://api.telegram.org/  # Works (HTTP 302)
  ```

## Root Cause

Node.js's `fetch` (and `node-fetch`) resolves `api.telegram.org` to both IPv4 and IPv6 addresses, then attempts IPv6 first. On systems with broken IPv6 routing (common on some ISPs, VPNs, or datacenter networks), the IPv6 connection hangs, causing timeout.

The `grammy` library uses standard fetch internally, so it inherits this behavior.

## Detection

```bash
# Test DNS resolution
node -e "const dns = require('dns'); dns.lookup('api.telegram.org', { all: true }, (err, addrs) => console.log(addrs));"
# Should show both IPv4 (family: 4) and IPv6 (family: 6)

# Test IPv6 connectivity
curl -6 -m 5 https://api.telegram.org/ && echo "IPv6 OK" || echo "IPv6 FAILED"

# Test IPv4 connectivity
curl -4 -m 5 https://api.telegram.org/ && echo "IPv4 OK" || echo "IPv4 FAILED"

# If IPv4 works but IPv6 fails → this is the issue

# Check logs
grep -E "ETIMEDOUT|sendMessage failed|Network request.*failed" logs/nanoclaw.log
```

## Automated Fix

Apply IPv4 hardcoding to `src/channels/telegram.ts`:

```typescript
import { Bot } from 'grammy';
// @ts-ignore
import fetch from 'node-fetch';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
// ... other imports

export class TelegramChannel implements Channel {
  // ... existing code

  async connect(): Promise<void> {
    this.bot = new Bot(this.botToken, {
      client: {
        timeoutSeconds: 60,
        baseFetchConfig: { compress: true, agent: false },
      },
      botInfo: undefined,
    });

    // IPv4 hardcoding to avoid IPv6 timeout issues
    // @ts-ignore
    this.bot.api.config.use(async (prev, method, payload) => {
      const url = `https://149.154.166.110/bot${this.botToken}/${method}`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Host': 'api.telegram.org',
        },
        body: JSON.stringify(payload),
        timeout: 60000,
      });
      return response.json();
    });

    // ... rest of connect() method
  }
}
```

**Key points:**
- Use IP address `149.154.166.110` (Telegram's IPv4 address) directly
- Keep `Host: api.telegram.org` header for proper SSL/TLS validation
- Override `grammy`'s default API client with custom fetch

## Manual Fix

1. Edit `src/channels/telegram.ts`
2. Add `import fetch from 'node-fetch';` at top (with `// @ts-ignore` above it)
3. Modify `connect()` method as shown above
4. Rebuild and restart:
   ```bash
   npm run build
   systemctl --user restart nanoclaw  # Linux
   # or
   launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
   ```

## Verification

```bash
# Send a message to your bot in Telegram
# Check logs for successful send
tail -f logs/nanoclaw.log | grep -E "Telegram message sent|Telegram.*connected"

# Should see:
# [INFO] Telegram bot connected
# [INFO] Telegram message sent
```

## Alternative Solutions

### Option 1: Disable IPv6 System-Wide (Not Recommended)

```bash
# Linux (temporary)
sudo sysctl -w net.ipv6.conf.all.disable_ipv6=1
sudo sysctl -w net.ipv6.conf.default.disable_ipv6=1

# Permanent
echo "net.ipv6.conf.all.disable_ipv6 = 1" | sudo tee -a /etc/sysctl.conf
echo "net.ipv6.conf.default.disable_ipv6 = 1" | sudo tee -a /etc/sysctl.conf
sudo sysctl -p
```

**Downside:** Affects all applications, may break IPv6-only services.

### Option 2: DNS-level Fix

Edit `/etc/gai.conf` to prefer IPv4:
```bash
sudo sed -i 's/^#precedence ::ffff:0:0\/96  100/precedence ::ffff:0:0\/96  100/' /etc/gai.conf
```

**Downside:** Node.js may ignore this (uses libuv, not always glibc).

### Option 3: Use Telegram API Proxy

Run local proxy that forces IPv4. **Complex, not recommended.**

## Upstream Fix

**PR Title:** `fix(telegram): use IPv4 for api.telegram.org to avoid IPv6 timeouts`

**PR Description:**
```markdown
## Problem

On networks with broken IPv6 routing, the Telegram bot fails to send messages
with ETIMEDOUT errors. Node.js fetch tries IPv6 first, causing 30-60 second
timeouts before falling back to IPv4 (which may never happen due to grammy's
own timeout).

Testing shows:
\`\`\`bash
curl -6 https://api.telegram.org/  # Timeout
curl -4 https://api.telegram.org/  # Works
\`\`\`

## Solution

Hardcode Telegram's IPv4 address (149.154.166.110) in API calls while keeping
`Host: api.telegram.org` header for TLS validation. This bypasses DNS IPv6
resolution entirely.

\`\`\`typescript
this.bot.api.config.use(async (prev, method, payload) => {
  const url = \`https://149.154.166.110/bot\${this.botToken}/\${method}\`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': 'api.telegram.org',
    },
    body: JSON.stringify(payload),
    timeout: 60000,
  });
  return response.json();
});
\`\`\`

## Testing

**Before fix:**
\`\`\`bash
# Bot doesn't respond, logs show ETIMEDOUT
grep ETIMEDOUT logs/nanoclaw.log
\`\`\`

**After fix:**
\`\`\`bash
# Send message in Telegram
# Check logs
tail logs/nanoclaw.log | grep "Telegram message sent"
# Should see successful send within 1-2 seconds
\`\`\`

## Impact

- Fixes Telegram on networks with broken IPv6
- No impact on IPv6-working networks (IPv4 still works)
- Slight dependency on Telegram's IPv4 address stability (very stable in practice)
```

**Files Changed:**
- `src/channels/telegram.ts`

**Diff:**
```diff
--- a/src/channels/telegram.ts
+++ b/src/channels/telegram.ts
@@ -1,4 +1,6 @@
 import { Bot } from 'grammy';
+// @ts-ignore
+import fetch from 'node-fetch';

 import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
 import { logger } from '../logger.js';
@@ -28,7 +30,27 @@ export class TelegramChannel implements Channel {
   }

   async connect(): Promise<void> {
-    this.bot = new Bot(this.botToken);
+    this.bot = new Bot(this.botToken, {
+      client: {
+        timeoutSeconds: 60,
+        baseFetchConfig: { compress: true, agent: false },
+      },
+      botInfo: undefined,
+    });
+
+    // IPv4 hardcoding to avoid IPv6 timeout issues
+    // @ts-ignore
+    this.bot.api.config.use(async (prev, method, payload) => {
+      const url = \`https://149.154.166.110/bot\${this.botToken}/\${method}\`;
+      const response = await fetch(url, {
+        method: 'POST',
+        headers: {
+          'Content-Type': 'application/json',
+          'Host': 'api.telegram.org',
+        },
+        body: JSON.stringify(payload),
+        timeout: 60000,
+      });
+      return response.json();
+    });

     // Command to get chat ID (useful for registration)
```

## Gist Content

**File: `fix-telegram-ipv6-timeout.md`**
```markdown
# Fix: Telegram IPv6 Timeout

## Problem
Telegram bot fails with ETIMEDOUT on networks with broken IPv6 routing.

## Detection
\`\`\`bash
curl -6 -m 5 https://api.telegram.org/  # Timeout
curl -4 -m 5 https://api.telegram.org/  # Works
\`\`\`

## Solution
Use IPv4 address directly in `src/channels/telegram.ts`:

\`\`\`typescript
import fetch from 'node-fetch';

async connect(): Promise<void> {
  this.bot = new Bot(this.botToken, {
    client: { timeoutSeconds: 60 },
  });

  // IPv4 hardcoding
  this.bot.api.config.use(async (prev, method, payload) => {
    const url = \`https://149.154.166.110/bot\${this.botToken}/\${method}\`;
    return await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': 'api.telegram.org',
      },
      body: JSON.stringify(payload),
      timeout: 60000,
    }).then(r => r.json());
  });
}
\`\`\`

## Apply
\`\`\`bash
npm run build
systemctl --user restart nanoclaw
\`\`\`
```

**File: `telegram-ipv4.patch`**
```diff
--- a/src/channels/telegram.ts
+++ b/src/channels/telegram.ts
@@ -1,4 +1,6 @@
 import { Bot } from 'grammy';
+// @ts-ignore
+import fetch from 'node-fetch';

 import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
```

## IP Address Stability

Telegram's IPv4 address `149.154.166.110` is part of their stable API infrastructure. If it changes (rare), fallback to DNS-based approach or update the IP.

To find current IP:
```bash
dig +short api.telegram.org A
# Returns: 149.154.166.110
```
