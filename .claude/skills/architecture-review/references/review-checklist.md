# Review Checklist — 상세 진단 기준 및 감지 로직

> 아키텍처 리뷰 스킬이 사용하는 상세 체크리스트입니다. 
> 각 항목에는 감지 스크립트, 판정 기준, 권장 조치가 포함되어 있습니다.

---

## CHECK-01: 코어 소스 직접 수정 여부 (Critical)

**목적**: `src/` 및 `container/agent-runner/` 파일이 업스트림과 다른지 검출합니다.

**감지 스크립트**:
```bash
# upstream 리모트 확인
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

**판정 기준**:
- `CRITICAL`: 코어 파일이 1개 이상 변경됨
- `PASS`: 코어 파일이 업스트림과 동일함
- `SKIP`: upstream 리모트가 없어 비교 불가

**권장 조치**:
- 기능 추가성 변경이라면 → skill로 전환하고 코어 복원
- 버그/보안 수정이라면 → upstream PR 제출 권장

---

## CHECK-02: package.json 의존성 변경 (High)

**목적**: 핵심 의존성 목록이 업스트림과 달라졌는지 검출합니다.

**감지 스크립트**:
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

**판정 기준**:
- `HIGH`: 의존성이 추가/제거/버전변경됨
- `PASS`: 의존성이 동일함

---

## CHECK-03: 깨진 심볼릭 링크 (High)

**목적**: 세션 디렉터리 내 깨진 심볼릭 링크로 인한 스킬 동기화 실패를 탐지합니다.

**감지 스크립트**:
```bash
BROKEN=$(find data/sessions/ -type l ! -exec test -e {} \; -print 2>/dev/null | grep -v "debug/latest")
if [ -n "$BROKEN" ]; then
  echo "HIGH: Broken symbolic links found"
  echo "$BROKEN"
else
  echo "PASS"
fi
```

**판정 기준**:
- `HIGH`: debug/latest 이외의 깨진 심볼릭 링크가 존재
- `PASS`: 깨진 링크 없음

**권장 조치**:
- `rm` 명령으로 깨진 링크 삭제
- 서비스 재시작 시 호스트가 자동으로 재동기화

---

## CHECK-04: 고아(Orphan) 세션 파일 (Medium)

**목적**: DB에 등록되지 않은 그룹의 세션 폴더가 남아 있는지 탐지합니다.

**감지 스크립트**:
```bash
if [ -f store/messages.db ]; then
  for session_dir in data/sessions/*/; do
    FOLDER=$(basename "$session_dir")
    # DB에서 해당 폴더 이름 검색
    FOUND=$(sqlite3 store/messages.db "SELECT COUNT(*) FROM registered_groups WHERE folder = '$FOLDER'" 2>/dev/null)
    if [ "$FOUND" = "0" ]; then
      SIZE=$(du -sh "$session_dir" 2>/dev/null | cut -f1)
      echo "MEDIUM: Orphan session directory: $FOLDER ($SIZE)"
    fi
  done
fi
```

---

## CHECK-05: 마운트 대상 경로 미존재 (Medium)

**목적**: 그룹 설정(config/groups/*.json)의 마운트 경로가 실제로 존재하는지 확인합니다.

**감지 스크립트**:
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

## CHECK-06: 하드코딩된 로컬 경로 (Medium)

**목적**: 코어 소스에 호스트 특정 절대 경로가 하드코딩되어 있지 않은지 확인합니다.

**감지 스크립트**:
```bash
# src/ 내에서 /home/로 시작하는 경로 검색 (/home/node/ 제외)
HARDCODED=$(grep -rn "/home/" src/ --include="*.ts" 2>/dev/null | grep -v "/home/node/" | grep -v "node_modules")
if [ -n "$HARDCODED" ]; then
  echo "MEDIUM: Hardcoded local paths in core source"
  echo "$HARDCODED"
else
  echo "PASS"
fi
```

---

## CHECK-07: 스킬-소스 정합성 (Critical)

**목적**: 스킬로 생성된 코드 변경이 코어 소스와 정상적으로 분리되어 있는지 확인합니다.

**감지 스크립트**:
```bash
# .claude/skills/ 내 스킬이 src/ 파일을 직접 포함하고 있지 않은지 확인
# (스킬은 "지시서"이지, 미리 빌드된 코드가 아니어야 함)
SRC_IN_SKILLS=$(find .claude/skills/ -name "*.ts" -o -name "*.js" 2>/dev/null | grep -v "node_modules" | grep -v "scripts/")
if [ -n "$SRC_IN_SKILLS" ]; then
  echo "WARNING: TypeScript/JavaScript files found directly inside skills:"
  echo "$SRC_IN_SKILLS"
  echo ""
  echo "스킬은 '지시 문서(SKILL.md)'여야 합니다. 코드는 scripts/ 하위에만 허용됩니다."
fi
```

---

## 심각도 우선순위

아키텍처 리뷰 실행 시 아래 순서로 체크하며, Critical 항목이 1개라도 발견되면 먼저 강조합니다.

1. **Critical**: CHECK-01 (코어 소스 수정), CHECK-07 (스킬-소스 정합성)
2. **High**: CHECK-02 (의존성 변경), CHECK-03 (깨진 심볼릭 링크)
3. **Medium**: CHECK-04 (고아 세션), CHECK-05 (마운트 미존재), CHECK-06 (하드코딩 경로)
