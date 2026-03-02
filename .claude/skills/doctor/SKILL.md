---
name: doctor
description: Run comprehensive health checks on NanoClaw system. Detects build inconsistencies, config mismatches, zombie containers, service issues, and more. Use when troubleshooting any NanoClaw problem or for regular system verification.
---

# NanoClaw System Health Check

Runs automated diagnostics to detect common issues and inconsistencies. This skill performs a comprehensive health check and provides actionable recommendations.

**When to use:**
- User reports "not working" or "no response" issues
- After git reset, branch switch, or major changes
- Regular system verification
- Before deploying to production

**Principle:** Detect issues automatically, provide clear diagnostics, and offer specific fixes. When possible, ask permission and fix problems directly.

## How It Works

1. **Read known issues** from `references/` directory
2. **Run detection scripts** for each known issue (high-severity first)
3. **Report findings** with issue ID, severity, and description
4. **Offer automated fixes** from reference documentation
5. **Generate PR/gist** content on user request

## Known Issues Database

Before running health checks, read all reference files:

```bash
ls .claude/skills/doctor/references/*.md | grep -v README
```

Each reference file contains:
- **Detection script**: How to detect the issue
- **Automated fix**: Script to resolve it
- **PR content**: Ready for upstream contribution
- **Gist content**: For clean repo PRs

Parse the YAML frontmatter to prioritize by severity (critical → high → medium → low).

## Health Check Sequence

Run checks in this order:

### Phase 1: Known Issues Detection

For each reference file (sorted by severity):

1. **Read reference** markdown file
2. **Extract detection script** from `## Detection` section
3. **Execute detection** and capture result
4. **If detected**: Add to findings list with:
   - Issue ID
   - Severity
   - Description (from `## Symptom`)
   - Fix available (from `## Automated Fix`)

### Phase 2: General Health Checks

After known issues, run these general checks.

**Important:** Before running the checks below, also read and execute the architecture integrity checks from `.claude/skills/architecture-review/references/review-checklist.md`. Specifically run:

- **CHECK-03 (Broken Symlinks)**: Detect broken symbolic links in `data/sessions/` that cause skill sync failures (e.g., the `ERR_FS_CP_DIR_TO_NON_DIR` error).
- **CHECK-04 (Orphan Sessions)**: Find session directories for groups no longer registered in the database.
- **CHECK-05 (Mount Path Validation)**: Verify that `config/groups/*.json` mount targets actually exist on disk.

These checks complement the general checks below and should be included in the health check report under a new **Architecture Integrity** line item.

### 1. Build Consistency Check

**Problem:** Stale compiled files in `dist/` that don't match current source code.

```bash
# Check if dist/ exists and is newer than src/
if [ -d dist/ ]; then
  DIST_TIME=$(find dist/ -type f -name "*.js" -printf '%T@\n' | sort -n | tail -1)
  SRC_TIME=$(find src/ -type f -name "*.ts" -printf '%T@\n' | sort -n | tail -1)

  if [ -z "$DIST_TIME" ]; then
    echo "ISSUE: dist/ exists but contains no JS files"
  elif [ -z "$SRC_TIME" ]; then
    echo "WARNING: No TypeScript files in src/"
  else
    # Compare timestamps
    if awk "BEGIN {exit !($SRC_TIME > $DIST_TIME)}"; then
      echo "ISSUE: Source files newer than build (need rebuild)"
    fi
  fi
fi

# Check for orphaned files: files in dist/ without corresponding src/
find dist/ -name "*.js" -not -name "*.test.js" | while read distfile; do
  srcfile="src/$(basename $(dirname $distfile))/$(basename $distfile .js).ts"
  if [ ! -f "$srcfile" ]; then
    echo "ORPHAN: $distfile exists but $srcfile does not (stale build artifact)"
  fi
done
```

**Auto-fix:** If issues found, offer to run `rm -rf dist/ && npm run build`

### 2. Environment Configuration Validation

**Problem:** Environment variables that reference non-existent features.

```bash
# Check .env for inconsistencies
if [ -f .env ]; then
  # Check for TELEGRAM_ONLY but no telegram code
  if grep -q "TELEGRAM_ONLY=true" .env; then
    if [ ! -f src/channels/telegram.ts ]; then
      echo "ISSUE: TELEGRAM_ONLY=true but src/channels/telegram.ts missing"
    fi
  fi

  # Check for TELEGRAM_BOT_TOKEN but no telegram code
  if grep -q "TELEGRAM_BOT_TOKEN=" .env && [ -n "$(grep TELEGRAM_BOT_TOKEN= .env | cut -d= -f2)" ]; then
    if [ ! -f src/channels/telegram.ts ]; then
      echo "WARNING: TELEGRAM_BOT_TOKEN set but Telegram channel not installed"
    fi
  fi

  # Check for auth token
  if ! grep -q "CLAUDE_CODE_OAUTH_TOKEN=sk-" .env && ! grep -q "ANTHROPIC_API_KEY=sk-" .env; then
    echo "ERROR: No authentication configured (missing CLAUDE_CODE_OAUTH_TOKEN or ANTHROPIC_API_KEY)"
  fi
else
  echo "ERROR: .env file missing"
fi
```

**Auto-fix:** Offer to clean up unused env vars or create missing .env

### 3. Service Status Check

```bash
# Check if service is running
if [ "$(uname)" = "Linux" ]; then
  systemctl --user is-active nanoclaw >/dev/null 2>&1 || echo "ISSUE: nanoclaw service not running"
  systemctl --user is-failed nanoclaw >/dev/null 2>&1 && echo "ERROR: nanoclaw service in failed state"
elif [ "$(uname)" = "Darwin" ]; then
  launchctl list | grep -q com.nanoclaw || echo "ISSUE: nanoclaw service not loaded"
fi

# Check for recent errors in logs
if [ -f logs/nanoclaw.log ]; then
  RECENT_ERRORS=$(tail -100 logs/nanoclaw.log | grep -c "ERROR")
  if [ "$RECENT_ERRORS" -gt 5 ]; then
    echo "WARNING: $RECENT_ERRORS errors in last 100 log lines"
  fi
fi
```

### 4. Channel Status Check

**Problem:** Service running but channels not connected.

```bash
if [ -f logs/nanoclaw.log ]; then
  # Check WhatsApp connection
  LAST_WA_EVENT=$(grep -E "Connected to WhatsApp|Connection closed" logs/nanoclaw.log | tail -1)
  echo "WhatsApp: $LAST_WA_EVENT"

  # Check Telegram connection (if exists)
  if [ -f dist/channels/telegram.js ] || [ -f src/channels/telegram.ts ]; then
    LAST_TG_EVENT=$(grep -E "Telegram.*connected|Telegram.*stopped|Telegram.*failed" logs/nanoclaw.log | tail -1)
    echo "Telegram: ${LAST_TG_EVENT:-No events found}"
  fi
fi
```

### 5. Container Health Check

**Problem:** Zombie containers, orphaned containers, or container spawn failures.

```bash
# Check for running nanoclaw containers
RUNNING=$(docker ps --filter "name=nanoclaw-" --format '{{.Names}}' | wc -l)
if [ "$RUNNING" -gt 0 ]; then
  echo "INFO: $RUNNING container(s) currently running"
  docker ps --filter "name=nanoclaw-" --format 'table {{.Names}}\t{{.Status}}\t{{.RunningFor}}'
fi

# Check for stopped/exited containers (potential zombies)
STOPPED=$(docker ps -a --filter "name=nanoclaw-" --filter "status=exited" --format '{{.Names}}' | wc -l)
if [ "$STOPPED" -gt 3 ]; then
  echo "WARNING: $STOPPED stopped containers found (cleanup recommended)"
fi

# Check container image exists
docker images | grep -q nanoclaw-agent || echo "ERROR: nanoclaw-agent image not found (run ./container/build.sh)"

# Check recent container failures
if [ -d groups/ ]; then
  RECENT_FAILS=$(find groups/*/logs/ -name "container-*.log" -mtime -1 -exec grep -l "Exit Code: [1-9]" {} \; | wc -l)
  if [ "$RECENT_FAILS" -gt 0 ]; then
    echo "WARNING: $RECENT_FAILS container failures in last 24h"
  fi
fi
```

**Auto-fix:** Offer to clean up stopped containers: `docker ps -a --filter "name=nanoclaw-" --filter "status=exited" -q | xargs -r docker rm`

### 6. Database vs Filesystem Consistency

**Problem:** Groups registered in DB but folders missing, or vice versa.

```bash
# Get registered groups from DB
DB_GROUPS=$(sqlite3 store/messages.db "SELECT jid, name FROM registered_groups;" 2>/dev/null)

# Check if group folders exist
while IFS='|' read -r jid name; do
  # Try to find corresponding folder in groups/
  FOUND=0
  for dir in groups/*/; do
    if grep -q "$jid" "$dir/CLAUDE.md" 2>/dev/null || grep -q "$name" "$dir/CLAUDE.md" 2>/dev/null; then
      FOUND=1
      break
    fi
  done
  if [ "$FOUND" -eq 0 ]; then
    echo "WARNING: Group '$name' ($jid) registered but folder not clearly identifiable"
  fi
done <<< "$DB_GROUPS"

# Check for orphaned group folders
for dir in groups/*/; do
  folder=$(basename "$dir")
  if [ "$folder" != "global" ] && [ "$folder" != "main" ]; then
    # Check if mentioned in DB
    if ! sqlite3 store/messages.db "SELECT 1 FROM registered_groups WHERE name LIKE '%$folder%' OR jid LIKE '%$folder%';" 2>/dev/null | grep -q 1; then
      echo "INFO: Folder '$folder' exists but may not be registered"
    fi
  fi
done
```

### 7. Network Connectivity Check

**Problem:** API connections failing (especially IPv6 issues).

```bash
# Test Claude API connectivity
echo "Testing Claude API..."
curl -m 5 -s -o /dev/null -w "%{http_code}" https://api.anthropic.com/ || echo "WARNING: Cannot reach api.anthropic.com"

# Test Telegram API if configured
if grep -q "TELEGRAM_BOT_TOKEN=" .env 2>/dev/null; then
  echo "Testing Telegram API..."
  TELEGRAM_TEST=$(curl -4 -m 5 -s -o /dev/null -w "%{http_code}" https://api.telegram.org/)
  if [ "$TELEGRAM_TEST" != "302" ] && [ "$TELEGRAM_TEST" != "200" ]; then
    echo "WARNING: Telegram API unreachable (got $TELEGRAM_TEST)"

    # Check for IPv6 issues
    if curl -6 -m 3 -s https://api.telegram.org/ >/dev/null 2>&1; then
      echo "INFO: IPv6 works"
    else
      echo "ISSUE: IPv6 connection fails (common issue, use IPv4 or disable IPv6)"
    fi
  fi
fi
```

### 8. Recent Activity Analysis

```bash
# Check when last message was processed
if [ -f logs/nanoclaw.log ]; then
  LAST_MSG=$(grep "New messages" logs/nanoclaw.log | tail -1)
  echo "Last message received: ${LAST_MSG:-Never}"

  LAST_CONTAINER=$(grep "Spawning container" logs/nanoclaw.log | tail -1)
  echo "Last container spawned: ${LAST_CONTAINER:-Never}"

  # Check if messages received but no containers spawned
  MSG_COUNT=$(grep "New messages" logs/nanoclaw.log | tail -10 | wc -l)
  CONTAINER_COUNT=$(grep "Spawning container" logs/nanoclaw.log | tail -10 | wc -l)

  if [ "$MSG_COUNT" -gt "$CONTAINER_COUNT" ] && [ "$MSG_COUNT" -gt 2 ]; then
    echo "WARNING: Receiving messages but not spawning containers (trigger pattern issue?)"
  fi
fi
```

### 9. Security Audit

**⚠️ PRIVACY NOTE**: This audit displays user-specific configuration (paths, env vars, group info) on the user's terminal only. It is NOT shared via gist/PR (`pr_ready: false`). Output should remain local.

**Problem:** Users need visibility into security configuration - mounted directories, environment variables, and group permissions.

This audit provides a comprehensive security overview:

- **Mount Allowlist**: Shows which paths are allowed and blocked
- **Group Mounts**: Lists all additional mounts per group, validates paths exist
- **Sensitive File Detection**: Scans mounted directories for SSH keys, credentials, .env files, cloud credentials
- **Environment Variables**: Lists configured variables (values hidden), identifies sensitive keys
- **Permission Analysis**: Documents main vs non-main group privileges
- **Database Audit**: Lists registered groups and checks for configuration gaps

**Important:** Run the security audit from the detection script in [references/security-audit.md](.claude/skills/doctor/references/security-audit.md):

```bash
# Extract the detection script from security-audit.md and execute it
awk '/^```bash$/,/^```$/ {if (!/^```/) print}' .claude/skills/doctor/references/security-audit.md > /tmp/security-audit.sh
chmod +x /tmp/security-audit.sh
/tmp/security-audit.sh
```

The audit checks:

1. Mount allowlist configuration (`~/.config/nanoclaw/mount-allowlist.json`)
2. Group-specific additional mounts from `config/groups/*.json`
3. Sensitive file detection in mounted paths
4. Environment variables from `.env` (keys only, values hidden)
5. Default built-in mounts (documented for transparency)
6. Main group special privileges
7. Registered groups in database
8. Security recommendations

**Output includes:**

- ✓ Items that are properly configured
- ⚠️  Warnings about sensitive files or misconfigurations
- ✗ Errors for missing required configuration
- ℹ️  Informational notes about security model

**Auto-recommendations:** The audit provides actionable steps for:

- Creating/updating mount allowlist
- Fixing `.env` file permissions (should be 600 or 400)
- Removing unnecessary sensitive mounts
- Enabling read-only enforcement for non-main groups
- Reviewing group registrations

### 10. Mount Status Analysis

**Problem:** Groups missing required mounts or mounts pointing to missing directories, causing data isolation issues.

```bash
# Execute the mount status detection script
node .claude/skills/doctor/scripts/check-mounts.cjs

# Show summary of generated references
cat .claude/skills/doctor/references/mount-status.json | grep -A 2 -B 2 "mounts"
```

This exports all JID-specific mount situations into `.claude/skills/doctor/references/mount-status.json` for easy review.

## Health Check Report Format

After running all checks, provide a summary:

```
🏥 NanoClaw Health Check Report
================================

✅ PASSED (N checks)
⚠️  WARNINGS (N issues)
❌ CRITICAL (N errors)

Build Status: [OK/NEEDS_REBUILD/ORPHANED_FILES]
Configuration: [OK/MISMATCHED/MISSING]
Service: [RUNNING/STOPPED/FAILED]
Channels: WhatsApp [CONNECTED/DISCONNECTED], Telegram [N/A]
Containers: [OK/ZOMBIES_DETECTED/IMAGE_MISSING]
Database: [OK/INCONSISTENT]
Network: [OK/DEGRADED]
Architecture Integrity: [OK/BROKEN_SYMLINKS/ORPHAN_SESSIONS]
Security Audit: [OK/WARNINGS_DETECTED/CRITICAL_ISSUES]

Recommendations:
1. [Action 1]
2. [Action 2]
...

For detailed container debugging, run /debug
For security configuration details, review the Security Audit section above
```

## Auto-Fix Options

After report, offer to fix detected issues:

1. **Apply automated fix** from reference (recommended)
2. **Generate PR** for upstream contribution
3. **Create gist** for manual PR from clean repo
4. **Show manual fix** steps

Example interaction:
```
⚠️  [CRITICAL] stale-build-artifacts detected
    Orphaned file: dist/channels/telegram.js

Options:
  1. Fix locally (rm -rf dist/ && npm run build)
  2. Create PR for upstream fix
  3. Create gist for clean repo PR
  4. Show manual steps

Your choice (1/2/3/4):
```

### Option 1: Local Fix

Extract `## Automated Fix` section from reference and execute with user confirmation.

### Option 2: Create PR

For issues with `pr_ready: true`:

1. **Extract PR content** from reference:
   - Title (from `**PR Title:**`)
   - Description (from `**PR Description:**`)
   - Diff (from `**Diff:**`)

2. **Create git branch**:
   ```bash
   git checkout -b fix/issue-id
   ```

3. **Apply patch**:
   ```bash
   # Extract diff from reference, save to /tmp/fix.patch
   git apply /tmp/fix.patch
   ```

4. **Commit**:
   ```bash
   git add -A
   git commit -m "$(cat <<EOF
   <PR Title from reference>

   <PR Description from reference>

   🤖 Generated with Claude Code
   Co-Authored-By: Claude <noreply@anthropic.com>
   EOF
   )"
   ```

5. **Create PR** (if gh CLI available):
   ```bash
   git push -u origin fix/issue-id
   gh pr create --title "<title>" --body "<description>"
   ```

   If `gh` not available, provide push command and GitHub URL.

### Option 3: Create Gist

For clean repo workflows:

1. **Extract gist content** from reference's `## Gist Content` section

2. **Create gist files**:
   ```bash
   mkdir -p /tmp/doctor-gist-$$
   cd /tmp/doctor-gist-$$

   # For each file in gist content
   echo "content" > filename.md
   ```

3. **Create gist** (if gh CLI available):
   ```bash
   gh gist create --public *.md *.patch
   ```

   Returns gist URL.

4. **Provide instructions**:
   ```
   ✅ Gist created: https://gist.github.com/...

   To apply in clean repo:
   1. Clone fresh: git clone <upstream-repo>
   2. Create branch: git checkout -b fix/issue-id
   3. Download patch: curl <gist-url>/raw/... > fix.patch
   4. Apply: git apply fix.patch
   5. Commit and create PR
   ```

### Option 4: Manual Steps

Extract and display `## Manual Fix` section from reference.

## Integration with /debug

When container-specific issues are found, reference the /debug skill:

```
⚠️  Container issues detected.
   Run /debug for detailed container diagnostics including:
   - Log analysis
   - Mount verification
   - Session resumption checks
   - MCP server status
```

## Usage Examples

```bash
# Quick health check
/doctor

# After git operations
git reset --hard
/doctor  # Will detect orphaned dist/ files

# After configuration changes
# Edit .env
/doctor  # Will validate env vars match installed features

# Troubleshooting "bot not responding"
/doctor  # Will check service, channels, containers, network
```
