---
name: architecture-review
description: >
  Validates the architectural integrity of NanoClaw customizations. Checks for direct core source modifications,
  skill system compliance, session/mount integrity, upstream alignment, and PR readiness.
  Triggers on "architecture review", "structural check", "alignment check", etc.
---

# NanoClaw Architecture Review

An architecture review skill that validates whether customizations conflict with upstream updates or violate the project's design philosophy before and after making changes.

## Core Principles (based on CONTRIBUTING.md)

NanoClaw's architectural criteria are as follows:

- **Accepted source modifications (src/)**: Bug fixes, security fixes, simplifications, reducing code.
- **Rejected source modifications (src/)**: Features, capabilities, compatibility, enhancements. These must be implemented as Skills.
- **Skill PRs must not modify source files**: A skill is a "Markdown specification instructing Claude how to transform", not pre-built code.

## When to Use

| Timing | Description |
|:---|:---|
| **Before Customizing** | Check how far the current code has drifted from upstream |
| **After Customizing** | Validate whether the recent changes are architecturally sound |
| **During Troubleshooting** | Use with `/doctor` to explore structural defects (broken links, orphan files) |
| **Before Creating PRs** | Determine if the changes are suitable for upstream contribution |

## Review Workflow

### Step 1: Load Reference Files

First, read the architecture criteria:

```bash
cat .claude/skills/architecture-review/references/upstream-boundaries.md
cat .claude/skills/architecture-review/references/review-checklist.md
```

### Step 2: Upstream Alignment Check (Critical)

Check if core source files have been modified compared to the upstream original. This is the most important check.

```bash
# Check if upstream remote is configured
git remote -v | grep upstream || echo "WARNING: upstream remote not configured"

# If upstream exists, compare core file changes
if git remote -v | grep -q upstream; then
  git fetch upstream main --quiet 2>/dev/null
  
  # List of changed files in src/ directory
  CORE_CHANGES=$(git diff --name-only upstream/main -- src/ container/agent-runner/ container/Dockerfile 2>/dev/null)
  
  if [ -n "$CORE_CHANGES" ]; then
    echo "CRITICAL: Core source files modified vs upstream:"
    echo "$CORE_CHANGES"
  else
    echo "PASS: Core source files match upstream"
  fi
fi
```

**Alternative check if upstream is missing:**
```bash
# Check modification history of src/ in git log
RECENT_SRC_CHANGES=$(git log --oneline -20 -- src/ container/agent-runner/ | head -10)
if [ -n "$RECENT_SRC_CHANGES" ]; then
  echo "INFO: Recent commits touching core source:"
  echo "$RECENT_SRC_CHANGES"
fi
```

### Step 3: Skill System Compliance Check (Critical)

Verify that new features were implemented via the Skills system.

```bash
# Commits modifying src/ without modifying .claude/skills/ at the same time = suspicious
SUSPECT_COMMITS=$(git log --oneline -20 -- src/ | while read hash msg; do
  SKILL_TOUCH=$(git diff-tree --no-commit-id --name-only -r "$hash" -- '.claude/skills/' 'container/skills/' 2>/dev/null)
  SRC_TOUCH=$(git diff-tree --no-commit-id --name-only -r "$hash" -- 'src/' 2>/dev/null)
  if [ -n "$SRC_TOUCH" ] && [ -z "$SKILL_TOUCH" ]; then
    # Commits that touched src/ but not skills
    echo "$hash $msg"
  fi
done)

if [ -n "$SUSPECT_COMMITS" ]; then
  echo "WARNING: Commits modifying core src/ without corresponding skill:"
  echo "$SUSPECT_COMMITS"
  echo ""
  echo "CONTRIBUTING.md rule: Features via skills, source mods restricted to bug/security/simplification"
else
  echo "PASS: Skill system compliance OK"
fi
```

### Step 4: Session/Mount Integrity Check (High)

Detect broken symbolic links and orphan files in the session directory.

```bash
# Find broken symbolic links
BROKEN_LINKS=$(find data/sessions/ -type l ! -exec test -e {} \; -print 2>/dev/null | grep -v "debug/latest")
if [ -n "$BROKEN_LINKS" ]; then
  echo "HIGH: Broken symbolic links found in session directories:"
  echo "$BROKEN_LINKS"
  echo ""
  echo "FIX: Remove broken links with 'rm'. They will be automatically regenerated on service restart."
else
  echo "PASS: No broken symbolic links"
fi

# Verify alignment between group config files and actual mount targets
for config_file in config/groups/*.json; do
  [ -f "$config_file" ] || continue
  GROUP_NAME=$(basename "$config_file" .json)
  
  # Check if additionalMounts hostPath actually exists
  HOST_PATHS=$(grep -oP '"hostPath"\s*:\s*"\K[^"]+' "$config_file" 2>/dev/null)
  for hp in $HOST_PATHS; do
    RESOLVED=$(eval echo "$hp")
    if [ ! -e "$RESOLVED" ]; then
      echo "MEDIUM: Group '$GROUP_NAME' has mount to non-existent path: $hp"
    fi
  done
done
```

### Step 5: Portability Check (Medium)

Check if hardcoded paths or settings dependent on the local environment have been introduced into the core source.

```bash
# Detect hardcoded local paths in src/
HARDCODED=$(grep -rn "/home/" src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | grep -v "/home/node/")
if [ -n "$HARDCODED" ]; then
  echo "MEDIUM: Hardcoded local paths found in core source:"
  echo "$HARDCODED"
else
  echo "PASS: No hardcoded local paths in core source"
fi
```

### Step 6: PR Readiness Check (Medium)

Determine if current changes are suitable for an upstream PR.

**Modifications suitable for PR (based on CONTRIBUTING.md):**
- Bug fixes (fix)
- Security fixes (security)
- Code simplification/reduction (simplification)
- Adding new skills (only files in `.claude/skills/` changed)

**Modifications unsuitable for PR:**
- Direct modification of `src/` to add features
- Personal environment specific configurations embedded in core
- Core changes for compatibility extensions

```bash
# Analyze staged changes
STAGED_SRC=$(git diff --cached --name-only -- src/ container/agent-runner/ 2>/dev/null)
STAGED_SKILLS=$(git diff --cached --name-only -- .claude/skills/ container/skills/ 2>/dev/null)

if [ -n "$STAGED_SKILLS" ] && [ -z "$STAGED_SRC" ]; then
  echo "PR_READY: Skills-only change → Suitable for upstream PR"
elif [ -n "$STAGED_SRC" ]; then
  echo "PR_REVIEW_NEEDED: Core source modified → Requires manual check if bug/security/simplification"
  echo "Modified files:"
  echo "$STAGED_SRC"
fi
```

## Report Format

Once all checks are complete, generate a report in the following format:

```
🏛️ NanoClaw Architecture Review Report
========================================

📋 Review Summary
  ✅ PASS:     N checks
  ⚠️  WARNING:  N issues
  ❌ CRITICAL: N violations

📊 Category Results
  Upstream Alignment:     [PASS/WARN/CRITICAL]
  Skill System Compliance: [PASS/WARN/CRITICAL]
  Session/Mount Integrity: [PASS/WARN]
  Portability:            [PASS/WARN]
  PR Readiness:           [READY/REVIEW_NEEDED/NOT_APPLICABLE]

🔧 Recommendations
  1. [Action item 1]
  2. [Action item 2]
  ...

💡 Architecture Tips
  - To add features → use `container/skills/` or `.claude/skills/`
  - If core modification is needed → determine first if it will be contributed to upstream via PR
  - Risk of update conflicts → ensure you run this review before running `/update`
```

## Integration with Other Skills

### Integration with customize
When running `/customize`, first run this review to understand the current code state before proceeding. Re-run the review after customization is complete to validate architectural soundness.

### Integration with doctor
When running `/doctor`, Step 4 (Session/Mount Integrity Check) of this skill is included in "Phase 2: General Health Checks" to detect structural defects like broken symlinks or orphan files.

### Integration with update
Running this skill before `/update` helps gauge the risk of conflicts by predicting how much the core files have drifted from upstream.
