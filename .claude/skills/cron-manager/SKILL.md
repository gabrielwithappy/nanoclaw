---
name: cron-manager
description: >
  호스트 시스템(Linux/macOS)의 cron 작업(crontab)을 관리하는 스킬입니다.
  새로운 크론 작업을 추가, 조회, 삭제할 수 있습니다. 
  "크론 작업 관리", "자동화 스케줄 추가", "cron job", "crontab" 등의 키워드에 반응합니다.
---

# Cron Manager Skill

이 스킬은 호스트 OS의 `crontab`을 직접 관리(생성, 조회, 삭제)할 수 있게 해주는 관리자용 호스트 스킬입니다. 

## 사용법 (Usage)

이 스킬은 기본적으로 Bash 쉘을 사용하여 호스트 계정의 현재 크론탭 항목들을 다룹니다.

### 1. 현재 등록된 크론 작업 목록 조회
현재 사용자의 스케줄링된 작업 목록을 나열합니다.

```bash
crontab -l
```
*(참고: 등록된 크론 작업이 없다면 `no crontab for user` 등의 메시지가 나옵니다)*

### 2. 새로운 크론 작업 추가
기존 작업을 덮어쓰지 않고 안전하게 새로운 줄을 추가합니다.

```bash
(crontab -l 2>/dev/null; echo "*/10 * * * * cd /home/gabriel/documents/work-nanoclaw/nanoclawKMS && ./auto_push.sh >> /tmp/auto_push.log 2>&1") | crontab -
```

### 3. 특정 크론 작업 제거
`grep -v` 패턴을 통해 원하지 않는 작업 줄을 찾아 제거한 후 목록을 다시 업데이트합니다. `[제거할_패턴]` 부분에 지우고자 하는 스크립트명이나 경로의 일부를 넣으세요.

```bash
crontab -l 2>/dev/null | grep -v "auto_push.sh" | crontab -
```

### 4. 모든 크론 작업 초기화 (주의)
모든 크론스케줄을 완전히 비우고 싶을 때만 사용합니다.

```bash
crontab -r
```

## 예시나 실제 적용 케이스 (Examples)
- Obsidian 저장소를 10분마다 자동 푸시(`git push`)하는 스크립트 연결.
- 매일 밤 12시 데이터 파일 백업 자동화 태스크.
