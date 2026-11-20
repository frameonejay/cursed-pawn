# CURSED PAWN: 영혼 전당포

> 다섯 개의 주사위로 영혼의 빚을 갚는, 저주받은 전당포의 밤.
> HTML5 / Electron 기반 주사위 로그라이크 덱빌더 — Steam 데스크톱 빌드 대응.

- 한 판 15라운드: **5개의 밤 × 3라운드(일반 · 정예 · 보스)**
- 매 라운드 목표 영혼 점수를 넘기면 상점에서 유물(최대 6)·부적(최대 3)을 삽니다.
- 보스는 매 밤 규칙 하나를 뒤틀고(저주), 다섯 밤을 버티면 계약이 갱신됩니다.

---

## 바로 실행하기

### 1) 브라우저에서

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

`index.html`을 파일로 직접 열어도(`file://`) 됩니다. 이때는 `data/game_data.json`
fetch가 막히므로 **내장 fallback 데이터**로 동일한 밸런스로 플레이됩니다.

### 2) Electron 데스크톱 (Steam 빌드)

```bash
npm install
npm start          # 개발 실행 (1280x800 창)
npm run dist       # Windows NSIS + ZIP 패키징 (electron-builder)
```

Electron 빌드는 `app://local/index.html` 커스텀 프로토콜로 로드하므로
`data/game_data.json`이 정상적으로 fetch됩니다. (`file://` CORS 회피)

### 3) Steamworks.js

`electron-main.js` 상단의 `STEAM_ENABLED`를 `true`로 바꾸고,
`steam_appid.txt`를 실행 파일 옆에 두면 `steamworks.js` 업적/스탯 IPC가 켜집니다.
렌더러는 `preload.js`의 `window.cpSteam` 브리지만 사용합니다.

---

## 조작

| 입력 | 동작 |
|---|---|
| `SPACE` | 굴리기 / 리롤 |
| `1` ~ `5` | 해당 주사위 HOLD 토글 |
| `ENTER` | 선택한 족보로 정산 |
| `R` | 룰북·족보표 |
| `M` | 사운드 On/Off |
| `ESC` | 모달 닫기 / 부적 대상 선택 취소 |
| `F11` | 전체화면 (Electron) |

주사위를 클릭해도 HOLD 되고, 족보 카드를 클릭해 정산할 족보를 바꿀 수 있습니다.
부적은 슬롯을 클릭하면 즉시 발동합니다. (휘어진 동전은 대상 주사위를 고르는 모드)

---

## 파일 구조

```
games/cursed-pawn/
├─ index.html              화면 마크업 (타이틀 · 테이블 · 상점 · 결과 · 룰북)
├─ styles.css              다크 판타지 전당포 UI (녹색 펠트 테이블, 황동/뼈 톤)
├─ js/audio.js             Web Audio API 신디사이저 (외부 사운드 파일 없음)
├─ js/game.js              코어 엔진 + UI + 데이터 로더 + 내장 fallback
├─ data/game_data.json     기획 데이터 (손패 9 · 유물 24 · 부적 8 · 밤 5)
├─ docs/GDD.md             게임 기획서
├─ tools/balance_sim.py    밸런스 시뮬레이터 (기획팀)
├─ tools/qa/               엔진 계약 회귀 테스트 (아래 참고)
├─ electron-main.js        Electron 엔트리 + steamworks.js 연동 포인트
├─ preload.js              contextBridge (Steam IPC)
├─ package.json            실행/패키징 스크립트
└─ assets/                 주인장 초상화 · 테이블 배경 · 스팀 캡슐 아트
```

---

## 점수 · 데이터 계약

```
최종 점수 = floor( (기본 칩 + Σ add_chips)
                 × (기본 배수 + Σ add_mult + 부적 temp_mult)
                 × Π mul_mult )
```

- 주사위 눈금 합은 **칩에 더하지 않습니다.** 눈금은 족보 성립과 조건 판정에만 쓰입니다.
- `mul_mult` 유물은 **모두 곱한 뒤 한 번만** 적용합니다.
- `on_roll` 유물은 **핸드당 1회(첫 굴림)** 만 발동합니다. 리롤해도 중복되지 않습니다.
- `reward_gold` 지급 **후** `tax_gold` 저주가 3골드를 압수합니다(최소 0).

### 유물 조건 9종

| condition | 참이 되는 조건 |
|---|---|
| `always` | 항상 |
| `even_count` | 주사위 5개 중 짝수 눈금 3개 이상 |
| `odd_count` | 홀수 눈금 3개 이상 |
| `pair_or_better` | 선택한 족보가 원 페어 이상 |
| `straight` | 스몰/라지 스트레이트 |
| `six_present` | 6 눈금 1개 이상 |
| `one_present` | 1 눈금 1개 이상 |
| `last_hand` | 라운드 마지막 핸드(남은 핸드 1) |
| `gold_over_15` | 보유 골드 15 이상 |

### 보스 저주 5종

| id | 동작 |
|---|---|
| `minus_reroll` | 해당 라운드 리롤 1회 |
| `tax_gold` | 클리어 시 골드 3 압수 (보상 지급 후, 최소 0) |
| `cap_six_to_three` | 6 눈금을 3으로 계산 (족보·조건 모두) |
| `no_pair_bonus` | 페어 계열 기본 배수 −1 (최소 1) |
| `no_even` | 짝수 눈금 주사위 HOLD 불가 |

`game_data.json`이 있으면 항상 그 데이터를 우선 사용하고, 없거나 `file://`이라
fetch가 실패하면 `js/game.js`의 `FALLBACK_DATA`(동일 스냅샷)로 자동 전환합니다.
어떤 소스로 동작 중인지는 룰북 하단 **데이터 소스**에 표시됩니다.

---

## 검증

```bash
node tools/qa/engine_test.js
```

DOM 스텁 위에서 실제 `js/game.js`를 실행해 **109개 계약 검사**를 수행합니다.
(족보 9종 점수, 조건 9종 임계값, 저주 5종, on_roll 1회, mul_mult 단일 적용,
상점 구매/리롤, 부적 5종, 게임오버/승리, localStorage 기록, JSON/폴백 양쪽 로드)

밸런스 재검증은 기획팀 도구로:

```bash
python3 tools/balance_sim.py
```
