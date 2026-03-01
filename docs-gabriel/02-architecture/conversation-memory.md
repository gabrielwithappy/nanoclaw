---
title: "분석: 대화 기록 저장 및 LLM 컨텍스트(Context) 전달 구조"
date: "2026-02-28"
---

# 대화 기록 저장 및 LLM 컨텍스트 전달 메커니즘 분석

NanoClaw가 사용자와의 메시지를 어떻게 로컬에 저장하고, Claude 에이전트(LLM)에게 대화 맥락을 어떻게 전달하는지 소스 코드를 바탕으로 분석한 문서입니다.

## 1. 메시지 저장 (Database Storage)

사용자가 텔레그램이나 WhatsApp에서 메시지를 보내면, 데몬(Host)은 이를 즉각 로컬 데이터베이스에 저장합니다.

*   **저장소 위치**: `store/messages.db` (SQLite 기반)
*   **주요 처리 로직 (`src/db.ts`)**:
    *   채널(Telegram/WhatsApp) 이벤트 발생 시 `storeMessage()` 함수가 호출됩니다.
    *   `messages` 테이블에 메시지의 고유 번호(`id`), 그룹방 식별자(`chat_jid`), 발신자명(`sender_name`), 텍스트 내용(`content`), 발송 시간(`timestamp`) 등을 기록합니다.
    *   **중요**: 로깅 및 컨텍스트 혼동을 방지하기 위해 봇이 이전에 보냈던 메시지는 `is_bot_message = 1` 로 마킹하여 일반 유저의 메시지와 엄격히 구분합니다.

## 2. 메시지 추출 및 포매팅 (Context Retrieval)

Claude 모델에게 넘겨주기 직전, 데몬은 봇이 읽지 않은(처리하지 않은) 새로운 대화 내역만을 DB에서 뽑아냅니다.

*   **선택적 추출 (`getMessagesSince`)**:
    *   NanoClaw는 그룹별로 처리했던 제일 마지막 메시지 시간을 커서(`last_agent_timestamp`)로 기억합니다.
    *   가장 최근 커서 이후에 쌓인 메시지만을 DB에서 가져옵니다. 이때 봇이 스스로 뱉었던 텍스트(`is_bot_message = 1`)는 제외합니다.
*   **XML 포매팅 (`src/router.ts`)**:
    *   추출된 메시지 배열은 LLM이 역할과 시간을 정확히 인식하기 쉽도록 `formatMessages()` 함수를 통해 **XML 형태**로 변환됩니다.
    ```xml
    <messages>
      <message sender="Gabriel" time="2026-02-28T12:00:00Z">안녕, 날씨 어때?</message>
      <message sender="Alice" time="2026-02-28T12:01:00Z">여기 서울인데 비와</message>
    </messages>
    ```

## 3. LLM으로의 전달 (Context Delivery to Container)

가장 독특한 점은 NanoClaw가 이 텍스트를 HTTP API가 아니라, **로컬 도커(Docker) 컨테이너의 표준 입력(stdin)**을 통해 전달한다는 점입니다.

*   **컨테이너 생성 (`src/container-runner.ts`)**:
    *   대화가 발생하면 `runContainerAgent()`가 각 대화방(Group) 격리 전용 도커 컨테이너를 생성합니다.
*   **파이프라인 주입 (Stdin)**:
    *   앞서 만든 XML 프롬프트 배열(`prompt`), API 키(`secrets`), 그리고 가장 중요한 **`sessionId`**가 포함된 JSON 객체를 만듭니다.
    *   `container.stdin.write(JSON.stringify(input))` 코드를 통해 구동 중인 컨테이너 운영체제의 기반 입력으로 통째로 밀어넣습니다.
    *   컨테이너 내부의 Claude SDK 래퍼(agent-runner)가 이 JSON을 받아 Claude API 쪽으로 최종 쿼리를 발사합니다.

## 4. 누적 대화 기억 (Long-term Memory) 메커니즘

위 과정에서 NanoClaw 데몬은 오직 **가장 최신의 새로운 메시지 몇 개**만을 컨테이너에 넘깁니다. 그렇다면 Claude는 어떻게 수십 개 전의 예전 대화를 기억할까요?

*   **Session 마운트 시스템**:
    *   각 도커 컨테이너는 실행될 때 `data/sessions/[폴더명]/.claude` 경로를 컨테이너 내부에 바인드 마운트 볼륨으로 연결 받습니다 (`-v hostPath:containerPath`).
    *   데몬은 컨테이너에 신규 메시짓값을 넘길 때, `sessions` 테이블에 저장되어 있던 이전 컨테이너의 `sessionId`를 함께 넘깁니다.
    *   컨테이너 내의 Claude SDK는 이 `sessionId`를 토대로 마운트된 `.claude` 폴더 내의 로컬 메모리 파일들을 긁어와 과거 컨텍스트(과거 대화 로그)를 스스로 복원합니다.
*   **장점**: 데몬(Host)이 무거운 전체 대화 히스토리 문자열을 일일이 관리/조립할 필요 없이, 가장 최신의 대화만 넘기고 무거운 기억/회상 작업은 격리된 컨테이너 내부의 SDK 프레임워크에 위임하여 메모리와 토큰을 절약합니다.
