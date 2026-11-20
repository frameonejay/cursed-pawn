/* CURSED PAWN 엔진 계약 회귀 테스트
   실행: node tools/qa/engine_test.js
   - game_data.json 로드/폴백, 족보·조건·저주·유물·부적·상점·기록을 검증한다. */
'use strict';
const fs = require('fs');
const path = require('path');
const { buildSandbox, runGame, GAME_DIR } = require('./dom-harness');

const DATA = JSON.parse(fs.readFileSync(path.join(GAME_DIR, 'data', 'game_data.json'), 'utf8'));

const results = [];
function check(name, cond, extra) {
  results.push({ name, pass: !!cond, extra: extra === undefined ? '' : extra });
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
function click(el) {
  (el._listeners.click || []).forEach(fn => fn({ stopPropagation() {}, preventDefault() {}, target: el }));
}

function fetchFail() {
  return Promise.reject(new Error('no file (file:// simulation)'));
}
function fetchOk() {
  return Promise.resolve({
    ok: true,
    json: () => Promise.resolve(DATA)
  });
}

(async function main() {
  /* ─────────────────────── 시나리오 A: fallback ─────────────────────── */
  const A = buildSandbox({ fetch: fetchFail });
  runGame(A.sandbox);
  await sleep(150);
  const CP = A.sandbox.CP;
  const S = CP && CP.state;

  check('A1: window.CP 생성됨', !!CP);
  if (!CP) { print(); return; }
  check('A2: fetch 실패 시 fallback 데이터 사용', CP.dataSource() === 'fallback', CP.dataSource());
  check('A3: 손패 9종 로드', CP.data.hands.length === 9, CP.data.hands.length);
  check('A4: 유물 50종 로드', CP.data.relics.length === 50, CP.data.relics.length);
  check('A5: 부적 16종 로드', CP.data.charms.length === 16, CP.data.charms.length);
  check('A6: 라운드 15개', CP.rounds.length === 15, CP.rounds.length);

  // 런 시작
  CP.startRun();
  await sleep(60);
  check('A7: 런 시작 시 밤1/라운드1/목표150', S.night === 1 && S.roundNum === 1 && S.target === 150, JSON.stringify({ n: S.night, r: S.roundNum, t: S.target }));
  check('A8: 시작 골드 5 (meta)', S.gold === 5, S.gold);
  check('A9: 시작 핸드 4', S.hands === 4, S.hands);
  check('A10: 시작 리롤 2', S.rerolls === 2, S.rerolls);
  check('A11: 기회 시작 시 주사위 5개 대기', S.dice.length === 5 && S.dice.every(d => d.value === 0), JSON.stringify(S.dice));
  check('A11a: 굴리기 전에는 정산 불가', CP.computeScore('high_card') === null);
  check('A11b: 버튼 라벨 "굴리기"', A.document.getElementById('btn-roll-label').textContent === '굴리기', A.document.getElementById('btn-roll-label').textContent);
  click(A.document.getElementById('btn-roll'));
  check('A11c: 굴리기 → 1~6 눈금', S.phase === 'rolled' && S.dice.every(d => d.value >= 1 && d.value <= 6), JSON.stringify(S.dice.map(d => d.value)));
  check('A11d: 굴린 뒤 자동 족보 선택', !!S.selectedHand, S.selectedHand);

  // 족보 판정 + 기본 점수 (유물 없음)
  const cases = [
    { dice: [6, 6, 6, 2, 2], best: 'full_house', score: 160, hand: 'full_house' },
    { dice: [5, 5, 5, 5, 5], best: 'yahtzee', score: 800, hand: 'yahtzee' },
    { dice: [2, 2, 2, 2, 6], best: 'four_kind', score: 420, hand: 'four_kind' },
    { dice: [4, 4, 4, 1, 2], best: 'three_kind', score: 90, hand: 'three_kind' },
    { dice: [3, 3, 5, 5, 1], best: 'two_pair', score: 40, hand: 'two_pair' },
    { dice: [1, 2, 3, 4, 6], best: 'small_straight', score: 120, hand: 'small_straight' },
    { dice: [2, 3, 4, 5, 6], best: 'large_straight', score: 160, hand: 'large_straight' },
    { dice: [6, 5, 4, 2, 1], best: 'high_card', score: 5, hand: 'high_card' }
  ];
  cases.forEach((c, i) => {
    const picked = CP.setDice(c.dice);
    const bd = CP.computeScore(c.hand);
    check(`A12.${i}: ${c.dice.join('')} → best=${c.best}`, picked === c.best, picked);
    check(`A12.${i}b: ${c.hand} 점수 ${c.score}`, bd && bd.total === c.score, bd ? bd.total : 'null');
  });

  // 불가능한 족보
  CP.setDice([6, 6, 6, 2, 2]);
  check('A13: 풀하우스에서 포카드 불가', CP.computeScore('four_kind') === null);
  check('A14: 풀하우스에서 야찌 불가', CP.computeScore('yahtzee') === null);

  // 조건 판정
  const ctx = (over) => Object.assign({ vals: [1, 2, 3, 4, 5], handId: 'high_card', handRank: 0, handsLeft: 2, gold: 0 }, over);
  check('A15: even_count 3개 이상 true', CP.conditionMet('even_count', ctx({ vals: [2, 4, 6, 1, 3] })) === true);
  check('A16: even_count 2개 false', CP.conditionMet('even_count', ctx({ vals: [2, 4, 1, 3, 5] })) === false);
  check('A17: odd_count 3개 이상 true', CP.conditionMet('odd_count', ctx({ vals: [1, 3, 5, 2, 4] })) === true);
  check('A18: odd_count 2개 false', CP.conditionMet('odd_count', ctx({ vals: [1, 3, 2, 4, 6] })) === false);
  check('A19: six_present true', CP.conditionMet('six_present', ctx({ vals: [6, 1, 2, 3, 4] })) === true);
  check('A20: six_present false', CP.conditionMet('six_present', ctx({ vals: [1, 2, 3, 4, 5] })) === false);
  check('A21: one_present true', CP.conditionMet('one_present', ctx({ vals: [1, 2, 3, 4, 5] })) === true);
  check('A22: pair_or_better (원페어) true', CP.conditionMet('pair_or_better', ctx({ handId: 'one_pair', handRank: 1 })) === true);
  check('A23: pair_or_better (하이카드) false', CP.conditionMet('pair_or_better', ctx({ handId: 'high_card', handRank: 0 })) === false);
  check('A24: straight (스몰) true', CP.conditionMet('straight', ctx({ handId: 'small_straight', handRank: 4 })) === true);
  check('A25: straight (라지) true', CP.conditionMet('straight', ctx({ handId: 'large_straight', handRank: 5 })) === true);
  check('A26: straight (트리플) false', CP.conditionMet('straight', ctx({ handId: 'three_kind', handRank: 3 })) === false);
  check('A27: last_hand 남은핸드 1 true', CP.conditionMet('last_hand', ctx({ handsLeft: 1 })) === true);
  check('A28: last_hand 남은핸드 2 false', CP.conditionMet('last_hand', ctx({ handsLeft: 2 })) === false);
  check('A29: gold_over_15 골드15 true', CP.conditionMet('gold_over_15', ctx({ gold: 15 })) === true);
  check('A30: gold_over_15 골드14 false', CP.conditionMet('gold_over_15', ctx({ gold: 14 })) === false);
  check('A31: always true', CP.conditionMet('always', ctx()) === true);

  /* ─────────────────── 유물 점수 공식 (칩/배수/곱) ─────────────────── */
  CP.startRun();
  await sleep(30);
  S.gold = 100;
  CP.addRelic('rusty_locket');    // +18 chips always
  CP.addRelic('cracked_monocle'); // +2 mult always
  CP.setDice([3, 3, 5, 1, 2]);
  let bd = CP.computeScore('one_pair');
  check('B1: (10+18)×(2+2)=112', bd && bd.total === 112, bd && bd.total);
  check('B2: 칩 합계 28', bd && bd.chips === 28, bd && bd.chips);
  check('B3: 배수 합계 4', bd && bd.mult === 4, bd && bd.mult);

  CP.addRelic('gilded_grin'); // ×1.4 always
  bd = CP.computeScore('one_pair');
  check('B4: ×1.4 → floor(112×1.4)=156', bd && bd.total === 156, bd && bd.total);
  check('B5: 곱연산 목록 [1.4]', bd && bd.muls.length === 1 && bd.muls[0] === 1.4, JSON.stringify(bd && bd.muls));

  // 조건부 유물: even_tally (+30 chips, even 3+)
  CP.startRun();
  await sleep(30);
  CP.addRelic('even_tally');
  CP.setDice([2, 4, 6, 2, 1]);  // one pair of 2, even=4
  bd = CP.computeScore('one_pair');
  check('B6: even_tally 조건 충족 (10+30)×2=80', bd && bd.total === 80, bd && bd.total);
  CP.setDice([2, 4, 3, 5, 1]);  // even=2 → condition false, high card 5×1
  bd = CP.computeScore('high_card');
  check('B7: even_tally 조건 미충족 → 5', bd && bd.total === 5, bd && bd.total);

  // last_hand 유물
  CP.startRun();
  await sleep(30);
  CP.addRelic('last_rites'); // ×1.35 last_hand
  CP.setDice([3, 3, 1, 2, 4]);
  S.hands = 2;
  bd = CP.computeScore('one_pair');
  check('B8: last_rites 남은핸드 2 → 20', bd && bd.total === 20, bd && bd.total);
  S.hands = 1;
  bd = CP.computeScore('one_pair');
  check('B9: last_rites 남은핸드 1 → floor(20×1.25)=25', bd && bd.total === 25, bd && bd.total);

  // 골드 조건 유물
  CP.startRun();
  await sleep(30);
  CP.addRelic('coin_purse'); // ×1.45 gold>=15
  CP.setDice([3, 3, 1, 2, 4]);
  S.gold = 14;
  bd = CP.computeScore('one_pair');
  check('B10: coin_purse 골드14 → 20', bd && bd.total === 20, bd && bd.total);
  S.gold = 15;
  bd = CP.computeScore('one_pair');
  check('B11: coin_purse 골드15 → floor(20×1.3)=26', bd && bd.total === 26, bd && bd.total);

  // six_bell (6 포함 시 +7 mult)
  CP.startRun();
  await sleep(30);
  CP.addRelic('six_bell');
  CP.setDice([6, 6, 2, 3, 4]);
  S.hands = 2;
  bd = CP.computeScore('one_pair');
  check('B12: six_bell → 10×(2+7)=90', bd && bd.total === 90, bd && bd.total);

  /* ─────────────────────── 저주 5종 ─────────────────────── */
  // 1) minus_reroll (index 2)
  CP.startRun();
  await sleep(30);
  CP.gotoRound(2);
  await sleep(30);
  check('C1: minus_reroll → 리롤 1', S.rerolls === 1 && S.rerollsMax === 1, S.rerolls + '/' + S.rerollsMax);

  // 2) cap_six_to_three (index 8)
  CP.startRun();
  await sleep(30);
  CP.gotoRound(8);
  await sleep(30);
  CP.addRelic('six_bell');
  CP.setDice([6, 3, 6, 3, 6]);
  const bestCap = CP.computeScore('yahtzee');
  check('C2: cap_six_to_three → 6을 3으로 보고 야찌 성립', !!bestCap, bestCap && bestCap.total);
  check('C3: cap_six_to_three → six_bell 미발동(800)', bestCap && bestCap.total === 800, bestCap && bestCap.total);

  // 3) no_pair_bonus (index 11)
  CP.startRun();
  await sleep(30);
  CP.gotoRound(11);
  await sleep(30);
  CP.setDice([3, 3, 5, 5, 1]);
  bd = CP.computeScore('two_pair');
  check('C4: no_pair_bonus 투페어 배수 2→1 (20)', bd && bd.total === 20, bd && bd.total);
  CP.setDice([4, 4, 4, 1, 2]);
  bd = CP.computeScore('three_kind');
  check('C5: no_pair_bonus 트리플 배수 3→2 (60)', bd && bd.total === 60, bd && bd.total);
  CP.setDice([6, 6, 6, 6, 2]);
  bd = CP.computeScore('four_kind');
  check('C6: no_pair_bonus 포카드 배수 7→6 (360)', bd && bd.total === 360, bd && bd.total);
  CP.setDice([3, 3, 1, 2, 4]);
  bd = CP.computeScore('one_pair');
  check('C6b: no_pair_bonus 원페어 배수 2→1 (10)', bd && bd.total === 10, bd && bd.total);
  CP.setDice([6, 5, 4, 2, 1]);
  bd = CP.computeScore('high_card');
  check('C6c: no_pair_bonus 하이카드는 영향 없음 (5)', bd && bd.total === 5, bd && bd.total);

  // 4) no_even (index 14) — 홀드 불가
  CP.startRun();
  await sleep(30);
  CP.gotoRound(14);
  await sleep(30);
  CP.setDice([2, 3, 1, 5, 4]);
  const stage = A.document.getElementById('dice-stage');
  let diceEls = stage.querySelectorAll('.die');
  click(diceEls[0]);  // value 2 (even)
  check('C7: no_even → 짝수 주사위 홀드 불가', S.dice[0].held === false, S.dice[0].held);
  click(diceEls[1]);  // value 3
  check('C8: no_even → 홀수 주사위는 홀드 가능', S.dice[1].held === true, S.dice[1].held);

  // 5) tax_gold (index 5) — 클리어 시 3 골드 압수
  CP.startRun();
  await sleep(30);
  CP.gotoRound(5);
  await sleep(30);
  S.gold = 10;
  S.score = S.target - 10;
  CP.setDice([5, 5, 5, 5, 5]);
  CP.scoreSelected();
  await sleep(2600);
  check('C9: tax_gold 클리어 후 골드 10+8-3=15', S.gold === 15, S.gold);
  check('C10: 클리어 후 상점 오픈', !A.document.getElementById('overlay-shop').classList.contains('hidden'), A.document.getElementById('overlay-shop').className);

  /* ─────────────────────── 부적 ─────────────────────── */
  const B = buildSandbox({ fetch: fetchOk });
  runGame(B.sandbox);
  await sleep(150);
  const CP2 = B.sandbox.CP;
  const S2 = CP2.state;
  check('D0: fetch 성공 시 game_data.json 사용', CP2.dataSource() === 'json', CP2.dataSource());
  check('D0b: JSON 손패 9종/유물 50/부적 16/라운드 15',
    CP2.data.hands.length === 9 && CP2.data.relics.length === 50 && CP2.data.charms.length === 16 && CP2.rounds.length === 15,
    `${CP2.data.hands.length}/${CP2.data.relics.length}/${CP2.data.charms.length}/${CP2.rounds.length}`);
  check('D0c: JSON 목표 커브 150/400/330 … 4900/5200/6000 (밤2·3 −10%)',
    CP2.rounds[0].target_score === 150 && CP2.rounds[1].target_score === 400 && CP2.rounds[2].target_score === 330 &&
    CP2.rounds[3].target_score === 1260 && CP2.rounds[4].target_score === 1530 && CP2.rounds[5].target_score === 1170 &&
    CP2.rounds[6].target_score === 2610 && CP2.rounds[7].target_score === 2790 &&
    CP2.rounds[12].target_score === 4900 && CP2.rounds[13].target_score === 5200 && CP2.rounds[14].target_score === 6000,
    CP2.rounds.map(r => r.target_score).join('/'));
  check('D0d: JSON 보스 핸드 3 / 일반 4',
    CP2.rounds[0].hands_allowed === 4 && CP2.rounds[2].hands_allowed === 3,
    `${CP2.rounds[0].hands_allowed}/${CP2.rounds[2].hands_allowed}`);
  check('D0e: JSON gilded_grin ×1.4', CP2.data.relics.find(r => r.id === 'gilded_grin').value === 1.4);
  check('D0f: JSON no_pair_bonus 설명 "최소 1"', /최소 1/.test(CP2.rounds[11].boss_desc_ko), CP2.rounds[11].boss_desc_ko);

  CP2.startRun();
  await sleep(30);
  CP2.addCharm('crooked_coin');
  CP2.setDice([2, 2, 3, 4, 5]);
  const charmSlots = B.document.getElementById('charm-slots');
  click(charmSlots.querySelectorAll('.charm-slot')[0]);
  check('D1: flip 부적 클릭 → 대상 선택 모드', S2.focusCharm === 0, S2.focusCharm);
  let dice2 = B.document.getElementById('dice-stage').querySelectorAll('.die');
  click(dice2[0]);
  check('D2: 2 → 5로 뒤집힘', S2.dice[0].value === 5, S2.dice[0].value);
  check('D3: 부적 소모', S2.charms.length === 0, S2.charms.length);

  CP2.addCharm('lucky_ash');   // all_plus_one 1
  CP2.setDice([1, 2, 3, 4, 5]);
  click(B.document.getElementById('charm-slots').querySelectorAll('.charm-slot')[0]);
  check('D4: all_plus_one → 눈금 +1', S2.dice.map(d => d.value).join(',') === '2,3,4,5,6', S2.dice.map(d => d.value).join(','));
  check('D5: 라운드 지속 보정 기록', S2.roundPipBonus === 1, S2.roundPipBonus);

  CP2.addCharm('extra_palm');  // hand_plus 1
  const handsBefore = S2.hands;
  click(B.document.getElementById('charm-slots').querySelectorAll('.charm-slot')[0]);
  check('D6: hand_plus → 핸드 +1', S2.hands === handsBefore + 1, `${handsBefore} → ${S2.hands}`);

  CP2.addCharm('soul_flask');  // temp_mult 5
  const beforeMult = CP2.computeScore('one_pair') ? CP2.computeScore('one_pair').total : null;
  click(B.document.getElementById('charm-slots').querySelectorAll('.charm-slot')[0]);
  CP2.setDice([3, 3, 1, 2, 4]);
  const afterMult = CP2.computeScore('one_pair');
  check('D7: temp_mult +5 → (10)×(2+5)=70', afterMult && afterMult.total === 70, afterMult && afterMult.total);

  /* ─────────────────────── 상점 ─────────────────────── */
  CP2.state.gold = 100;
  // 라운드 클리어 강제 → 상점
  CP2.state.score = CP2.state.target - 1;
  CP2.setDice([6, 6, 6, 6, 6]);
  CP2.scoreSelected();
  await sleep(2400);
  check('E1: 상점 열림', !B.document.getElementById('overlay-shop').classList.contains('hidden'));
  check('E2: 유물 3개 진열', CP2.state.shop && CP2.state.shop.relics.length === 3, CP2.state.shop && CP2.state.shop.relics.length);
  check('E3: 부적 2개 진열', CP2.state.shop && CP2.state.shop.charms.length === 2, CP2.state.shop && CP2.state.shop.charms.length);

  const goldBefore = CP2.state.gold;
  const relicCards = B.document.getElementById('shop-relics').querySelectorAll('.shop-card');
  const buyBtn = relicCards[0].querySelectorAll('.sc-buy')[0];
  const cost = CP2.state.shop.relics[0].def.cost;
  if (!buyBtn.disabled) {
    click(buyBtn);
    check('E4: 유물 구매 → 골드 차감', CP2.state.gold === goldBefore - cost, `${goldBefore} → ${CP2.state.gold} (cost ${cost})`);
    check('E5: 유물 슬롯 +1', CP2.state.relics.length === 1, CP2.state.relics.length);
  } else {
    check('E4: 유물 구매 버튼 활성', false, 'disabled');
    check('E5: 유물 슬롯', false);
  }

  const goldBeforeReroll = CP2.state.gold;
  click(B.document.getElementById('btn-shop-reroll'));
  check('E6: 상점 리롤 −3 골드', CP2.state.gold === goldBeforeReroll - 3, `${goldBeforeReroll} → ${CP2.state.gold}`);

  const roundBefore = CP2.state.roundIndex;
  click(B.document.getElementById('btn-next-round'));
  check('E7: 다음 라운드 진행', CP2.state.roundIndex === roundBefore + 1, `${roundBefore} → ${CP2.state.roundIndex}`);
  check('E8: 상점 닫힘', B.document.getElementById('overlay-shop').classList.contains('hidden'));

  /* ─────────────────────── 언어 전환 ─────────────────────── */
  click(B.document.getElementById('btn-lang'));
  check('F1: 언어 EN 전환', CP2.state.lang === 'en', CP2.state.lang);
  check('F2: html lang=EN', B.document.documentElement.lang === 'en', B.document.documentElement.lang);
  click(B.document.getElementById('btn-lang'));
  check('F3: 언어 KO 복귀', CP2.state.lang === 'ko', CP2.state.lang);

  /* ─────────────────── 게임오버 / 승리 / 판매 ─────────────────── */
  const C = buildSandbox({ fetch: fetchOk });
  runGame(C.sandbox);
  await sleep(150);
  const CP3 = C.sandbox.CP;
  const S3 = CP3.state;

  CP3.startRun();
  await sleep(30);
  S3.hands = 1;
  CP3.setDice([6, 5, 4, 2, 1]);
  S3.selectedHand = 'high_card';
  CP3.scoreSelected();
  await sleep(3000);
  check('H1: 목표 미달 + 핸드 소진 → 게임오버', S3.phase === 'over', S3.phase);
  check('H2: 게임오버 결과 화면 표시', !C.document.getElementById('overlay-result').classList.contains('hidden'));

  CP3.startRun();
  await sleep(30);
  CP3.gotoRound(14);
  await sleep(30);
  S3.score = S3.target - 1;
  CP3.setDice([4, 4, 4, 4, 4]);
  CP3.scoreSelected();
  await sleep(3400);
  check('H3: 마지막 라운드 클리어 → 승리·엔드리스 선택', S3.phase === 'endlessChoice', S3.phase);
  check('H3b: 승리 결과 화면에 엔드리스 선택 버튼', !C.document.getElementById('overlay-result').classList.contains('hidden')
    && !C.document.getElementById('result-endless').classList.contains('hidden'));
  click(C.document.getElementById('btn-end-run'));
  check('H3c: "런 종료" → 타이틀 복귀', S3.phase === 'won' && S3.screen === 'title', `${S3.phase}/${S3.screen}`);
  check('H4: 런 종료 후 결과 모달이 닫히고 타이틀 표시', C.document.getElementById('overlay-result').classList.contains('hidden')
    && C.document.getElementById('screen-title').classList.contains('is-active'));

  // 유물 판매 (툴팁 → 확인 모달)
  CP3.startRun();
  await sleep(30);
  CP3.addRelic('rusty_locket');
  const slot = C.document.getElementById('relic-slots').querySelectorAll('.relic-slot')[0];
  (slot._listeners.mouseenter || []).forEach(f => f());
  const tt = C.document.getElementById('tooltip');
  const sellBtn = tt.children[tt.children.length - 1];
  const goldBeforeSell = S3.gold;
  click(sellBtn);
  check('I1: 판매 확인 모달 표시', !C.document.getElementById('modal-confirm').classList.contains('hidden'));
  click(C.document.getElementById('btn-confirm-yes'));
  check('I2: 유물 판매 → 제거 + 골드 2', S3.relics.length === 0 && S3.gold === goldBeforeSell + 2, `${S3.relics.length} / ${goldBeforeSell}→${S3.gold}`);

  /* ─────────────── on_roll 1회 / mul_mult 1회 적용 ─────────────── */
  const D = buildSandbox({ fetch: fetchOk });
  runGame(D.sandbox);
  await sleep(150);
  const CP4 = D.sandbox.CP;
  const S4 = CP4.state;

  CP4.startRun();
  await sleep(30);
  CP4.addRelic('bone_die'); // on_roll +10 chips, 핸드당 1회
  CP4.setDice([3, 3, 1, 2, 4]);
  check('J1: on_roll +10 칩 반영 (10+10)×2=40', S4.handBonus.chips === 10 && CP4.computeScore('one_pair').total === 40,
    `${S4.handBonus.chips} / ${CP4.computeScore('one_pair').total}`);
  CP4.roll();
  await sleep(40);
  CP4.roll();
  await sleep(40);
  check('J2: 리롤 2회 후에도 on_roll 보너스 1회분만', S4.handBonus.chips === 10 && S4.handBonus.rows.length === 1,
    `${S4.handBonus.chips} / ${S4.handBonus.rows.length}`);

  CP4.startRun();
  await sleep(30);
  CP4.addRelic('gilded_grin');   // ×1.4 always
  CP4.addRelic('mirror_shard');  // ×1.15 even_count
  CP4.setDice([2, 2, 3, 4, 6]);  // 원페어(2,2), 짝수 4개
  const bdMul = CP4.computeScore('one_pair');
  check('J3: mul_mult 두 개를 곱해 1회 적용 → floor(20×1.4×1.15)=32',
    bdMul && bdMul.total === 32 && bdMul.mulProduct === 1.61, bdMul && `${bdMul.total} / ${bdMul.mulProduct}`);

  /* ─────────────────────── 최고 기록 ─────────────────────── */
  const savedC = JSON.parse(C.storage.getItem('cursedPawn.save.v1') || '{}');
  check('G1: localStorage에 최고 기록 저장', !!savedC.best && typeof savedC.best.score === 'number', JSON.stringify(savedC.best));
  check('G2: 승리 횟수 기록', savedC.best && savedC.best.wins === 1, savedC.best && savedC.best.wins);

  /* ─────────────── 15라운드 완주 (전 구간 전환 · 최종 데이터) ─────────────── */
  const E = buildSandbox({ fetch: fetchOk });
  runGame(E.sandbox);
  await sleep(150);
  const CP5 = E.sandbox.CP;
  const S5 = CP5.state;

  CP5.startRun();
  await sleep(40);

  let guard = 0;
  while (S5.phase !== 'won' && S5.phase !== 'over' && S5.phase !== 'endlessChoice' && guard < 20) {
    guard += 1;
    if (S5.phase === 'idle') CP5.roll();
    S5.score = S5.target - 1;           // 매 라운드 클리어 강제
    CP5.setDice([6, 6, 6, 2, 2]);       // 풀 하우스
    CP5.scoreSelected();
    await sleep(1900);
    if (S5.phase === 'won') break;
    if (S5.phase === 'shop') {
      click(E.document.getElementById('btn-next-round'));
      await sleep(140);
    }
  }
  check('K1: 15라운드 완주 → 승리(엔드리스 선택)', S5.phase === 'endlessChoice' || S5.phase === 'won', `${S5.phase} / round ${S5.roundIndex}`);
  check('K2: 최종 밤 5 · 라운드 3', S5.night === 5 && S5.roundNum === 3, `${S5.night}-${S5.roundNum}`);
  check('K3: 라운드 전환 15회 이내 (무한루프 없음)', guard <= 15, guard);
  const savedE = JSON.parse(E.storage.getItem('cursedPawn.save.v1') || '{}');
  check('K4: 완주 기록 저장 (밤 5)', savedE.best && savedE.best.night === 5 && savedE.best.wins >= 1, JSON.stringify(savedE.best));

  /* ═══════════════════════════════════════════════════════════════════
     신규 기능 검증 (v1.1 데이터 · 엔진 통합 · 승천 · 엔드리스 · 업적 · i18n)
     ═══════════════════════════════════════════════════════════════════ */

  /* ─────────── L. 신규 조건 5종 + 확장 표기 ─────────── */
  const L = buildSandbox({ fetch: fetchOk });
  runGame(L.sandbox);
  await sleep(150);
  const CPL = L.sandbox.CP;
  const SL = CPL.state;
  const lctx = (over) => Object.assign({ vals: [1, 2, 3, 4, 5], handId: 'high_card', handRank: 0, handsLeft: 2, gold: 0, roundType: 'normal' }, over);

  check('L1: large_straight 1-5 true', CPL.conditionMet('large_straight', lctx({ vals: [1, 2, 3, 4, 5] })) === true);
  check('L2: large_straight 2-6 true', CPL.conditionMet('large_straight', lctx({ vals: [2, 3, 4, 5, 6] })) === true);
  check('L3: large_straight 1,2,3,4,6 false', CPL.conditionMet('large_straight', lctx({ vals: [1, 2, 3, 4, 6] })) === false);
  check('L4: sum_at_most_15 15 true', CPL.conditionMet('sum_at_most_15', lctx({ vals: [1, 2, 3, 4, 5] })) === true);
  check('L5: sum_at_most_15 16 false', CPL.conditionMet('sum_at_most_15', lctx({ vals: [3, 4, 5, 1, 3] })) === false);
  check('L6: sum_at_most_14 14 true / 15 false',
    CPL.conditionMet('sum_at_most_14', lctx({ vals: [2, 2, 3, 3, 4] })) === true &&
    CPL.conditionMet('sum_at_most_14', lctx({ vals: [1, 2, 3, 4, 5] })) === false);
  check('L7: sum_at_least_22 22 true / 21 false',
    CPL.conditionMet('sum_at_least_22', lctx({ vals: [6, 5, 5, 5, 1] })) === true &&
    CPL.conditionMet('sum_at_least_22', lctx({ vals: [6, 5, 5, 4, 1] })) === false);
  check('L8: boss_round (boss/normal)',
    CPL.conditionMet('boss_round', lctx({ roundType: 'boss' })) === true &&
    CPL.conditionMet('boss_round', lctx({ roundType: 'normal' })) === false);
  check('L9: six_count_2 / three_present / even_count_4',
    CPL.conditionMet('six_count_2', lctx({ vals: [6, 6, 1, 2, 3] })) === true &&
    CPL.conditionMet('three_present', lctx({ vals: [3, 1, 2, 5, 4] })) === true &&
    CPL.conditionMet('even_count_4', lctx({ vals: [2, 4, 6, 2, 1] })) === true &&
    CPL.conditionMet('even_count_4', lctx({ vals: [2, 4, 3, 5, 1] })) === false);
  check('L10: four_kind_or_better / yahtzee_or_better',
    CPL.conditionMet('four_kind_or_better', lctx({ handId: 'four_kind', handRank: 7 })) === true &&
    CPL.conditionMet('four_kind_or_better', lctx({ handId: 'full_house', handRank: 6 })) === false &&
    CPL.conditionMet('yahtzee_or_better', lctx({ handId: 'yahtzee', handRank: 8 })) === true);

  /* ─────────── M. 신규 유물 효과 6종 ─────────── */
  CPL.startRun();
  await sleep(40);
  CPL.addRelic('reroll_whisper');            // 리롤 2회 → 칩 +36
  CPL.setDice([3, 3, 1, 2, 4]);
  let bdL = CPL.computeScore('one_pair');
  check('M1: add_chips_per_reroll (10+18×2)×2=92', bdL && bdL.total === 92, bdL && bdL.total);

  CPL.startRun();
  await sleep(40);
  CPL.addRelic('lantern_of_hands');          // 남은 핸드 4 → 배수 +12
  CPL.setDice([3, 3, 1, 2, 4]);
  bdL = CPL.computeScore('one_pair');
  check('M2: add_mult_per_hands_left 10×(2+3×4)=140', bdL && bdL.total === 140, bdL && bdL.total);

  CPL.startRun();
  await sleep(40);
  CPL.addRelic('small_purse');               // 골드 20 → 8×(20/5)=32 칩
  SL.gold = 20;
  CPL.setDice([3, 3, 1, 2, 4]);
  bdL = CPL.computeScore('one_pair');
  check('M3: add_chips_per_gold (10+32)×2=84', bdL && bdL.total === 84, bdL && bdL.total);

  CPL.startRun();
  await sleep(40);
  CPL.addRelic('charm_tithe');               // 부적 3개 → 배수 +15
  CPL.addCharm('soul_flask');
  CPL.addCharm('ash_bandage');
  CPL.addCharm('bone_pin');
  CPL.setDice([3, 3, 1, 2, 4]);
  bdL = CPL.computeScore('one_pair');
  check('M4: add_mult_per_charm 10×(2+5×3)=170', bdL && bdL.total === 170, bdL && bdL.total);

  CPL.startRun();
  await sleep(40);
  CPL.addRelic('interest_book');             // 클리어 시 골드 20 → +2
  CPL.gotoRound(0);
  await sleep(40);
  SL.gold = 20;
  SL.score = SL.target - 1;
  CPL.setDice([5, 5, 5, 5, 5]);
  CPL.scoreSelected();
  await sleep(2600);
  check('M5: interest_gold 클리어 골드 20+3+2=25', SL.gold === 25, SL.gold);

  CPL.startRun();
  await sleep(40);
  CPL.addRelic('haggler_bill');              // 상점 25% 할인
  CPL.setDice([3, 3, 1, 2, 4]);
  check('M6: shop_discount ceil(10×0.75)=8', CPL.shopPrice({ cost: 10 }) === 8, CPL.shopPrice({ cost: 10 }));

  CPL.startRun();
  await sleep(40);
  CPL.addRelic('long_road');                 // 라지 스트레이트 ×1.55
  CPL.setDice([1, 2, 3, 4, 5]);
  bdL = CPL.computeScore('large_straight');
  check('M7: long_road 160×1.55=248', bdL && bdL.total === 248, bdL && bdL.total);

  CPL.startRun();
  await sleep(40);
  CPL.addRelic('the_house_always_wins');     // 전설 ×1.8
  CPL.setDice([3, 3, 1, 2, 4]);
  bdL = CPL.computeScore('one_pair');
  check('M8: legendary the_house_always_wins 20×1.8=36', bdL && bdL.total === 36, bdL && bdL.total);

  CPL.startRun();
  await sleep(40);
  CPL.addRelic('soul_auctioneer');           // 골드 30+ ×1.5
  SL.gold = 30;
  CPL.setDice([3, 3, 1, 2, 4]);
  bdL = CPL.computeScore('one_pair');
  check('M9: soul_auctioneer 골드30 → 20×1.5=30', bdL && bdL.total === 30, bdL && bdL.total);

  CPL.startRun();
  await sleep(40);
  CPL.addRelic('heavy_pip_stone');           // 합 22+ 칩 +110
  CPL.setDice([6, 6, 6, 6, 1]);
  bdL = CPL.computeScore('four_kind');
  check('M10: heavy_pip_stone (60+110)×7=1190', bdL && bdL.total === 1190, bdL && bdL.total);

  /* ─────────── N. 신규 부적 7종 ─────────── */
  CPL.startRun();
  await sleep(40);
  CPL.addCharm('ash_bandage');               // temp_chips +60
  CPL.setDice([3, 3, 1, 2, 4]);
  click(L.document.getElementById('charm-slots').querySelectorAll('.charm-slot')[0]);
  bdL = CPL.computeScore('one_pair');
  check('N1: temp_chips (10+60)×2=140', bdL && bdL.total === 140, bdL && bdL.total);

  CPL.startRun();
  await sleep(40);
  CPL.addCharm('bone_pin');                  // hold_dice
  CPL.setDice([2, 3, 4, 5, 6]);
  click(L.document.getElementById('charm-slots').querySelectorAll('.charm-slot')[0]);
  check('N2a: hold_dice → 대상 선택 모드', SL.focusCharm === 0 && SL.focusMode === 'hold', `${SL.focusCharm}/${SL.focusMode}`);
  click(L.document.getElementById('dice-stage').querySelectorAll('.die')[2]);
  check('N2b: hold_dice → 선택 주사위 잠금', SL.dice[2].held === true && SL.charms.length === 0, `${SL.dice[2].held}/${SL.charms.length}`);

  CPL.startRun();
  await sleep(40);
  CPL.addCharm('six_seal');                  // set_pip 6
  CPL.setDice([2, 3, 4, 5, 6]);
  click(L.document.getElementById('charm-slots').querySelectorAll('.charm-slot')[0]);
  click(L.document.getElementById('dice-stage').querySelectorAll('.die')[0]);
  check('N3: set_pip → 눈금 6', SL.dice[0].value === 6, SL.dice[0].value);

  CPL.startRun();
  await sleep(40);
  CPL.addCharm('parity_draught');            // 홀수 +1
  CPL.setDice([1, 2, 3, 4, 5]);
  click(L.document.getElementById('charm-slots').querySelectorAll('.charm-slot')[0]);
  check('N4: parity_shift 1,3,5 → 2,4,6', SL.dice.map(d => d.value).join(',') === '2,2,4,4,6', SL.dice.map(d => d.value).join(','));

  CPL.startRun();
  await sleep(40);
  CPL.gotoRound(2);                          // minus_reroll
  await sleep(40);
  const rerollBefore = SL.rerollsMax;
  CPL.addCharm('grave_water');
  CPL.setDice([2, 3, 1, 5, 4]);
  click(L.document.getElementById('charm-slots').querySelectorAll('.charm-slot')[0]);
  check('N5: curse_soften 리롤 1→2', rerollBefore === 1 && SL.rerollsMax === 2 && SL.curseSoft === true,
    `${rerollBefore} → ${SL.rerollsMax}`);

  CPL.startRun();
  await sleep(40);
  CPL.gotoRound(8);                          // cap_six_to_three
  await sleep(40);
  CPL.setDice([6, 3, 6, 3, 6]);
  check('N6a: 저주 상태에서 6→3 (야찌 성립)', !!CPL.computeScore('yahtzee'));
  CPL.addCharm('iron_contract');
  click(L.document.getElementById('charm-slots').querySelectorAll('.charm-slot')[0]);
  check('N6b: curse_nullify → 6 유지 (야찌 불성립)', CPL.computeScore('yahtzee') === null && SL.curseNull === true);

  /* 상점 무료 교체 (haggler_token) */
  CPL.startRun();
  await sleep(40);
  SL.gold = 40;
  SL.score = SL.target - 1;
  CPL.setDice([5, 5, 5, 5, 5]);
  CPL.scoreSelected();
  await sleep(2600);
  const goldAtShop = SL.gold;
  CPL.addCharm('haggler_token');
  const shopSlots = L.document.getElementById('charm-slots').querySelectorAll('.charm-slot');
  CPL.activateCharm(SL.charms.findIndex(c => c.id === 'haggler_token'));
  CPL.shopReroll();
  check('N7: shop_free_reroll → 무료 진열 교체', SL.shopFree === 0 && SL.gold === goldAtShop,
    `free=${SL.shopFree} gold=${goldAtShop}→${SL.gold}`);

  /* ─────────── O. 신규 보스 저주 5종 modifier ─────────── */
  CPL.startRun();
  await sleep(40);
  SL.mods = CPL.compileMods(['min_hand_three_kind']);
  CPL.setDice([3, 3, 1, 2, 4]);
  check('O1: min_hand_rank 트리플 미만 정산 불가', CPL.computeScore('one_pair') === null);
  CPL.setDice([3, 3, 3, 2, 4]);
  check('O1b: min_hand_rank 트리플 이상 정산 가능', !!CPL.computeScore('three_kind'));

  CPL.startRun();
  await sleep(40);
  SL.mods = CPL.compileMods(['reroll_first_double']);
  CPL.setDice([2, 3, 4, 5, 6]);
  SL.rerolls = 2;
  CPL.roll();
  await sleep(60);
  check('O2: first_reroll_cost 첫 리롤 2회 소모', SL.rerolls === 0, SL.rerolls);

  CPL.startRun();
  await sleep(40);
  SL.mods = CPL.compileMods(['odd_locked']);
  CPL.setDice([2, 3, 1, 5, 4]);
  let diceL = L.document.getElementById('dice-stage').querySelectorAll('.die');
  click(diceL[1]);   // 3 (홀수) — 잠김
  check('O3a: hold_block odd → 홀수 홀드 불가', SL.dice[1].held === false);
  click(diceL[0]);   // 2 (짝수) — 가능
  check('O3b: hold_block odd → 짝수 홀드 가능', SL.dice[0].held === true);

  CPL.startRun();
  await sleep(40);
  SL.mods = CPL.compileMods(['six_blind']);
  check('O4b: six_blind 모드에서 six_present false / one_present true',
    CPL.conditionMet('six_present', lctx({ vals: [6, 6, 2, 3, 4] })) === false &&
    CPL.conditionMet('one_present', lctx({ vals: [6, 1, 2, 3, 4] })) === true);

  CPL.startRun();
  await sleep(40);
  SL.mods = CPL.compileMods(['no_relic_conditions']);
  check('O5: disable_conditions → 조건 유물 전부 false (상시는 true)',
    CPL.conditionMet('even_count', lctx({ vals: [2, 4, 6, 2, 1] })) === false &&
    CPL.conditionMet('always', lctx()) === true);

  /* ─────────── P. 승천 (Ascension 0~5) ─────────── */
  CPL.setAscension(3);
  CPL.startRun();
  await sleep(40);
  check('P1: A3 목표 +6% (150→159)', SL.target === 159, SL.target);
  CPL.gotoRound(2);                          // N1R3 보스 (A3는 밤3부터)
  await sleep(40);
  check('P2a: A3 밤1 보스 리롤 페널티 없음', SL.rerollsMax === 1, SL.rerollsMax); // minus_reroll 저주만
  CPL.gotoRound(8);                          // N3R3 보스
  await sleep(40);
  check('P2b: A3 밤3 보스 리롤 −1 (2−1=1)', SL.rerollsMax === 1, SL.rerollsMax);

  CPL.setAscension(5);
  CPL.startRun();
  await sleep(40);
  check('P3a: A5 목표 +10% (150→165)', SL.target === 165, SL.target);
  CPL.gotoRound(14);                         // N5R3 보스
  await sleep(40);
  check('P3b: A5 마지막 밤 보스 저주 2개', SL.curseIds.length === 2, SL.curseIds.join('+'));

  CPL.setAscension(0);
  CPL.startRun(0);
  await sleep(40);
  CPL.finishRun(true);
  check('P4: A0 승리 → A1 해금', SL.ascensionMax === 1, SL.ascensionMax);

  /* ─────────── Q. 엔드리스 (밤 6~) ─────────── */
  const Q = buildSandbox({ fetch: fetchOk });
  runGame(Q.sandbox);
  await sleep(150);
  const CPQ = Q.sandbox.CP;
  const SQ = CPQ.state;
  CPQ.startRun(0);
  await sleep(40);
  CPQ.gotoRound(14);
  await sleep(40);
  SQ.score = SQ.target - 1;
  CPQ.setDice([4, 4, 4, 4, 4]);
  CPQ.scoreSelected();
  await sleep(2600);
  check('Q1: 밤5 보스 격파 → 엔드리스 선택', SQ.phase === 'endlessChoice' && SQ.endlessPending === true, SQ.phase);
  click(Q.document.getElementById('btn-endless-continue'));
  await sleep(80);
  check('Q2: 엔드리스 진입 → 밤 6', SQ.endless === true && SQ.night === 6, `${SQ.endless}/${SQ.night}`);
  check('Q3: 엔드리스 라운드 3개 생성 (총 18)', CPQ.rounds.length === 18, CPQ.rounds.length);
  check('Q4: 엔드리스 밤6 목표 6500', SQ.target === 6500, SQ.target);
  check('Q5: 엔드리스 보스 저주 = rotation 첫 번째', CPQ.rounds[17].boss_curse_id === 'min_hand_three_kind', CPQ.rounds[17].boss_curse_id);
  CPQ.extendEndless();
  check('Q6: 밤7 목표 6500×1.28=8320', Math.round(6500 * 1.28) === CPQ.rounds[18].target_score, CPQ.rounds[18].target_score);
  SQ.run.endlessNight = 8;
  CPQ.checkAchievements('endless');
  check('Q7: 업적 endless_8 (밤 8 도달)', !!SQ.progress.unlocked.endless_8);

  /* ─────────── R. 업적 · Steam 훅 ─────────── */
  const steamCalls = [];
  const R = buildSandbox({ fetch: fetchOk });
  R.sandbox.cpSteam = { available: true, achievement: (id) => { steamCalls.push(id); return Promise.resolve(true); } };
  runGame(R.sandbox);
  await sleep(150);
  const CPR = R.sandbox.CP;
  const SR = CPR.state;
  CPR.startRun(0);
  await sleep(40);
  CPR.finishRun(true);
  check('R1: 업적 first_contract 해금', !!SR.progress.unlocked.first_contract);
  check('R2: Steamworks 업적 훅 호출', steamCalls.indexOf('ACH_FIRST_CONTRACT') >= 0, steamCalls.join(','));
  check('R3: 업적 토스트 표시', !R.document.getElementById('ach-toast').classList.contains('hidden'));

  const relicIds = CPR.data.relics.slice(0, 30).map(r => r.id);
  relicIds.forEach(id => CPR.addRelic(id));
  CPR.checkAchievements('collection');
  check('R4: 유물 30종 수집 업적', SR.progress.relicSeen.length >= 30 && !!SR.progress.unlocked.relic_30,
    SR.progress.relicSeen.length);

  click(R.document.getElementById('btn-ach'));
  const achCards = R.document.getElementById('ach-body').querySelectorAll('.ach-card');
  check('R5: 업적 모달 15종 렌더', achCards.length === 15, achCards.length);

  /* ─────────── S. i18n · 도감 · 설정 ─────────── */
  const Sx = buildSandbox({ fetch: fetchOk });
  runGame(Sx.sandbox);
  await sleep(150);
  const CPS = Sx.sandbox.CP;
  const SS = CPS.state;
  const i18n = Sx.sandbox.CursedI18n;
  check('S1: CursedI18n 로드 · ko/en 각 400+ 키',
    !!i18n && i18n.keys('ko').length >= 400 && i18n.keys('en').length >= 400,
    i18n ? `${i18n.keys('ko').length}/${i18n.keys('en').length}` : 'none');
  check('S2: ko/en 키 누락 0', i18n && i18n.missing('en', 'ko').length === 0 && i18n.missing('ko', 'en').length === 0,
    i18n ? JSON.stringify(i18n.missing('en', 'ko').slice(0, 3)) : '');
  CPS.startRun(0);
  await sleep(40);
  click(Sx.document.getElementById('btn-lang'));
  check('S3: 언어 EN 실시간 전환', SS.lang === 'en' && Sx.sandbox.document.documentElement.lang === 'en');
  check('S4: EN 데이터 텍스트 (유물명)', CPS.data.relics.find(r => r.id === 'gilded_grin').name_en === 'Gilded Grin');
  check('S5: EN UI 라벨 (정산 내역)', Sx.document.getElementById('breakdown') != null &&
    Sx.sandbox.CursedI18n.t('ui.breakdown') === 'Settlement', Sx.sandbox.CursedI18n.t('ui.breakdown'));
  click(Sx.document.getElementById('btn-lang'));
  check('S6: KO 복귀', SS.lang === 'ko');

  click(Sx.document.getElementById('btn-codex'));
  const codexCards = Sx.document.getElementById('codex-body').querySelectorAll('.codex-card');
  check('S7: 도감 열기 → 유물 50 카드', codexCards.length === 50, codexCards.length);
  check('S8: 도감 모달 표시', !Sx.document.getElementById('modal-codex').classList.contains('hidden'));
  click(Sx.document.getElementById('btn-close-codex'));
  check('S9: 도감 닫기', Sx.document.getElementById('modal-codex').classList.contains('hidden'));

  click(Sx.document.getElementById('btn-settings'));
  check('S10: 설정 모달 표시', !Sx.document.getElementById('modal-settings').classList.contains('hidden'));
  check('S11: BGM 토글 표시', Sx.document.getElementById('btn-bgm').textContent === Sx.sandbox.CursedI18n.t('common.on'),
    Sx.document.getElementById('btn-bgm').textContent);
  CPS.setVolume(0.5);
  check('S12: 볼륨 슬라이더 값 반영', Sx.document.getElementById('vol-slider').value === '50', Sx.document.getElementById('vol-slider').value);
  check('S13: 마스터 볼륨 API 연결', Math.abs(Sx.sandbox.CPSound.getMasterVolume() - SS.volume) < 0.001,
    Sx.sandbox.CPSound.getMasterVolume());
  click(Sx.document.getElementById('btn-close-settings'));

  check('S14: 업적 진행률 API', (() => { const st = CPS.achievementStats(); return st.total === 15 && st.pct >= 0 && st.pct <= 100; })(),
    JSON.stringify(CPS.achievementStats()));

  print();
})().catch(err => {
  console.error('HARNESS ERROR:', err && err.stack || err);
  print();
});

function print() {
  const pass = results.filter(r => r.pass).length;
  const fail = results.length - pass;
  results.forEach(r => {
    console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.name}${r.extra !== '' ? '  [' + r.extra + ']' : ''}`);
  });
  console.log(`\n==== ${pass}/${results.length} passed, ${fail} failed ====`);
  process.exitCode = fail ? 1 : 0;
}
