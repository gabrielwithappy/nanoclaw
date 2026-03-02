# Upstream Boundaries — 코어 파일 영역 정의

> 이 문서는 NanoClaw의 **업스트림(upstream) 코어 영역**에 해당하는 파일과 디렉터리를 정의합니다.
> 아키텍처 리뷰 스킬이 "직접 수정 시 업스트림 충돌 위험"을 판정하는 근거 자료로 사용됩니다.

---

## 코어 소스 (수정 시 Critical 경고)

아래 경로의 파일들은 업스트림에서 활발히 개발되고 있으므로, 직접 수정 시 `update` 스킬을 통한 병합에서 Merge Conflict가 발생할 확률이 매우 높습니다.

```
src/                           # 호스트 측 전체 소스 코드
├── index.ts                   # 메인 오케스트레이터
├── channels/whatsapp.ts       # WhatsApp 채널
├── ipc.ts                     # IPC 통신
├── router.ts                  # 메시지 라우팅
├── config.ts                  # 설정 상수
├── types.ts                   # TypeScript 인터페이스
├── db.ts                      # SQLite 데이터베이스
├── group-queue.ts             # 그룹별 큐
├── container-runner.ts        # 컨테이너 스포너
├── container-runtime.ts       # 런타임 추상화 (Docker/Apple)
├── mount-security.ts          # 마운트 보안 검증
├── task-scheduler.ts          # 예약 작업 스케줄러
├── logger.ts                  # 로깅
└── whatsapp-auth.ts           # WhatsApp 인증

container/agent-runner/        # 컨테이너 내부 에이전트 런타임
├── src/index.ts               # 에이전트 쿼리 루프
└── src/ipc-mcp-stdio.ts       # MCP 서버 (IPC 통신)

container/Dockerfile           # 컨테이너 이미지 빌드 정의
```

## 사용자 확장 영역 (수정 허용, 경고 없음)

아래 경로는 사용자가 자유롭게 추가/수정할 수 있는 영역입니다.

```
.claude/skills/                # 호스트 관리용 스킬 (사용자 추가 가능)
container/skills/              # 전역 컨테이너 스킬 (사용자 추가 가능)
groups/                        # 그룹별 메모리 및 설정
config/groups/                 # 그룹별 마운트/환경 설정
data/sessions/                 # 런타임 세션 데이터
.env                           # 환경 변수 (로컬 전용)
```

## 주의 영역 (수정 시 Medium 경고)

아래 파일은 직접 수정이 가능하지만, 업스트림 업데이트 시 덮어쓰기 위험이 있습니다.

```
package.json                   # 의존성 변경 시 충돌 가능
tsconfig.json                  # 빌드 설정 변경 시 충돌 가능
CLAUDE.md                      # 루트 레벨 Claude 컨텍스트
container/build.sh             # 빌드 스크립트
```

## PR 적합성 판단 기준

| 변경 유형 | src/ 수정 | skills/ 수정 | PR 적합 여부 |
|:---|:---:|:---:|:---|
| 버그 수정 | ✅ | - | ✅ PR 제출 가능 |
| 보안 수정 | ✅ | - | ✅ PR 제출 가능 |
| 코드 단순화 | ✅ | - | ✅ PR 제출 가능 |
| 새 기능 추가 | ❌ | ✅ | ✅ 스킬로 PR 제출 |
| 새 기능을 위한 코어 수정 | ❌ | ❌ | ❌ 거부됨 |
| 개인 환경 특화 | ❌ | - | ❌ 로컬 전용 |
