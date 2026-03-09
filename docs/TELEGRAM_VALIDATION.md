# Telegram Communication Validation

NanoClaw의 Telegram 통합에서 메시지 중복 및 전달 실패 문제를 검증하는 포괄적인 테스트 체계입니다.

## 빠른 시작

### 기본 검증 실행
```bash
npm run validate:telegram
```

### Watch 모드 (코드 변경 시 자동 재실행)
```bash
npm run validate:telegram:watch
```

### 상세 출력 포함
```bash
npm run validate:telegram:verbose
```

## 검증 범위

### 1. 통합 테스트 (`telegram-integration.test.ts`)

Telegram 채널의 전체 메시지 흐름을 검증합니다.

#### 메시지 중복 제거 (Deduplication)
- ✅ 동일 메시지ID 중복 수신 처리
- ✅ 다양한 메시지 구분
- ✅ 네트워크 재시도 시나리오

#### 메시지 전달 (Delivery)
- ✅ 정상 텍스트 메시지 전달
- ✅ @mention 변환 및 전달
- ✅ 명령어(/start 등) 필터링
- ✅ 미등록 그룹 제외
- ✅ 봇 메시지 감지

#### 타임스탬프 및 순서 (Ordering)
- ✅ 타임스탬프 보존
- ✅ Unix → ISO 변환
- ✅ 메시지 순서 유지

#### 발신자 정보 (Sender Info)
- ✅ 발신자 ID와 이름 추출
- ✅ 부분 정보 폴백

#### 엣지 케이스
- ✅ 특수문자 처리
- ✅ 초장 메시지
- ✅ 다중 사용자 빠른 전송

#### 아웃바운드 메시지
- ✅ 메시지 전송
- ✅ 4096자 분할
- ✅ 전송 실패 처리

### 2. 데이터베이스 테스트 (`db.test.ts`)

메시지 저장 및 조회 로직의 중복 제거 메커니즘을 검증합니다.

#### 중복 제거 (Deduplication)
- ✅ (message_id, chat_jid) 복합키 기반 중복 제거
- ✅ 다양한 메시지ID 구분
- ✅ 메시지 업데이트 (동일 ID 재수신)
- ✅ 다중 채팅 간 독립성

#### 필터링 (Filtering)
```sql
WHERE timestamp > ? AND chat_jid IN (...)
  AND is_bot_message = 0 
  AND content NOT LIKE ? (bot prefix 제외)
  AND content != '' 
  AND content IS NOT NULL
```

- ✅ 봇 메시지 제외 (is_bot_message flag)
- ✅ 레거시 봇 프리픽스 제외 (Andy:%)
- ✅ 빈 메시지 제외
- ✅ 타임스탬프 기반 필터링
- ✅ 다중 채팅 독립 필터링

#### 엣지 케이스
- ✅ NULL 콘텐츠 처리
- ✅ 큰 메시지ID 처리
- ✅ 특수문자 보존
- ✅ 인덱스 성능 검증

### 3. 채널 단위 테스트 (`telegram.test.ts`)

Telegram 채널 클래스의 개별 기능을 검증합니다 (기존 테스트 강화).

## 문제 시나리오 및 검증

### 문제 1: 메시지 중복

**원인**: 데이터베이스에 저장된 후 `lastTimestamp` 저장 전 프로세스 크래시

**검증 포인트**:
```typescript
// telegram-integration.test.ts
// "prevents duplicate delivery of same message ID"
await triggerTextMessage(ctx);  // 첫 전달
await triggerTextMessage(ctx);  // 중복 전달

// 데이터베이스는 (id, chat_jid) 복합키로 중복 제거
expect(store.getMessageCount()).toBe(1);  // 하나만 저장
```

**검증 실행**:
```bash
npm test -- --reporter=verbose src/channels/telegram-integration.test.ts
# "message deduplication" 섹션 확인
```

### 문제 2: 메시지 전달 안됨

**원인**: 필터 조건이 정상 메시지까지 제외할 수 있음

```sql
-- 이 조건들이 메시지를 걸러낼 수 있음:
AND is_bot_message = 0        -- 봇 메시지 플래그 오류
AND content NOT LIKE ?         -- 봇 프리픽스 패턴 오류
AND content != ''              -- 공백만 있는 메시지
AND content IS NOT NULL        -- 콘텐츠 NULL
```

**검증 포인트**:
```typescript
// db.test.ts
// "excludes bot messages by is_bot_message flag"
// "filters by timestamp correctly"
// "handles multiple chats independently"

const rows = db.prepare(sql).all(timestamp, chatId, 'Andy:%');
expect(rows).toContainEqual({ id: 'msg-normal' });
expect(rows).not.toContainEqual({ id: 'msg-bot' });
```

**검증 실행**:
```bash
npm test -- src/db.test.ts
# "message filtering in getNewMessages()" 섹션 확인
```

## 코드 수정 후 검증 워크플로우

Telegram 관련 코드를 수정할 때마다:

1. **수정 전 기본 테스트 실행**
   ```bash
   npm run validate:telegram
   ```
   
2. **코드 수정**
   ```bash
   # telegram.ts, db.ts 등 수정
   ```

3. **수정 후 검증**
   ```bash
   npm run validate:telegram
   ```
   
   또는 Watch 모드로 실시간 확인:
   ```bash
   npm run validate:telegram:watch
   ```

4. **상세 검토 필요시**
   ```bash
   npm run validate:telegram:verbose
   ```

## 테스트 구조

```
src/
├── channels/
│   ├── telegram.ts                  # Telegram 채널 구현
│   ├── telegram.test.ts             # 단위 테스트
│   └── telegram-integration.test.ts # 통합 테스트 (NEW)
├── db.ts                            # 데이터베이스 레이어
└── db.test.ts                       # DB 중복제거/필터링 테스트 (NEW)

scripts/
└── validate-telegram.ts             # 검증 스크립트 (NEW)
```

## 예상 출력

성공:
```
============================================================
  Telegram Communication Validation Suite
============================================================

Telegram Integration Tests... ✅ 2.34s
Telegram Unit Tests... ✅ 1.89s
Database Deduplication Tests... ✅ 3.12s

============================================================
Summary
============================================================

✓ Passed: 3/3
⏱ Total time: 7.35s

🎉 All validation checks passed!

Telegram communication reliability verified:
✓ Message deduplication working
✓ Message delivery mechanisms sound
✓ Edge cases handled
```

실패:
```
============================================================
Summary
============================================================

✓ Passed: 2/3
✗ Failed: 1/3

============================================================
Issues Found
============================================================

Recommendations:
1. Check database deduplication logic
2. Verify message filtering in getNewMessages()
3. Ensure Telegram bot message detection works
4. Review timestamp handling and ordering
```

## 알려진 문제 및 해결책

### 1. Bot Message 검증

**문제**: 그룹에서 봇이 자신의 메시지를 받을 수 있음

**해결책**: `is_bot_message` 플래그 사용
```typescript
const isBotMessage = ctx.from?.id === ctx.me?.id;
this.opts.onMessage(chatJid, {
  // ...
  is_bot_message: isBotMessage,
});
```

**검증**:
```bash
npm test -- --reporter=verbose src/channels/telegram-integration.test.ts
# "delivers bot messages when from other users in group" 확인
```

### 2. Timestamp 일관성

**문제**: Unix (초 단위) → ISO 8601 변환

**해결책**: 일관된 변환 로직
```typescript
const timestamp = new Date(ctx.message.date * 1000).toISOString();
```

**검증**:
```bash
npm test -- src/channels/telegram-integration.test.ts -t "converts message.date to ISO"
```

### 3. 메시지 필터링

**문제**: 정상 메시지가 `getNewMessages()`에서 제외될 수 있음

**해결책**: 명확한 필터 조건
- `is_bot_message = 0`: 명시적 봇 플래그
- `content NOT LIKE 'Andy:%'`: 레거시 프리픽스
- `content != ''`: 공백 제외
- `content IS NOT NULL`: NULL 제외

**검증**:
```bash
npm test -- src/db.test.ts -t "message filtering"
```

## 추가 리소스

- [메모리: Telegram 커뮤니케이션 문제](../memory/telegram-communication-issues.md)
- [NanoClaw CLAUDE.md](../CLAUDE.md)
- [Telegram Bot API 문서](https://core.telegram.org/bots/api)

## 기여 가이드

새로운 Telegram 기능을 추가할 때:

1. **통합 테스트 작성** (`telegram-integration.test.ts`)
   - 실제 Telegram 메시지 시뮬레이션
   - onMessage/onChatMetadata 호출 검증

2. **데이터베이스 테스트 추가** (`db.test.ts`)
   - 저장/조회 로직 검증
   - 중복 제거 확인

3. **검증 실행**
   ```bash
   npm run validate:telegram
   ```

4. **테스트 통과 확인**
   - 모든 기존 테스트 통과
   - 새 기능 테스트 추가

## 참고

- **중복 제거**: 데이터베이스 레벨 (INSERT OR REPLACE)
- **메시지 필터링**: DB getNewMessages() 함수
- **봇 감지**: Telegram `ctx.from?.id === ctx.me?.id` 비교
- **타임스탐프**: startMessageLoop에서 lastTimestamp 관리
