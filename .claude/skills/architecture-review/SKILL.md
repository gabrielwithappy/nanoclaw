---
name: architecture-review
description: >
  NanoClaw 커스터마이징의 아키텍처 적합성을 검증합니다. 코어 소스 직접 수정 여부,
  스킬 시스템 준수 여부, 세션/마운트 무결성, 업스트림 정합성, PR 규격 적합성을 검사합니다.
  "아키텍처 리뷰", "architecture review", "구조 검사", "정합성 검사" 등에 반응합니다.
---

# NanoClaw Architecture Review

NanoClaw를 커스터마이징할 때, 변경 사항이 업스트림(upstream) 업데이트와 충돌하지 않는지, 프로젝트의 설계 철학을 해치지 않는지 사전에 검증하는 아키텍처 리뷰 스킬입니다.

## 핵심 원칙 (CONTRIBUTING.md 기반)

NanoClaw 프로젝트의 아키텍처 판단 기준은 다음과 같습니다:

- **소스 수정(src/)으로 허용되는 것**: 버그 수정, 보안 수정, 단순화, 코드 줄이기
- **소스 수정(src/)으로 허용되지 않는 것**: 기능 추가, 호환성, 개선사항 → 이것들은 반드시 스킬(Skills)로 해야 함
- **스킬 PR은 소스 파일을 수정하면 안 됨**: 스킬은 "Claude에게 변환 방법을 지시하는 마크다운 명세"일 뿐, 미리 빌드된 코드가 아님

## 사용 시점

| 시점 | 설명 |
|:---|:---|
| **커스터마이징 전** | 현재 코드가 업스트림 대비 얼마나 벌어져 있는지 확인 |
| **커스터마이징 후** | 방금 한 수정이 아키텍처 적합한지 검증 |
| **문제 진단 시** | `/doctor`와 함께 구조적 결함(깨진 링크, 고아 파일) 탐색 |
| **PR 작성 전** | 업스트림 기여 적합 여부 판단 |

## 리뷰 워크플로우

### Step 1: 레퍼런스 파일 로딩

먼저 아키텍처 판단 기준을 읽어들입니다:

```bash
cat .claude/skills/architecture-review/references/upstream-boundaries.md
cat .claude/skills/architecture-review/references/review-checklist.md
```

### Step 2: 업스트림 정합성 검사 (Critical)

업스트림 원본 대비 코어 소스 파일이 수정되었는지 확인합니다. 이 검사가 가장 중요합니다.

```bash
# upstream 리모트가 설정되어 있는지 확인
git remote -v | grep upstream || echo "WARNING: upstream remote not configured"

# upstream이 있으면 코어 파일의 변경 사항을 비교
if git remote -v | grep -q upstream; then
  git fetch upstream main --quiet 2>/dev/null
  
  # src/ 디렉터리의 변경 파일 목록
  CORE_CHANGES=$(git diff --name-only upstream/main -- src/ container/agent-runner/ container/Dockerfile 2>/dev/null)
  
  if [ -n "$CORE_CHANGES" ]; then
    echo "CRITICAL: Core source files modified vs upstream:"
    echo "$CORE_CHANGES"
  else
    echo "PASS: Core source files match upstream"
  fi
fi
```

**upstream이 없는 경우의 대안 검사:**
```bash
# git log에서 src/ 수정 이력 확인
RECENT_SRC_CHANGES=$(git log --oneline -20 -- src/ container/agent-runner/ | head -10)
if [ -n "$RECENT_SRC_CHANGES" ]; then
  echo "INFO: Recent commits touching core source:"
  echo "$RECENT_SRC_CHANGES"
fi
```

### Step 3: 스킬 시스템 준수 검사 (Critical)

기능 추가가 스킬(Skills) 시스템을 통해 이루어졌는지 확인합니다.

```bash
# 최근 커밋에서 src/를 수정하면서 동시에 .claude/skills/ 를 수정하지 않은 경우 = 의심
SUSPECT_COMMITS=$(git log --oneline -20 -- src/ | while read hash msg; do
  SKILL_TOUCH=$(git diff-tree --no-commit-id --name-only -r "$hash" -- '.claude/skills/' 'container/skills/' 2>/dev/null)
  SRC_TOUCH=$(git diff-tree --no-commit-id --name-only -r "$hash" -- 'src/' 2>/dev/null)
  if [ -n "$SRC_TOUCH" ] && [ -z "$SKILL_TOUCH" ]; then
    # src/만 수정하고 skills는 건드리지 않은 커밋
    echo "$hash $msg"
  fi
done)

if [ -n "$SUSPECT_COMMITS" ]; then
  echo "WARNING: Commits modifying core src/ without corresponding skill:"
  echo "$SUSPECT_COMMITS"
  echo ""
  echo "CONTRIBUTING.md 원칙: 기능 추가는 스킬로, 소스 수정은 버그/보안/단순화만 허용"
else
  echo "PASS: Skill system compliance OK"
fi
```

### Step 4: 세션/마운트 무결성 검사 (High)

세션 디렉터리 내 깨진 심볼릭 링크, 고아(orphan) 파일을 탐지합니다.

```bash
# 깨진 심볼릭 링크 찾기
BROKEN_LINKS=$(find data/sessions/ -type l ! -exec test -e {} \; -print 2>/dev/null | grep -v "debug/latest")
if [ -n "$BROKEN_LINKS" ]; then
  echo "HIGH: Broken symbolic links found in session directories:"
  echo "$BROKEN_LINKS"
  echo ""
  echo "FIX: rm 명령으로 깨진 링크 삭제 후 서비스 재시작 시 자동 재생성됩니다."
else
  echo "PASS: No broken symbolic links"
fi

# 그룹 설정 파일과 실제 마운트 대상의 일치 검사
for config_file in config/groups/*.json; do
  [ -f "$config_file" ] || continue
  GROUP_NAME=$(basename "$config_file" .json)
  
  # additionalMounts의 hostPath가 실제로 존재하는지 확인
  HOST_PATHS=$(grep -oP '"hostPath"\s*:\s*"\K[^"]+' "$config_file" 2>/dev/null)
  for hp in $HOST_PATHS; do
    RESOLVED=$(eval echo "$hp")
    if [ ! -e "$RESOLVED" ]; then
      echo "MEDIUM: Group '$GROUP_NAME' has mount to non-existent path: $hp"
    fi
  done
done
```

### Step 5: 범용성 검사 (Medium)

로컬 환경에 의존하는 하드코딩된 경로나 설정이 코어 소스에 들어가지 않았는지 확인합니다.

```bash
# src/ 내부에 하드코딩된 로컬 경로 검출
HARDCODED=$(grep -rn "/home/" src/ --include="*.ts" 2>/dev/null | grep -v "node_modules" | grep -v "/home/node/")
if [ -n "$HARDCODED" ]; then
  echo "MEDIUM: Hardcoded local paths found in core source:"
  echo "$HARDCODED"
else
  echo "PASS: No hardcoded local paths in core source"
fi
```

### Step 6: PR 적합성 판단 (Medium)

현재 변경 사항이 업스트림 PR로 올릴 수 있는 성격인지 판단합니다.

**PR에 적합한 수정 (CONTRIBUTING.md 기준):**
- 버그 수정 (fix)
- 보안 수정 (security)
- 코드 단순화/줄이기 (simplification)
- 새로운 스킬 추가 (`.claude/skills/` 내 파일만 변경)

**PR에 부적합한 수정:**
- 기능 추가를 위한 `src/` 직접 수정
- 개인 환경 특화 설정이 코어에 포함된 경우
- 호환성 확장을 위한 코어 변경

```bash
# 스테이징된 변경을 분석
STAGED_SRC=$(git diff --cached --name-only -- src/ container/agent-runner/ 2>/dev/null)
STAGED_SKILLS=$(git diff --cached --name-only -- .claude/skills/ container/skills/ 2>/dev/null)

if [ -n "$STAGED_SKILLS" ] && [ -z "$STAGED_SRC" ]; then
  echo "PR_READY: Skills-only change → upstream PR 적합"
elif [ -n "$STAGED_SRC" ]; then
  echo "PR_REVIEW_NEEDED: Core source modified → 버그/보안/단순화인지 직접 판단 필요"
  echo "Modified files:"
  echo "$STAGED_SRC"
fi
```

## 리포트 포맷

모든 검사가 완료되면 아래 형식의 리포트를 생성합니다:

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
  - 기능 추가 → `container/skills/` 또는 `.claude/skills/`를 이용하세요
  - 코어 수정이 필요 → 먼저 PR로 upstream에 기여할지 판단하세요
  - 업데이트 충돌 위험 → `/update` 전에 반드시 이 리뷰를 실행하세요
```

## 다른 스킬과의 연동

### customize와 연동
`/customize` 실행 시 이 리뷰를 먼저 확인하여 현재 코드 상태를 파악한 뒤 커스터마이징을 진행합니다. 커스터마이징 완료 후에도 리뷰를 다시 실행하여 적합성을 재검증합니다.

### doctor와 연동
`/doctor` 실행 시 "Phase 2: General Health Checks"에서 본 스킬의 Step 4(세션/마운트 무결성 검사)를 포함시켜 깨진 심볼릭 링크, 고아 파일 등의 구조적 결함을 함께 탐지합니다.

### update와 연동
`/update` 실행 전에 본 스킬을 실행하면, 업스트림 대비 코어 파일이 얼마나 벌어져 있는지 사전에 파악하여 충돌 위험도를 예측할 수 있습니다.
