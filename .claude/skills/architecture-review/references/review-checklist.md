# Review Checklist — Detailed Diagnostic Criteria and Detection Logic

> Detailed checklist used by the architecture review skill. 
> Each item includes a detection script, evaluation criteria, and recommended actions.

---

## CHECK-01: Direct Modification of Core Source (Critical)

**Purpose**: Detect if `src/` and `container/agent-runner/` files differ from upstream.

**Detection Script**:
```bash
# Check upstream remote
if git remote -v | grep -q upstream; then
  git fetch upstream main --quiet 2>/dev/null
  DIFF_FILES=$(git diff --name-only upstream/main -- src/ container/agent-runner/src/ container/Dockerfile 2>/dev/null)
  if [ -n "$DIFF_FILES" ]; then
    echo "CRITICAL"
    echo "$DIFF_FILES"
  else
    echo "PASS"
  fi
else
  echo "SKIP: upstream remote not configured"
fi
```

**Evaluation Criteria**:
- `CRITICAL`: 1 or more core files changed
- `PASS`: Core files match upstream
- `SKIP`: Cannot compare due to missing upstream remote

**Recommended Action**:
- If change is feature addition → convert to skill and restore core
- If change is bug/security fix → recommend submitting upstream PR

---

## CHECK-02: package.json Dependency Changes (High)

**Purpose**: Detect if the core dependencies differ from upstream.

**Detection Script**:
```bash
if git remote -v | grep -q upstream; then
  PKG_DIFF=$(git diff upstream/main -- package.json 2>/dev/null | grep "^[+-]" | grep -E '"dependencies"|"devDependencies"' -A 50 | grep "^[+-]" | head -20)
  if [ -n "$PKG_DIFF" ]; then
    echo "HIGH: package.json dependencies differ from upstream"
    echo "$PKG_DIFF"
  else
    echo "PASS"
  fi
fi
```

**Evaluation Criteria**:
- `HIGH`: Dependencies added/removed/version changed
- `PASS`: Dependencies are identical

---

## CHECK-03: Broken Symbolic Links (High)

**Purpose**: Detect broken symbolic links in the session directories that cause skill sync failures.

**Detection Script**:
```bash
BROKEN=$(find data/sessions/ -type l ! -exec test -e {} \; -print 2>/dev/null | grep -v "debug/latest")
if [ -n "$BROKEN" ]; then
  echo "HIGH: Broken symbolic links found"
  echo "$BROKEN"
else
  echo "PASS"
fi
```

**Evaluation Criteria**:
- `HIGH`: Broken symbolic links exist other than debug/latest
- `PASS`: No broken links

**Recommended Action**:
- Remove broken links using `rm`
- The host will automatically resync upon service restart

---

## CHECK-04: Orphan Session Files (Medium)

**Purpose**: Detect session folders left over for groups not registered in the DB.

**Detection Script**:
```bash
if [ -f store/messages.db ]; then
  for session_dir in data/sessions/*/; do
    FOLDER=$(basename "$session_dir")
    # Search for folder name in DB
    FOUND=$(sqlite3 store/messages.db "SELECT COUNT(*) FROM registered_groups WHERE folder = '$FOLDER'" 2>/dev/null)
    if [ "$FOUND" = "0" ]; then
      SIZE=$(du -sh "$session_dir" 2>/dev/null | cut -f1)
      echo "MEDIUM: Orphan session directory: $FOLDER ($SIZE)"
    fi
  done
fi
```

---

## CHECK-05: Missing Mount Target Paths (Medium)

**Purpose**: Verify that mount paths specified in group configurations (`config/groups/*.json`) actually exist.

**Detection Script**:
```bash
for config_file in config/groups/*.json; do
  [ -f "$config_file" ] || continue
  GROUP_NAME=$(basename "$config_file" .json)
  HOST_PATHS=$(grep -oP '"hostPath"\s*:\s*"\K[^"]+' "$config_file" 2>/dev/null)
  for hp in $HOST_PATHS; do
    RESOLVED=$(eval echo "$hp")
    if [ ! -e "$RESOLVED" ]; then
      echo "MEDIUM: [$GROUP_NAME] Mount target missing: $hp → $RESOLVED"
    fi
  done
done
```

---

## CHECK-06: Hardcoded Local Paths (Medium)

**Purpose**: Check that host-specific absolute paths are not hardcoded into the core source.

**Detection Script**:
```bash
# Search for paths starting with /home/ in src/ (excluding /home/node/)
HARDCODED=$(grep -rn "/home/" src/ --include="*.ts" 2>/dev/null | grep -v "/home/node/" | grep -v "node_modules")
if [ -n "$HARDCODED" ]; then
  echo "MEDIUM: Hardcoded local paths in core source"
  echo "$HARDCODED"
else
  echo "PASS"
fi
```

---

## CHECK-07: Skill-Source Integrity (Critical)

**Purpose**: Ensure code modifications generated as skills are properly separated from core source code.

**Detection Script**:
```bash
# Check if .claude/skills/ directly contains src/ files
# (Skills should be "instruction sheets", not pre-built code)
SRC_IN_SKILLS=$(find .claude/skills/ -name "*.ts" -o -name "*.js" 2>/dev/null | grep -v "node_modules" | grep -v "scripts/")
if [ -n "$SRC_IN_SKILLS" ]; then
  echo "WARNING: TypeScript/JavaScript files found directly inside skills:"
  echo "$SRC_IN_SKILLS"
  echo ""
  echo "Skills should be 'instruction documents (SKILL.md)'. Code is only permitted under scripts/."
fi
```

---

## Severity Priority

When executing the architecture review, checks follow this order, emphasizing Critical items if any are found.

1. **Critical**: CHECK-01 (Core source modification), CHECK-07 (Skill-source integrity)
2. **High**: CHECK-02 (Dependency changes), CHECK-03 (Broken symlinks)
3. **Medium**: CHECK-04 (Orphan sessions), CHECK-05 (Missing mount targets), CHECK-06 (Hardcoded paths)
