---
issue_id: stale-build-artifacts
severity: critical
frequency: common
affected_platforms: [linux, macos]
related_commands: [git reset, git checkout, npm run build]
pr_ready: true
---

# Stale Build Artifacts After Git Reset

## Symptom

- Service fails with module import errors
- Features that were deleted still appear to be running
- Environment variables reference non-existent code (e.g., `TELEGRAM_ONLY=true` but no `telegram.ts`)

## Root Cause

When using `git reset --hard` or switching branches, TypeScript source files in `src/` are removed, but compiled JavaScript files in `dist/` persist. The service continues using the old compiled code, creating a mismatch.

## Detection

```bash
# Check for orphaned files: files in dist/ without corresponding src/
find dist/ -name "*.js" -not -name "*.test.js" | while read distfile; do
  # Extract relative path
  relpath=${distfile#dist/}
  srcfile="src/${relpath%.js}.ts"

  if [ ! -f "$srcfile" ]; then
    echo "ORPHAN: $distfile exists but $srcfile does not"
  fi
done

# Check if source is newer than build
DIST_TIME=$(find dist/ -type f -name "*.js" -printf '%T@\n' 2>/dev/null | sort -n | tail -1)
SRC_TIME=$(find src/ -type f -name "*.ts" -printf '%T@\n' 2>/dev/null | sort -n | tail -1)

if [ -n "$DIST_TIME" ] && [ -n "$SRC_TIME" ]; then
  if awk "BEGIN {exit !($SRC_TIME > $DIST_TIME)}"; then
    echo "WARNING: Source files newer than build"
  fi
fi
```

## Automated Fix

```bash
# Safe rebuild
rm -rf dist/
npm run build

# Restart service (Linux)
systemctl --user restart nanoclaw

# Restart service (macOS)
launchctl kickstart -k gui/$(id -u)/com.nanoclaw
```

## Manual Verification

After fix:
```bash
# Verify no orphans
ls dist/channels/*.js | while read f; do
  base=$(basename "$f" .js)
  [ -f "src/channels/${base}.ts" ] || echo "Still orphaned: $f"
done

# Verify service starts
systemctl --user status nanoclaw  # Linux
launchctl list | grep nanoclaw    # macOS
```

## Prevention

Add to `.gitignore` (already should be there):
```
dist/
*.js
*.d.ts
*.js.map
*.d.ts.map
```

Add to build script in `package.json`:
```json
{
  "scripts": {
    "prebuild": "rm -rf dist/",
    "build": "tsc"
  }
}
```

## Related Issues

- Environment variable mismatch (e.g., `TELEGRAM_ONLY` with no telegram code)
- Module not found errors
- Unexpected feature behavior

## Upstream Fix

**PR Title:** `build: always clean dist/ before TypeScript compilation`

**PR Description:**
```markdown
## Problem

When switching git branches or resetting code, `dist/` folder retains stale
compiled JavaScript files even when source TypeScript files are deleted. This
causes the service to run outdated code.

## Solution

Modify `package.json` to always remove `dist/` before compilation:

\`\`\`json
{
  "scripts": {
    "prebuild": "rm -rf dist/",
    "build": "tsc"
  }
}
\`\`\`

## Testing

1. Create a test file: `echo "export const test = 1;" > src/test.ts`
2. Build: `npm run build` → `dist/test.js` created
3. Delete source: `rm src/test.ts`
4. Build again: `npm run build` → `dist/test.js` should be gone
5. Verify: `ls dist/test.js` should fail

## Impact

- Prevents stale build artifacts
- Ensures source-build consistency
- Minimal performance impact (clean compilation is fast)
```

**Files Changed:**
- `package.json`

**Diff:**
```diff
--- a/package.json
+++ b/package.json
@@ -5,6 +5,7 @@
   "type": "module",
   "scripts": {
     "auth": "npx tsx src/auth.ts",
+    "prebuild": "rm -rf dist/",
     "build": "tsc",
     "dev": "npx tsx watch src/index.ts",
     "test": "vitest"
```

## Gist Content

For clean PR submission, create gist with:

**File: `fix-stale-build-artifacts.md`**
```markdown
# Fix: Prevent Stale Build Artifacts

Add `prebuild` script to `package.json`:

\`\`\`json
"prebuild": "rm -rf dist/"
\`\`\`

This ensures compiled JavaScript files are always regenerated from current source.

**Testing:**
\`\`\`bash
echo "export const test = 1;" > src/test.ts
npm run build  # creates dist/test.js
rm src/test.ts
npm run build  # dist/test.js should be removed
\`\`\`
```

**File: `package.json.patch`**
```diff
--- a/package.json
+++ b/package.json
@@ -5,6 +5,7 @@
   "type": "module",
   "scripts": {
     "auth": "npx tsx src/auth.ts",
+    "prebuild": "rm -rf dist/",
     "build": "tsc",
     "dev": "npx tsx watch src/index.ts",
     "test": "vitest"
```
