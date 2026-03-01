---
issue_id: apple-container-on-linux
severity: critical
frequency: rare
affected_platforms: [linux]
related_commands: [/convert-to-apple-container, systemctl restart]
pr_ready: true
---

# Apple Container Check Running on Linux

## Symptom

Service fails to start on Linux with error:
```
FATAL: Apple Container system failed to start
Error: Apple Container system is required but failed to start
```

## Root Cause

The `/convert-to-apple-container` skill adds an `ensureContainerSystemRunning()` check that runs unconditionally in `main()`. This check executes `container system status` and `container system start`, which only exist on macOS with Apple Container installed.

On Linux, this causes immediate startup failure.

## Detection

```bash
# Check if ensureContainerSystemRunning is called unconditionally
grep -A2 "async function main" src/index.ts | grep -q "ensureContainerSystemRunning()" && \
! grep -B2 "ensureContainerSystemRunning()" src/index.ts | grep -q "platform.*darwin"

# Check platform
if [ "$(uname)" = "Linux" ]; then
  echo "Running on Linux - Apple Container check should be conditional"
fi

# Check logs for the error
grep "Apple Container system is required" logs/nanoclaw.log && echo "DETECTED: Apple Container error on Linux"
```

## Automated Fix

```bash
# Option 1: Make it platform-conditional (recommended)
# Edit src/index.ts to wrap the call:

# Before:
# async function main(): Promise<void> {
#   ensureContainerSystemRunning();

# After:
# async function main(): Promise<void> {
#   if (process.platform === 'darwin') {
#     ensureContainerSystemRunning();
#   }
```

Automated patch:
```typescript
// In src/index.ts
async function main(): Promise<void> {
  // Only check Apple Container on macOS
  if (process.platform === 'darwin') {
    ensureContainerSystemRunning();
  }
  initDatabase();
  // ... rest of function
}
```

## Manual Fix

Edit `src/index.ts`:

```typescript
async function main(): Promise<void> {
  // Only check Apple Container on macOS
  if (process.platform === 'darwin') {
    ensureContainerSystemRunning();
  }
  initDatabase();
  logger.info('Database initialized');
  // ...
}
```

Then rebuild:
```bash
npm run build
systemctl --user restart nanoclaw
```

## Verification

```bash
# Should start successfully on Linux
systemctl --user status nanoclaw

# Should not see Apple Container errors
tail -50 logs/nanoclaw.log | grep -i "apple container"
```

## Prevention

The `/convert-to-apple-container` skill should add this check conditionally from the start, or document that it's macOS-only.

## Upstream Fix

**PR Title:** `fix(container): only check Apple Container on macOS`

**PR Description:**
```markdown
## Problem

After applying `/convert-to-apple-container` skill on macOS, the code adds
`ensureContainerSystemRunning()` call unconditionally in `main()`. When the
same codebase is used on Linux (e.g., after git push/pull), the service fails
to start because `container system` commands don't exist on Linux.

## Solution

Wrap the Apple Container check with platform detection:

\`\`\`typescript
if (process.platform === 'darwin') {
  ensureContainerSystemRunning();
}
\`\`\`

## Testing

**On Linux:**
\`\`\`bash
npm run build
systemctl --user restart nanoclaw
systemctl --user status nanoclaw  # Should be active (running)
\`\`\`

**On macOS:**
\`\`\`bash
npm run build
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
launchctl list | grep nanoclaw  # Should show PID
\`\`\`

## Impact

- Linux users can run NanoClaw without Apple Container errors
- macOS behavior unchanged (still checks/starts Apple Container)
- Cross-platform compatibility restored
```

**Files Changed:**
- `src/index.ts`

**Diff:**
```diff
--- a/src/index.ts
+++ b/src/index.ts
@@ -458,7 +458,10 @@ function ensureContainerSystemRunning(): void {
 }

 async function main(): Promise<void> {
-  ensureContainerSystemRunning();
+  // Only check Apple Container on macOS
+  if (process.platform === 'darwin') {
+    ensureContainerSystemRunning();
+  }
   initDatabase();
   logger.info('Database initialized');
   loadState();
```

## Gist Content

**File: `fix-apple-container-linux.md`**
```markdown
# Fix: Apple Container Check on Linux

## Problem
Service fails on Linux with "Apple Container system is required" error.

## Solution
Make Apple Container check platform-specific in `src/index.ts`:

\`\`\`typescript
async function main(): Promise<void> {
  // Only check Apple Container on macOS
  if (process.platform === 'darwin') {
    ensureContainerSystemRunning();
  }
  initDatabase();
  // ...
}
\`\`\`

## Apply
\`\`\`bash
# Edit src/index.ts with the change above, then:
npm run build
systemctl --user restart nanoclaw  # Linux
# or
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # macOS
\`\`\`
```

**File: `src-index.patch`**
```diff
--- a/src/index.ts
+++ b/src/index.ts
@@ -458,7 +458,10 @@ function ensureContainerSystemRunning(): void {
 }

 async function main(): Promise<void> {
-  ensureContainerSystemRunning();
+  // Only check Apple Container on macOS
+  if (process.platform === 'darwin') {
+    ensureContainerSystemRunning();
+  }
   initDatabase();
   logger.info('Database initialized');
```

## Related

This issue occurs when:
1. `/convert-to-apple-container` skill applied on macOS
2. Code committed to git
3. Pulled on Linux machine
4. Service fails because Linux doesn't have `container` binary
