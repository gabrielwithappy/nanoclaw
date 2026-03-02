---
trigger: always_on
---

# obsidian.md

**중요: 이 문서는 NanoClaw의 Obsidian Vault (`/workspace/extra/nanoclawKMS/`)를 다룰 때 적용되는 핵심 규칙입니다.**

## Obsidian Vault 구조

### Container 경로
- **Container 경로**: `/workspace/extra/nanoclawKMS/`
- **Host 경로**: `~/nanoclawKMS/`
- **Git 저장소**: 독립 Git repository (Submodule 아님)

### 현재 폴더 구조 (PARA 방법론)

**PARA**: Projects (프로젝트), Areas (책임 영역), Resources (참고 자료), Archives (아카이브)

```
nanoclawKMS/
├── .obsidian/              # Obsidian 설정
├── .git/                   # Git 저장소
├── .github/workflows/      # GitHub Actions (auto-push)
├── 1-PROJECTS/             # 프로젝트 (단기 목표, 명확한 종료 시점)
│   └── (현재 없음)
├── 2-AREAS/                # 책임 영역 (지속적 관리)
│   └── NanoClaw 운영/
│       ├── debug-checklist.md
│       ├── external-mounts-guide.md
│       ├── group-permissions-and-memory.md
│       ├── host-container-full-guide.md
│       ├── host-management.md
│       ├── setup-and-restart.md
│       └── troubleshooting/
│           ├── cloudflare-outbound-setup.md
│           ├── duplicate-containers.md
│           └── telegram-network-timeout.md
├── 3-RESOURCES/            # 참고 자료 (주제별 지식)
│   └── 30_RESOURCE/
│       └── 개발/
│           └── NanoClaw/
│               ├── 01-getting-started/
│               │   ├── requirements.md
│               │   └── setup-guide.md
│               ├── 02-architecture/
│               │   ├── conversation-memory.md
│               │   ├── system-architecture-deep-dive.md
│               │   ├── system-architecture.md
│               │   └── volume-mounts.md
│               ├── 03-security/
│               │   ├── apple-container.md
│               │   ├── security-model.md
│               │   └── security-spec.md
│               ├── 04-extensions/
│               │   ├── mcp-tools.md
│               │   ├── sdk-deep-dive.md
│               │   ├── skill-installation-and-permissions.md
│               │   ├── skills-engine.md
│               │   └── skills-spec.md
│               └── README.md
├── 4-ARCHIVES/             # 아카이브 (비활성화된 항목)
│   └── (현재 없음)
└── NanoClaw Host 연결정보.md
```

---

## Obsidian 작업 워크플로우

### 필수 단계
1. **Obsidian Flavored Markdown으로 작성**
   - `obsidian-markdown` skill 사용 가능
2. **Frontmatter 필수 작성**: `created`, `tags`
3. **파일 저장**
   - `obsidian-cli` skill 사용 (Obsidian 실행 중일 때)
   - 또는 일반 파일 IO 도구 사용

### 핵심 규칙

**Frontmatter**
```yaml
---
created: YYYY-MM-DD
tags: [tag1/subtag, tag2]
---
```
- YAML Frontmatter 내부에 빈 줄을 넣지 않습니다
- `created`: 생성 날짜 (YYYY-MM-DD 형식)
- `tags`: 계층 구조 태그 배열

**태그 (Tags) 규칙 - PARA 기반**
- Cascade 형식 사용: `AREA/운영`, `30_RESOURCE/개발/NanoClaw`
- PARA 카테고리별 태그:
  - **AREA/** - 책임 영역 (예: `AREA/운영`, `AREA/트러블슈팅`)
  - **30_RESOURCE/** - 참고 자료 (예: `30_RESOURCE/개발/NanoClaw`)
  - **PROJECT/** - 프로젝트 (예: `PROJECT/기능개발`)
  - **ARCHIVE/** - 아카이브 (예: `ARCHIVE/2025`)
- 보조 태그: `nanoclaw`, `nanoclaw/architecture`, `nanoclaw/security` 등

**마크다운 서식**
- 코드 블록 및 Mermaid 다이어그램: 불필요한 빈 줄 제거
- 본문 문단 사이: 하나의 빈 줄만 사용
- Wikilinks 사용 가능: `[[노트 이름]]`

**도구 우선순위**
1. `obsidian-cli` skill (Obsidian 실행 중)
2. `obsidian-markdown` skill (문법 참조)
3. 일반 파일 IO (Read, Write, Edit)