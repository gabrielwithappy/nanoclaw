---
name: safe-restart
description: NanoClaw 호스트 데몬을 안전하게 재시작합니다. 중복 컨테이너 장애를 방지하기 위해 떠있는 도커 컨테이너를 먼저 강제로 종료한 후 호스트 프로세스를 재시작합니다.
---

# Safe Restart 스킬

이 스킬은 NanoClaw 시스템 통신 타임아웃이나 설정 변경 반영을 위해 시스템을 안전하게 재시작할 때 사용합니다. Docker 컨테이너가 고아 프로세스(Orphan)로 남아 새로운 컨테이너와 중복 실행되는 장애(Context Stealing)를 원천 차단합니다.

## 작동 원리
이 스킬을 실행하면 `bash` 도구를 이용해 아래의 과정을 순서대로 진행합니다.
1. 실행 중인 모든 `nanoclaw-` 도커 컨테이너 강제 종료 (사살)
2. `systemctl --user restart nanoclaw` 명령으로 데몬 재시작

## 사용 방법 (Bash 도구 사용)
에이전트는 사용자가 재시작을 요청하면 아래 스크립트를 Bash 도구를 통해 권한을 가지고 실행합니다.

```bash
# 1. 데몬이 살아있는 상태에서 컨테이너를 죽이면 데몬이 에러 리트라이로 새 컨테이너를 띄우는 레이스 컨디션(중복 메세지) 방지. 먼저 데몬부터 완전히 멈춘다.
systemctl --user stop nanoclaw

# 2. 찌꺼기 컨테이너 모두 강제 종료
docker ps -q --filter "name=nanoclaw-" | xargs -r docker stop || true

# 3. 호스트 데몬 부팅 (백그라운드로 던져서 명령어 블록 방지)
nohup systemctl --user start nanoclaw > /dev/null 2>&1 &
```
