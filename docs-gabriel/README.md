# NanoClaw 문서 가이드 및 핵심 개념

> NanoClaw는 WhatsApp 등 메신저를 인터페이스로 사용하는 Claude AI 에이전트 플랫폼입니다.  
> 이 문서는 전체 시스템의 핵심 개념을 5분 안에 빠르게 파악하기 위한 진입점입니다.

---

## 1. NanoClaw란?

WhatsApp, Telegram 등 **메신저를 통해 Claude AI와 대화**할 수 있게 해주는 개인화 플랫폼입니다.
- 사용자가 메신저에서 `@Andy 오늘 날씨 어때?` 라고 보내면
- NanoClaw가 메시지를 받아 Claude에게 전달하고
- Claude의 응답을 다시 메신저로 전송함과 동시에, 데몬 환경에서 자동화 툴들을 실행합니다.

---

## 2. 두 계층 구조 (Host & Container)

### 호스트(Host) — 관리자 역할
항상 켜져 있는 Node.js 백그라운드 서비스입니다.
- **주요 역할**: 메신저 연결 유지, 메시지 수신/라우팅, DB(`store/messages.db`) 관리, 보안 및 권한 제어
- **제어 수단**: `.env`, `~/.config/nanoclaw/mount-allowlist.json` 등을 통한 환경 제어

### 컨테이너(Container) — 실무 에이전트
대화 시작 시 1회성으로 생성되며(Docker/Apple Container), 30분 유휴 시 자동 종료되는 안전 격리 구역입니다.
- **주요 역할**: 실질적인 Claude AI 호출, Bash 커맨드, 도구(파일 쓰기/검색/브라우징) 직접 실행
- **격리와 세션 유지**: 그룹별로 완전히 분리된 컨테이너가 배정되며, 꺼졌다 켜져도 내부 세션 ID를 통해 이전 대화의 문맥을 복원합니다.

---

## 3. 스킬(Skills) 확장 시스템

NanoClaw에서는 복잡한 기능 설정을 별도로 두지 않고, 두 종류의 "스킬" 코드를 통해 확장성을 보장합니다.

| 종류 | 위치 | 목적 |
| :--- | :--- | :--- |
| **호스트/설치 스킬** | `.claude/skills/` | 프로젝트 자체 초기화(설치), 업데이트, 타 메신저 연동 등록 시 호스트 Claude 사용 용도 |
| **컨테이너 확장 스킬** | `container/skills/` | 메신저 사용자가 Claude와 대화하며 사용할 수 있도록 새로 부여하는 도구들 (웹 검색 등) |

---

## 4. 📁 새로운 문서 디렉터리 구조 및 읽기 경로

중복을 제거하고 주제별로 핵심 내용을 집중 구성한 디렉터리 구조입니다. 필요한 목적에 따라 문서를 탐색하세요.

### 🚀 `01-getting-started/` (시작하기)
- `setup-guide.md` — 초기 설치 및 1년 장기 토큰 설정 방법 (신규 사용자 필수)
- `requirements.md` — 프로젝트 존재 이유 및 설계 철학 레퍼런스

### 🏗️ `02-architecture/` (아키텍처 및 내부 구조)
- `system-architecture.md` — 메시지 흐름, DB 구조, IPC, Agent-runner 실행 등 전체 기술적 아키텍처
- `conversation-memory.md` — Claude 기억 연상 체계, 그룹별/전역 컨텍스트 보존 메커니즘
- `volume-mounts.md` — 호스트-컨테이너 간 파일 영속성 보존 및 외부 볼륨 추가 마운트 원리

### 🔒 `03-security/` (보안 모델)
- `security-model.md` — 컨테이너 샌드박스의 접근 권한 및 차단 프로세스 (Apple Container 관련 포함)

### 🛠️ `04-extensions/` (기능 확장)
- `skills-spec.md` — 전체 시스템 명세 (아키텍처, 설정, 메모리, 세션, 스케줄링, MCP, 컨테이너 스킬 등)
- `container-skills.md` — 컨테이너 스킬 추가 및 관리 실용 가이드 (실습 위주)
- `skills-engine.md` — 호스트 스킬 시스템 동작 원리 (호스트 레벨 기능 추가)
- `mcp-tools.md` — MCP(Model Context Protocol) 도구 명세

### ⚙️ `05-operations/` (운영 및 문제 해결)
- `host-management.md` — 호스트 시스템 런타임 제어 및 데몬 관리
- `troubleshooting/` — Duplicate Containers, Timeout 등 에러 슈팅 케이스 모음
