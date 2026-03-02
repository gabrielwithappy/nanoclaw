---
id: security-audit
severity: medium
description: Security audit for container mounts, environment variables, and group permissions
pr_ready: false
---

# Security Audit for NanoClaw

## Symptom

Users want to review their NanoClaw security configuration to identify potential risks:
- Which directories are mounted into which containers?
- Are any sensitive paths (SSH keys, credentials, tokens) exposed to containers?
- Which environment variables are accessible to containers?
- What's the permission difference between main and non-main groups?
- Are there any unnecessary or overly permissive mounts?

This is a **proactive security review**, not an issue fix. It helps users understand and verify their security posture.

## Detection

The security audit runs automatically as part of the doctor skill's health check. It examines:

1. **Container Mount Configuration** per group
2. **Environment Variables** accessible to containers
3. **Mount Allowlist** validation
4. **Sensitive Path Detection** in mounted directories

```bash
#!/bin/bash

# Security Audit Script for NanoClaw
# This script examines container configuration and reports security-relevant information

echo "=== SECURITY AUDIT ==="
echo ""

# 1. Check mount allowlist configuration
echo "## Mount Allowlist Configuration"
echo ""
ALLOWLIST_PATH="${HOME}/.config/nanoclaw/mount-allowlist.json"
if [ -f "$ALLOWLIST_PATH" ]; then
  echo "✓ Allowlist found at: $ALLOWLIST_PATH"
  echo ""
  echo "Allowed roots:"
  cat "$ALLOWLIST_PATH" | jq -r '.allowedRoots[] | "  - \(.path) (read-write: \(.allowReadWrite)) - \(.description)"'
  echo ""
  echo "Blocked patterns:"
  cat "$ALLOWLIST_PATH" | jq -r '.blockedPatterns[]' | sed 's/^/  - /'
  echo ""
  NON_MAIN_RO=$(cat "$ALLOWLIST_PATH" | jq -r '.nonMainReadOnly')
  echo "Non-main groups read-only: $NON_MAIN_RO"
else
  echo "⚠️  No mount allowlist found at $ALLOWLIST_PATH"
  echo "   Additional mounts are BLOCKED until allowlist is created"
fi
echo ""

# 2. Analyze group configurations
echo "## Group Mount Configuration"
echo ""

if [ -d "config/groups" ]; then
  for group_config in config/groups/*.json; do
    if [ -f "$group_config" ]; then
      GROUP_NAME=$(basename "$group_config" .json)
      echo "### Group: $GROUP_NAME"
      echo ""

      # Check if group has additional mounts
      MOUNT_COUNT=$(cat "$group_config" | jq -r '.additionalMounts | length' 2>/dev/null || echo "0")

      if [ "$MOUNT_COUNT" -gt 0 ]; then
        echo "Additional mounts configured: $MOUNT_COUNT"
        echo ""
        cat "$group_config" | jq -r '.additionalMounts[] | "  Host: \(.hostPath)\n  Container: \(.containerPath)\n  Read-only: \(.readonly)\n"'

        # Validate mount paths exist
        echo "Path validation:"
        cat "$group_config" | jq -r '.additionalMounts[].hostPath' | while read host_path; do
          # Expand ~ to home directory
          EXPANDED_PATH="${host_path/#\~/$HOME}"
          if [ -e "$EXPANDED_PATH" ]; then
            echo "  ✓ $host_path exists"

            # Check for sensitive files in mounted directory
            if [ -d "$EXPANDED_PATH" ]; then
              SENSITIVE_FOUND=""

              # Check for SSH keys
              if find "$EXPANDED_PATH" -type f -name "id_rsa" -o -name "id_ed25519" -o -name "*.pem" 2>/dev/null | grep -q .; then
                SENSITIVE_FOUND="$SENSITIVE_FOUND SSH keys,"
              fi

              # Check for .env files
              if find "$EXPANDED_PATH" -type f -name ".env" -o -name "*.env" 2>/dev/null | grep -q .; then
                SENSITIVE_FOUND="$SENSITIVE_FOUND .env files,"
              fi

              # Check for credential files
              if find "$EXPANDED_PATH" -type f -name "credentials*" -o -name "*secret*" -o -name "*.key" 2>/dev/null | grep -q .; then
                SENSITIVE_FOUND="$SENSITIVE_FOUND credential files,"
              fi

              # Check for AWS/cloud credentials
              if find "$EXPANDED_PATH" -type d -name ".aws" -o -name ".gcloud" -o -name ".azure" 2>/dev/null | grep -q .; then
                SENSITIVE_FOUND="$SENSITIVE_FOUND cloud credentials,"
              fi

              if [ -n "$SENSITIVE_FOUND" ]; then
                echo "  ⚠️  SENSITIVE FILES DETECTED: ${SENSITIVE_FOUND%,}"
              fi
            fi
          else
            echo "  ✗ $host_path does NOT exist"
          fi
        done
      else
        echo "No additional mounts configured"
      fi
      echo ""
    fi
  done
else
  echo "No group configurations found in config/groups/"
  echo ""
fi

# 3. Check environment variables
echo "## Environment Variables"
echo ""

if [ -f ".env" ]; then
  echo "Environment file found: .env"
  echo ""
  echo "Configured variables (values hidden):"

  # Read .env and show keys only (hide values for security)
  grep -v '^#' .env | grep -v '^[[:space:]]*$' | cut -d= -f1 | while read key; do
    echo "  - $key"
  done
  echo ""

  # Check for sensitive keys
  echo "Security assessment:"

  # API tokens/secrets (expected and necessary)
  if grep -q "CLAUDE_CODE_OAUTH_TOKEN" .env || grep -q "ANTHROPIC_API_KEY" .env; then
    echo "  ✓ Claude API authentication configured"
  else
    echo "  ✗ No Claude API authentication found (required)"
  fi

  # Check for potentially sensitive variables
  SENSITIVE_VARS=""

  if grep -qE "^(AWS_|AZURE_|GCP_|GOOGLE_)" .env; then
    SENSITIVE_VARS="$SENSITIVE_VARS cloud credentials,"
  fi

  if grep -qE "^(DB_|DATABASE_)" .env; then
    SENSITIVE_VARS="$SENSITIVE_VARS database credentials,"
  fi

  if grep -qE "^(SSH_|PRIVATE_KEY)" .env; then
    SENSITIVE_VARS="$SENSITIVE_VARS SSH keys,"
  fi

  if [ -n "$SENSITIVE_VARS" ]; then
    echo "  ⚠️  POTENTIALLY SENSITIVE: ${SENSITIVE_VARS%,}"
    echo "     These are passed to containers via stdin (not mounted as files)"
    echo "     Only CLAUDE_CODE_OAUTH_TOKEN and ANTHROPIC_API_KEY are read by default"
  fi
else
  echo "✗ No .env file found"
fi
echo ""

# 4. Default mount security (built-in mounts)
echo "## Default Container Mounts (Built-in)"
echo ""
echo "All groups receive these base mounts:"
echo ""
echo "  1. Group folder: /workspace/group (read-write)"
echo "     - Group's own CLAUDE.md and workspace"
echo "     - Isolated per-group"
echo ""
echo "  2. Claude sessions: /home/node/.claude (read-write)"
echo "     - Stored in data/sessions/{group}/.claude/"
echo "     - Isolated per-group"
echo ""
echo "  3. IPC directory: /workspace/ipc (read-write)"
echo "     - Stored in data/ipc/{group}/"
echo "     - Isolated per-group"
echo ""
echo "  4. Agent runner source: /app/src (read-write)"
echo "     - Stored in data/sessions/{group}/agent-runner-src/"
echo "     - Allows per-group agent customization"
echo ""

# 5. Main group special privileges
echo "## Main Group Special Privileges"
echo ""
if [ -d "groups/main" ]; then
  echo "Main group folder detected: groups/main"
  echo ""
  echo "The 'main' group receives additional privileges:"
  echo "  1. Project root: /workspace/project (READ-ONLY)"
  echo "     - Full NanoClaw source code and configuration"
  echo "     - Can read but NOT modify host application code"
  echo "     - Purpose: Allow introspection and debugging"
  echo ""
  echo "  2. Additional mounts: Can be read-write (if allowlist permits)"
  echo "     - Non-main groups may be forced to read-only"
  echo "     - Controlled by mount-allowlist.json 'nonMainReadOnly' setting"
  echo ""
  echo "⚠️  Security Note:"
  echo "   The main group has elevated privileges. Only use it for"
  echo "   trusted operations and your own personal assistant."
else
  echo "No main group configured"
fi
echo ""

# 6. Database audit
echo "## Registered Groups Audit"
echo ""
if [ -f "store/messages.db" ]; then
  echo "Registered groups in database:"
  sqlite3 store/messages.db "SELECT name, jid, trigger_pattern, requires_trigger FROM registered_groups;" | while IFS='|' read name jid pattern requires; do
    echo "  - $name"
    echo "    JID: $jid"
    echo "    Trigger pattern: ${pattern:-none}"
    echo "    Requires trigger: $requires"
  done
  echo ""

  # Check for groups in DB but no config file
  echo "Checking for configuration gaps:"
  sqlite3 store/messages.db "SELECT name FROM registered_groups;" | while read group_name; do
    SAFE_NAME=$(echo "$group_name" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9-]/-/g')
    CONFIG_FILE="config/groups/${SAFE_NAME}.json"

    if [ ! -f "$CONFIG_FILE" ]; then
      echo "  ⚠️  Group '$group_name' registered but no config at $CONFIG_FILE"
    fi
  done
else
  echo "No database found at store/messages.db"
fi
echo ""

# 7. Summary and recommendations
echo "## Security Recommendations"
echo ""

ISSUES_FOUND=0

# Check 1: Mount allowlist
if [ ! -f "$ALLOWLIST_PATH" ]; then
  echo "1. ⚠️  Create mount allowlist to enable additional mounts:"
  echo "   mkdir -p ~/.config/nanoclaw"
  echo "   # Then create $ALLOWLIST_PATH with your allowed paths"
  ISSUES_FOUND=$((ISSUES_FOUND + 1))
fi

# Check 2: Sensitive paths in mounts
if grep -q "SENSITIVE FILES DETECTED" <(cat "$0" 2>/dev/null) || [ -f config/groups/*.json ]; then
  # This is a placeholder - actual detection happens in the mount loop above
  echo "2. ℹ️  Review any mounted directories containing sensitive files"
  echo "   Ensure they are necessary and have appropriate permissions"
fi

# Check 3: .env file permissions
if [ -f ".env" ]; then
  ENV_PERMS=$(stat -c "%a" .env 2>/dev/null || stat -f "%Lp" .env 2>/dev/null)
  if [ "$ENV_PERMS" != "600" ] && [ "$ENV_PERMS" != "400" ]; then
    echo "3. ⚠️  .env file permissions are $ENV_PERMS (should be 600 or 400)"
    echo "   Fix with: chmod 600 .env"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
fi

# Check 4: Main group
if [ -d "groups/main" ]; then
  echo "4. ℹ️  Main group has elevated privileges (read-only project root)"
  echo "   Only use for trusted operations"
fi

# Check 5: Non-main read-only enforcement
if [ -f "$ALLOWLIST_PATH" ]; then
  NON_MAIN_RO=$(cat "$ALLOWLIST_PATH" | jq -r '.nonMainReadOnly' 2>/dev/null || echo "true")
  if [ "$NON_MAIN_RO" = "false" ]; then
    echo "5. ⚠️  Non-main groups can have read-write mounts"
    echo "   Consider setting 'nonMainReadOnly: true' in allowlist"
    echo "   for defense-in-depth (restrict non-main groups to read-only)"
    ISSUES_FOUND=$((ISSUES_FOUND + 1))
  fi
fi

if [ $ISSUES_FOUND -eq 0 ]; then
  echo "✓ No critical security issues detected"
fi

echo ""
echo "=== END SECURITY AUDIT ==="
```

## Explanation

### What This Audit Checks

1. **Mount Allowlist Configuration**
   - Location: `~/.config/nanoclaw/mount-allowlist.json`
   - Shows which paths are allowed to be mounted
   - Displays blocked patterns (prevents mounting sensitive directories)
   - Reports `nonMainReadOnly` setting

2. **Group-Specific Mounts**
   - Reads `config/groups/*.json` for each group
   - Shows host path → container path mappings
   - Validates that paths exist
   - **Detects sensitive files** in mounted directories:
     - SSH keys (id_rsa, id_ed25519, *.pem)
     - Environment files (.env)
     - Credential files
     - Cloud provider credentials (.aws, .gcloud, .azure)

3. **Environment Variables**
   - Lists all variables from `.env` (without values)
   - Identifies API tokens (expected)
   - Warns about cloud credentials, database passwords, SSH keys
   - Reminds user that only whitelisted vars are read by `readSecrets()`

4. **Default Mount Security**
   - Documents the built-in mounts all containers receive
   - Explains isolation mechanisms (per-group sessions, IPC)

5. **Main Group Privileges**
   - Explains special access to project root (read-only)
   - Notes that main can have read-write mounts (if allowlist permits)

6. **Database Audit**
   - Lists all registered groups from SQLite
   - Checks for groups in DB without config files (consistency)

7. **Recommendations**
   - Actionable suggestions for improving security
   - File permission checks (`.env` should be 600 or 400)
   - Highlights any detected risks

### Security Principles

- **Defense in Depth**: Multiple layers (allowlist, blocked patterns, path validation)
- **Least Privilege**: Non-main groups can be forced read-only
- **Visibility**: Audit makes security configuration transparent
- **No Secrets in Logs**: Environment values are hidden, only keys shown
- **Proactive Detection**: Scans for sensitive files automatically

### How to Use

The security audit runs automatically when `/doctor` is invoked. Users can:

1. **Review the output** to understand what's mounted and where
2. **Check for warnings** about sensitive files or permissions
3. **Follow recommendations** to improve security posture
4. **Run regularly** (e.g., after adding new groups or mounts)

### Integration with Doctor Skill

This audit is integrated into the doctor skill as a new health check phase:

```bash
# In SKILL.md, add to health check sequence:
echo "=== Running Security Audit ==="
bash .claude/skills/doctor/references/security-audit.md
```

The script output is parsed and included in the health check report under a new section:

```
Security Audit: [OK/WARNINGS_DETECTED/CRITICAL_ISSUES]
```

### Example Output

```
=== SECURITY AUDIT ===

## Mount Allowlist Configuration

✓ Allowlist found at: /home/user/.config/nanoclaw/mount-allowlist.json

Allowed roots:
  - ~/projects (read-write: true) - Development projects
  - ~/Documents/work (read-write: false) - Work documents

Blocked patterns:
  - .ssh
  - .aws
  - credentials
  - .env

Non-main groups read-only: true

## Group Mount Configuration

### Group: main

Additional mounts configured: 1

  Host: ~/documents/work-nanoclaw/nanoclawKMS/
  Container: nanoclawKMS
  Read-only: false

Path validation:
  ✓ ~/documents/work-nanoclaw/nanoclawKMS/ exists

### Group: sung-video

No additional mounts configured

## Environment Variables

Environment file found: .env

Configured variables (values hidden):
  - CLAUDE_CODE_OAUTH_TOKEN
  - ASSISTANT_NAME
  - ASSISTANT_HAS_OWN_NUMBER

Security assessment:
  ✓ Claude API authentication configured

## Default Container Mounts (Built-in)

All groups receive these base mounts:

  1. Group folder: /workspace/group (read-write)
     - Group's own CLAUDE.md and workspace
     - Isolated per-group

  2. Claude sessions: /home/node/.claude (read-write)
     - Stored in data/sessions/{group}/.claude/
     - Isolated per-group

  3. IPC directory: /workspace/ipc (read-write)
     - Stored in data/ipc/{group}/
     - Isolated per-group

  4. Agent runner source: /app/src (read-write)
     - Stored in data/sessions/{group}/agent-runner-src/
     - Allows per-group agent customization

## Main Group Special Privileges

Main group folder detected: groups/main

The 'main' group receives additional privileges:
  1. Project root: /workspace/project (READ-ONLY)
     - Full NanoClaw source code and configuration
     - Can read but NOT modify host application code
     - Purpose: Allow introspection and debugging

  2. Additional mounts: Can be read-write (if allowlist permits)
     - Non-main groups may be forced to read-only
     - Controlled by mount-allowlist.json 'nonMainReadOnly' setting

⚠️  Security Note:
   The main group has elevated privileges. Only use it for
   trusted operations and your own personal assistant.

## Registered Groups Audit

Registered groups in database:
  - Main
    JID: 120363123456789012@g.us
    Trigger pattern:
    Requires trigger: 0
  - Sung Video
    JID: 987654321098765432@g.us
    Trigger pattern: @Andy
    Requires trigger: 1

## Security Recommendations

4. ℹ️  Main group has elevated privileges (read-only project root)
   Only use for trusted operations

✓ No critical security issues detected

=== END SECURITY AUDIT ===
```

## Automated Fix

Not applicable - this is an audit/reporting tool, not a fix.

Users should manually review the output and take action based on recommendations.

## Manual Steps

If the user wants to improve security based on audit findings:

1. **Create/update mount allowlist**:
   ```bash
   mkdir -p ~/.config/nanoclaw
   # Edit allowlist to restrict paths
   ```

2. **Fix .env permissions**:
   ```bash
   chmod 600 .env
   ```

3. **Remove sensitive mounts**:
   - Edit `config/groups/{group}.json`
   - Remove or make read-only any mounts containing sensitive files

4. **Enable non-main read-only**:
   - Edit `~/.config/nanoclaw/mount-allowlist.json`
   - Set `"nonMainReadOnly": true`

5. **Review group registrations**:
   - Check that all groups in database are intentional
   - Remove any orphaned groups

## Notes

- This audit is **informational**, not a blocker
- Warnings don't prevent NanoClaw from running
- Users should review regularly, especially after configuration changes
- The audit helps users understand the security model and make informed decisions
