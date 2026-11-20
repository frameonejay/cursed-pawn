# CURSED PAWN: 영혼 전당포

> 다섯 개의 주사위로 영혼의 빚을 갚는, 저주받은 전당포의 밤.
> HTML5 / Electron 기반 주사위 로그라이크 덱빌더 — **v1.2.0 정식 빌드 (Steam 대응)**.

- 한 판 15라운드: **5개의 밤 × 3라운드(일반 · 정예 · 보스)**
- 유물 **50종** · 부적 **16종** · 보스 저주 **10종** · 업적 **15종**
- **승천(Ascension) 0~5단계**, **엔드리스(밤 6~∞)**, **유물 도감**, **한/영 실시간 전환**

---

## 웹에서 바로 플레이 (GitHub Pages)

**https://frameonejay.github.io/cursed-pawn/**

- 설치 없이 브라우저에서 실행됩니다. `main` 브랜치에 푸시하면 Pages가 자동 재배포합니다.
- **모바일 대응**: 768px 이하에서 HUD가 줄바꿈되고 보드가 단일 열로 쌓입니다.
  주사위 5개가 한 줄에 들어가고 족보 버튼은 2열, 모든 모달은 화면 높이에 맞춰 스크롤됩니다.
  (320~430px 폭 확인)

---

## 바로 실행하기

### 1) 브라우저

```bash
python3 -m http.server 8080
# → http://localhost:8080
```

`index.html`을 파일로 직접 열어도(`file://`) 됩니다. 이때는 `data/game_data.json`
fetch가 막히므로 **내장 FALLBACK_DATA**(`tools/build_fallback.py`로 JSON과 동기화)로
동일한 콘텐츠를 플레이합니다.

### 2) Electron 데스크톱 (Steam 빌드)

```bash
npm install
npm start          # 개발 실행 (1280×800, 최소 1080×680)
npm run test       # 엔진 계약 테스트 183항목
npm run dist       # Windows NSIS + ZIP (electron-builder)
npm run dist:steam # dist/win-unpacked → dist/steam (Steam depot 준비)
```

Electron 빌드는 `app://local/index.html` 커스텀 프로토콜로 로드합니다. (`file://` CORS 회피)

### 3) Steamworks.js

1. Steamworks 파트너 사이트에서 App을 만들고 AppID를 받습니다.
2. `npm i steamworks.js`
3. 프로젝트 루트(개발) 또는 실행 파일 옆(배포)에 `steam_appid.txt`를 둡니다.
   (`CP_STEAM=1` 환경변수로도 켜집니다. 없으면 조용히 비활성 — 게임은 그대로 동작)
4. 업적 API 이름은 `ACH_<업적ID 대문자>` 규칙입니다.
   예) `first_contract` → `ACH_FIRST_CONTRACT`. 렌더러는 `window.cpSteam.achievement(id)`로만 호출합니다.

`npm run dist:steam`은 depot 폴더에 `steam_appid.txt`와 업적 API 목록(`STEAM_DEPOT.txt`)을
자동으로 넣습니다.

---

## 조작

| 입력 | 동작 |
|---|---|
| `SPACE` | 굴리기 / 리롤 |
| `1` ~ `5` | 해당 주사위 HOLD 토글 |
| `ENTER` | 선택한 족보로 정산 |
| `R` | 룰북 · 족보표 |
| `C` | 유물 도감 |
| `A` | 업적 |
| `P` | 설정 (BGM · SFX · 볼륨) |
| `M` | 사운드 On/Off |
| `ESC` | 모달 닫기 / 부적 대상 선택 취소 |
| `F11` | 전체화면 (Electron) |

주사위를 클릭해 HOLD, 족보 카드를 클릭해 정산할 족보를 바꿉니다.
부적은 슬롯을 클릭하면 즉시 발동하며, `뒤집기 · 고정 · 눈금 변환` 부적은 대상 주사위를 고르는 모드로 들어갑니다.

---

## v1.2의 핵심 시스템

### 승천 0~5
타이틀에서 단계를 고르고 시작합니다. 클리어하면 다음 단계가 영구 해금됩니다.
목표 점수 배율(+0~10%)과 **규칙**으로 난이도가 오릅니다.

| 단계 | 이름 | 목표 | 추가 규칙 |
|---|---|---|---|
| A0 | 맨몸의 계약 | ±0% | — |
| A1 | 이자 붙은 계약 | +2% | — |
| A2 | 겹친 장부 | +4% | — |
| A3 | 박자 없는 밤 | +6% | 밤 3부터 보스 리롤 −1 |
| A4 | 긴 밤 | +8% | + 밤 2부터 정예 리롤 −1 |
| A5 | 마지막 계약 | +10% | + 마지막 밤 보스 저주 2개 |

### 엔드리스 (밤 6~∞)
밤 5 보스를 격파하면 결과 화면에서 **런 종료 / 엔드리스 계속**을 고릅니다.
밤마다 3라운드, 목표 `6500 × 1.28^(n−6)`, 보스 저주는 5종 로테이션.
엔드리스에는 승리가 없고, 도달한 밤이 기록입니다(`title.endlessBest`).

### 유물 도감 · 업적
- 도감: 유물/부적/보스 저주/승천 4탭 + 등급 필터. 수집한 유물만 공개(미수집은 ❔).
- 업적 15종: 달성 시 상단 토스트 + 전용 효과음 + Steamworks 훅(`ACH_*`) + `localStorage` 영구 저장.

### 연출
- 주사위 굴림 회전·착지 바운스, HOLD 인장 락인.
- 정산: `칩 → 유물 순차 발동 → 배수 → 곱연산 → 총합` 카운트업.
  유물 행이 순서대로 튀며 빛나고 `+18` / `×1.4` 플로팅 수치 + 단계별 타격음(`playComboHit`).
- 1,000점 이상 · 야찌 · 보스 격파 시 화면 흔들림 + 파티클.
- `assets/soul-scale.png`(영혼의 저울)를 보스 패널과 도감 푸터의 비주얼 포인트로 사용.

---

## 파일 구조

```
games/cursed-pawn/
├─ index.html              화면 마크업 (타이틀 · 테이블 · 상점 · 결과 · 룰북 · 도감 · 업적 · 설정)
├─ styles.css              다크 판타지 전당포 UI + v1.2 연출 (파티클 · 셰이크 · 모달)
├─ js/i18n.js              window.CursedI18n — ko/en 각 414키
├─ js/audio.js             Web Audio 신디사이저 (다크 재즈 BGM 3모드 + 타격음)
├─ js/game.js              코어 엔진 + UI + 데이터 로더 + 내장 FALLBACK_DATA
├─ data/game_data.json     기획 데이터 v1.2.0 (유물 50 · 부적 16 · 저주 10 · 승천 6 · 업적 15 · 엔드리스)
├─ docs/GDD.md             게임 기획서
├─ tools/balance_sim.py    밸런스 시뮬레이터 (승천 0~5 · 10빌드 · 2,400런)
├─ tools/build_fallback.py FALLBACK_DATA ↔ JSON 동기화 (--check)
├─ tools/package_steam.js  Steam depot 폴더 준비
├─ tools/qa/               엔진 계약 회귀 테스트 (DOM 스텁) · viewport.html (고정 크기 QA 프레임)
├─ electron-main.js        Electron 엔트리 + steamworks.js 연동
├─ preload.js              contextBridge (Steam IPC)
├─ package.json            실행 · 테스트 · 패키징 스크립트
└─ assets/                 주인장 초상화 · 테이블 배경 · 영혼의 저울 · 스팀 캡슐/헤더
```

---

## 점수 · 데이터 계약

```
최종 점수 = floor( (기본 칩 + Σ 유물 칩)
                 × (기본 배수 + Σ 유물 배수 + 부적)
                 × Π mul_mult )
```

- 주사위 눈금 합은 **칩에 더하지 않습니다.** 눈금은 족보 성립과 조건 판정에만 쓰입니다.
- `mul_mult` 유물은 **모두 곱한 뒤 한 번만** 적용합니다.
- `on_roll` 유물은 **핸드당 1회(첫 굴림)** 만 발동합니다.
- `reward_gold` 지급 → 유물 골드 보너스·이자 → `tax_gold` 저주 압수 순서입니다.
- `add_chips_per_reroll` = `value × 이번 핸드 리롤 허용량`, `add_mult_per_hands_left` = `value × 남은 핸드`,
  `add_chips_per_gold` = `value × floor(gold / scale)`, `add_mult_per_charm` = `value × 보유 부적 수`.
- `shop_discount` = `ceil(price × (1 − value/100))`, `interest_gold` = 클리어 시 `value × floor(gold / scale)`.

### 조건 (schema.conditions)
`always` · `even_count[_N]` · `odd_count[_N]` · `pair_or_better` · `three_kind_or_better` ·
`four_kind_or_better` · `full_house_or_better` · `yahtzee_or_better` · `straight` · `large_straight` ·
`one~six_present` · `six_count_2` · `last_hand` · `gold_over_15` · `gold_at_least_N` ·
`sum_at_most_14/15` · `sum_at_least_22` · `boss_round`

### 보스 저주 10종 (modifier 기반)

| id | modifier | 동작 |
|---|---|---|
| `minus_reroll` | `reroll_delta:-1` | 리롤 1회 |
| `tax_gold` | `gold_tax_on_clear:3` | 클리어 시 골드 3 압수 |
| `cap_six_to_three` | `pip_map:{6:3}` | 6을 3으로 (족보·조건 모두) |
| `no_pair_bonus` | `pair_mult_delta:-1` | 페어 계열 기본 배수 −1 |
| `no_even` | `hold_block:"even"` | 짝수 HOLD 불가 |
| `min_hand_three_kind` | `min_hand_rank:3` | 트리플 미만 정산 불가 |
| `reroll_first_double` | `first_reroll_cost:2` | 첫 리롤이 2회 소모 |
| `odd_locked` | `hold_block:"odd"` | 홀수 HOLD 불가 |
| `six_blind` | `condition_pip_void:6` | 조건 판정에서 6 무시 |
| `no_relic_conditions` | `disable_conditions:true` | 상시 외 조건 전부 거짓 |

부적 `grave_water`(저주 약화: 수치 절반·홀드/핍 무효 해제)와
`iron_contract`(저주 완전 무효)가 이 modifier를 실시간으로 덮어씁니다.

---

## 검증

```bash
npm run test        # = node tools/qa/engine_test.js
npm run balance     # = python3 tools/balance_sim.py
npm run fallback    # FALLBACK_DATA 동기화 확인
```

- **엔진 계약 테스트 183/183 통과** — 손패 9종 점수, 조건 전종, 저주 10종 modifier,
  신규 유물/부적 효과, 승천 목표·리롤 페널티·이중 저주, 엔드리스 밤 생성, 업적·Steam 훅,
  도감/업적/설정 모달, i18n ko/en 키 정합, 15라운드 완주.
- **밸런스 시뮬레이터 12/12 체크 통과** — A0 완주율 **21.8%**, A5 **12.5%** (각 400런).
  A0 라운드 게이트: N1R2 92.0% · N2R1 75.8% · N3R1 83.7% · N5R3 93.5%.

---

## 크레딧

- 기획 · 밸런스 · 아트 디렉션: 이재근 (Frame One Studio)
- 엔진 · 연출 · 로컬라이즈: CURSED PAWN 팀
- 사운드: Web Audio API 프로시저럴 신디시스 (외부 음원 없음)

© 2026 Frame One Studio. All rights reserved.
