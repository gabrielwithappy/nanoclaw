# Doctor References - Known Issues Database

This directory contains structured documentation for known NanoClaw issues, their detection methods, automated fixes, and upstream PR content.

## Purpose

- **Automated Diagnosis**: `/doctor` skill reads these files to detect and fix problems automatically
- **PR Generation**: Each reference includes PR-ready content for upstream contributions
- **Gist Creation**: Structured for easy gist generation for clean git workflows
- **Knowledge Base**: Historical record of common issues and solutions

## File Format

Each reference file follows this structure:

```markdown
---
issue_id: unique-identifier
severity: critical | high | medium | low
frequency: common | occasional | rare
affected_platforms: [linux, macos, windows]
related_features: [telegram, whatsapp, containers]
pr_ready: true | false
---

# Issue Title

## Symptom
User-visible symptoms and error messages

## Root Cause
Technical explanation of what causes the issue

## Detection
Automated detection scripts (bash/typescript)

## Automated Fix
Scripts for automatic remediation

## Manual Fix
Step-by-step user instructions

## Verification
How to verify the fix worked

## Prevention
How to avoid the issue in future

## Upstream Fix
PR-ready content including:
- PR Title
- PR Description
- Files Changed
- Diff

## Gist Content
Standalone markdown and patches for gist creation
```

## Usage by `/doctor`

The `/doctor` skill:

1. **Reads all reference files** in this directory
2. **Runs detection scripts** from high-severity issues first
3. **Reports findings** to user with issue_id and severity
4. **Offers automated fixes** for detected issues
5. **Can generate PR/gist** content on request

Example:
```bash
/doctor
# Output:
# ⚠️  [CRITICAL] stale-build-artifacts detected
#     - Orphaned file: dist/channels/telegram.js
#     - Fix available: rm -rf dist/ && npm run build
#     - Generate PR? (y/n)
```

## Current References

| Issue ID | Severity | Frequency | Platforms | Description |
|----------|----------|-----------|-----------|-------------|
| `stale-build-artifacts` | Critical | Common | All | Orphaned dist/ files after git reset |
| `apple-container-on-linux` | Critical | Rare | Linux | Apple Container check runs on Linux |
| `telegram-ipv6-timeout` | High | Common | All | Telegram API IPv6 connection hangs |

## Adding New References

When you encounter a new recurring issue:

1. **Create new markdown file** in this directory
2. **Follow the template** structure above
3. **Include detection script** that returns success/failure
4. **Provide automated fix** when possible
5. **Write PR content** for upstream contribution
6. **Update this README** table

### Template

Use this template for new issues:

\`\`\`markdown
---
issue_id: issue-name-slug
severity: critical | high | medium | low
frequency: common | occasional | rare
affected_platforms: [linux, macos, windows]
related_features: []
pr_ready: true | false
---

# Issue Title

## Symptom
What the user sees

## Root Cause
Why it happens

## Detection
\`\`\`bash
# Detection script
\`\`\`

## Automated Fix
\`\`\`bash
# Fix script
\`\`\`

## Manual Fix
Steps for manual resolution

## Verification
How to verify fix

## Prevention
How to avoid

## Upstream Fix
PR content

## Gist Content
Gist files
\`\`\`

## PR Workflow

For issues marked `pr_ready: true`:

### Option 1: Direct PR
1. `/doctor` detects issue
2. User confirms: "Generate PR"
3. `/doctor` extracts diff from reference
4. Creates git branch, applies patch, commits
5. Uses `gh pr create` with description from reference

### Option 2: Gist → PR
1. `/doctor` detects issue
2. User confirms: "Create gist"
3. `/doctor` extracts gist content from reference
4. Creates gist with `gh gist create`
5. Returns gist URL for manual PR creation in clean repo

Example:
```bash
/doctor

# Output:
# ⚠️  [CRITICAL] stale-build-artifacts
#
# Options:
# 1. Fix locally (rm -rf dist/ && npm run build)
# 2. Create PR for upstream fix
# 3. Create gist for manual PR
#
# Choice (1/2/3):
```

## Severity Levels

- **Critical**: Service fails to start or core features broken
- **High**: Major features degraded but service runs
- **Medium**: Minor features affected or performance issues
- **Low**: Cosmetic or edge cases

## Frequency Classification

- **Common**: Occurs in >30% of installations/deployments
- **Occasional**: Occurs in 10-30% of cases
- **Rare**: Occurs in <10% of cases

## Contributing

When documenting a new issue:

1. **Reproduce it** on clean install if possible
2. **Root cause analysis** - understand why it happens
3. **Test the fix** - verify automated fix works
4. **Write clear detection** - must be deterministic
5. **Prepare PR content** - make it easy to contribute upstream
