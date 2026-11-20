'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   CURSED PAWN: 영혼 전당포 — js/game.js
   주사위 로그라이크 덱빌더 코어 엔진 + UI.

   · data/game_data.json 을 fetch 로 우선 로드하고, file:// 이거나 파일이
     없으면 내장 FALLBACK_DATA 로 완전히 동일하게 동작한다.
   · 점수 공식: (기본 칩 + 유물 add_chips) × (기본 배수 + 유물 add_mult)
                 × 유물 mul_mult 곱
   · 유물 조건 9종 / 보스 저주 5종은 game_data.json 계약과 1:1로 구현.
   ══════════════════════════════════════════════════════════════════════════ */

(function () {

  /* ══════════════════════════════ 1. 상수 ══════════════════════════════ */

  const DICE_COUNT = 5;
  const MAX_RELICS = 6;
  const MAX_CHARMS = 3;
  const STORE_KEY = 'cursedPawn.save.v1';

  const HAND_ORDER = [
    'high_card', 'one_pair', 'two_pair', 'three_kind',
    'small_straight', 'large_straight', 'full_house', 'four_kind', 'yahtzee'
  ];
  const HAND_RANK = {};
  HAND_ORDER.forEach((id, i) => { HAND_RANK[id] = i; });

  const PAIR_FAMILY = ['one_pair', 'two_pair', 'three_kind', 'full_house', 'four_kind', 'yahtzee'];

  const CURSE_IDS = ['no_even', 'minus_reroll', 'cap_six_to_three', 'tax_gold', 'no_pair_bonus'];

  const CURSE_INFO = {
    no_even: {
      ko: { name: '짝수 금식', desc: '짝수 눈금 주사위는 홀드(HOLD)할 수 없습니다.' },
      en: { name: 'Even Fast', desc: 'Even dice cannot be held.' }
    },
    minus_reroll: {
      ko: { name: '박자 없는 종', desc: '이 라운드에는 리롤이 1회뿐입니다.' },
      en: { name: 'Out of Tune', desc: 'You get only 1 reroll this round.' }
    },
    cap_six_to_three: {
      ko: { name: '눈금 절단', desc: '6 눈금은 3으로 계산됩니다 (족보 판정·조건 모두).' },
      en: { name: 'Pip Shearing', desc: 'Sixes count as 3 for hand and condition checks.' }
    },
    tax_gold: {
      ko: { name: '영혼세', desc: '라운드를 클리어하면 골드 3을 압수당합니다.' },
      en: { name: 'Soul Tax', desc: 'Clearing the round seizes 3 gold.' }
    },
    no_pair_bonus: {
      ko: { name: '쌍둥이 사기', desc: '페어 계열 족보의 기본 배수가 1 줄어듭니다(최소 1).' },
      en: { name: 'Twin Swindle', desc: 'Pair-family base multipliers drop by 1 (minimum 1).' }
    }
  };

  const CONDITION_INFO = {
    always: { ko: '상시 발동', en: 'Always' },
    even_count: { ko: '짝수 눈금 3개 이상', en: '3+ even dice' },
    odd_count: { ko: '홀수 눈금 3개 이상', en: '3+ odd dice' },
    pair_or_better: { ko: '원 페어 이상', en: 'One pair or better' },
    straight: { ko: '스트레이트 계열', en: 'Straight' },
    six_present: { ko: '6 눈금 포함', en: 'A six is present' },
    one_present: { ko: '1 눈금 포함', en: 'A one is present' },
    last_hand: { ko: '라운드 마지막 핸드', en: 'Final hand of the round' },
    gold_over_15: { ko: '골드 15 이상', en: '15+ gold' }
  };

  const TRIGGER_INFO = {
    on_score: { ko: '정산 시', en: 'On score' },
    on_roll: { ko: '핸드 시작 시', en: 'On hand start' },
    passive: { ko: '상시', en: 'Passive' }
  };

  const RARITY_INFO = {
    common: { ko: '일반', en: 'Common' },
    uncommon: { ko: '고급', en: 'Uncommon' },
    rare: { ko: '희귀', en: 'Rare' },
    cursed: { ko: '저주', en: 'Cursed' }
  };

  /* ══════════════════════════════ 2. 다국어 ══════════════════════════════ */

  const I18N = {
    ko: {
      'title.kicker': 'A DICE ROGUELIKE DECKBUILDER',
      'title.sub': '영혼 전당포',
      'title.tag': '영혼을 담보로, 주사위로 빚을 갚아라.\n다섯 밤을 버티면 계약은 갱신된다.',
      'title.start': '계약서에 서명한다',

      'ui.rules': '족보 · 룰북',
      'ui.curse': '보스 저주',
      'ui.relics': '유물',
      'ui.charms': '부적',
      'ui.preview': '족보 미리보기',
      'ui.previewHint': '클릭해 선택 · 유물 조건은 주사위 5개 기준',
      'ui.breakdown': '정산 내역',
      'ui.log': '기록',
      'ui.charmsHint': '클릭하면 즉시 발동합니다',
      'ui.cancel': '취소',
      'ui.sell': '판매',
      'ui.buy': '구매',
      'ui.owned': '보유 중',
      'ui.close': '닫기',

      'hud.night': '밤',
      'hud.roundSuffix': '라운드',
      'hud.score': '정산 점수',
      'hud.hands': '기회',
      'hud.rerolls': '리롤',
      'hud.gold': '골드',

      'type.normal': '일반',
      'type.elite': '정예',
      'type.boss': '보스',

      'dealer.title': '전당포 주인',
      'dealer.round': '자, 주사위를 굴려 보게. 담보는 내가 잘 보관하지.',
      'dealer.boss': '이 밤의 손님은 유난히 까다롭다네. 저주도 값이지.',
      'dealer.clear': '호오... 아직 쓸 만하군. 영혼이 반짝이는걸.',
      'dealer.fail': '유감이군. 담보는 내가 가져가지.',
      'dealer.buy': '현명한 선택이야. 그건 네 것이야... 지금은.',

      'btn.roll': '굴리기',
      'btn.reroll': '리롤',
      'btn.score': '정산!',
      'btn.scoreIdle': '정산',

      'msg.rollFirst': '주사위를 굴려 기회를 시작하세요',
      'msg.handStart': '{n}번째 기회 — 남길 주사위를 HOLD 하세요',
      'msg.selectHand': '족보를 골라 정산하세요',
      'msg.noReroll': '리롤을 모두 썼습니다',
      'msg.focusFlip': '뒤집을 주사위를 클릭하세요 (ESC 취소)',
      'msg.needHand': '먼저 족보를 고르세요',
      'msg.roundClear': '라운드 클리어',
      'msg.lastHand': '마지막 기회입니다',

      'toast.notEnoughGold': '골드가 부족합니다',
      'toast.relicsFull': '유물 슬롯이 가득 찼습니다 (최대 6개)',
      'toast.charmsFull': '부적 슬롯이 가득 찼습니다 (최대 3개)',
      'toast.evenLocked': '저주: 짝수 눈금은 홀드할 수 없습니다',
      'toast.charmUsed': '{name} 발동',
      'toast.sold': '{name} 판매 — {g} 골드',
      'toast.shopReroll': '진열을 교체했습니다 (−3 골드)',
      'toast.bought': '{name} 구매 — {g} 골드',
      'toast.diceFirst': '먼저 주사위를 굴리세요',
      'toast.noCharmTarget': '뒤집을 주사위가 없습니다',
      'toast.soldOut': '품절',

      'shop.kicker': 'CONTRACT FULFILLED',
      'shop.title': '라운드 클리어',
      'shop.titleBoss': '밤을 넘겼다',
      'shop.reward': '보상 +{g} 골드',
      'shop.bonus': '유물 보너스 +{b}',
      'shop.tax': '영혼세 −{t} 골드',
      'shop.relics': '유물 진열',
      'shop.charms': '부적 진열',
      'shop.reroll': '진열 교체',
      'shop.next': '다음 밤으로',
      'shop.nextRound': '다음 라운드로',
      'shop.empty': '진열대가 비었습니다',
      'shop.sold': '판매 완료',
      'shop.hint': '유물 최대 6개 · 부적 최대 3개 보유',

      'result.winTitle': '계약 갱신',
      'result.winSub': '다섯 밤을 버텼습니다. 영혼은 아직 당신의 것입니다.',
      'result.loseTitle': '담보 회수',
      'result.loseSub': '목표 점수에 닿지 못했습니다. 전당포가 영혼을 가져갑니다.',
      'result.score': '총 정산',
      'result.night': '도달한 밤',
      'result.gold': '보유 골드',
      'result.newBest': '★ 신기록',
      'result.best': '최고 기록 {score}점 · 밤 {night}',
      'result.restart': '새 계약서',
      'result.title': '타이틀로',

      'rules.title': '족보 · 룰북',
      'rules.loopTitle': '코어 루프',
      'rules.loop1': '주사위 5개를 굴리고, 남기고 싶은 주사위를 클릭해 HOLD 합니다.',
      'rules.loop2': '리롤은 HOLD 하지 않은 주사위만 다시 굴립니다.',
      'rules.loop3': '족보를 하나 골라 [정산]을 누르면 그 점수가 라운드에 쌓입니다.',
      'rules.loop4': '목표 점수에 먼저 도달하면 라운드 클리어 — 상점에서 유물과 부적을 삽니다.',
      'rules.loop5': '한 밤은 3라운드(일반 · 정예 · 보스)이고, 보스는 저주를 겁니다. 다섯 밤을 버티면 승리.',
      'rules.formulaTitle': '점수 공식',
      'rules.formula': '(기본 칩 + 유물 칩) × (기본 배수 + 유물 배수) × 유물 곱연산',
      'rules.formulaNote': '주사위 눈금 합은 칩에 더해지지 않습니다. 유물 조건은 항상 주사위 5개의 눈금으로 판정합니다.',
      'rules.handsTitle': '족보표',
      'rules.curseTitle': '보스 저주',
      'rules.controlsTitle': '조작',
      'rules.keyRoll': '굴리기 / 리롤',
      'rules.keyHold': '주사위 HOLD',
      'rules.keyScore': '선택한 족보로 정산',
      'rules.keyRules': '룰북 열기',
      'rules.keySound': '사운드 On/Off',
      'rules.condTitle': '유물 조건 판정',
      'rules.condNote': '짝수·홀수·6·1 조건은 주사위 5개 중 해당 눈금의 개수로 판정합니다.',
      'rules.source': '데이터 소스',
      'rules.sourceFallback': '내장 기본 데이터 (file:// 또는 game_data.json 없음)',
      'rules.sourceJson': 'data/game_data.json',
      'rules.effectTitle': '유물 효과 종류',
      'rules.effectChips': '+칩: 정산 칩에 더해집니다.',
      'rules.effectMult': '+배수: 정산 배수에 더해집니다.',
      'rules.effectMul': '×배수: 마지막에 배수를 곱합니다.',
      'rules.effectReroll': '+리롤: 핸드마다 리롤이 늘어납니다.',
      'rules.effectHand': '+핸드: 라운드마다 기회가 늘어납니다.',
      'rules.effectGold': '+골드: 라운드 클리어 시 골드를 얻습니다.',

      'bd.base': '기본 칩',
      'bd.baseMult': '기본 배수',
      'bd.chipsAdd': '유물 칩',
      'bd.multAdd': '유물 배수',
      'bd.mul': '곱연산',
      'bd.charmMult': '부적 배수',
      'bd.curse': '저주',
      'bd.total': '예상 정산',
      'bd.pick': '주사위를 굴리면 예상 점수가 표시됩니다',
      'bd.noHand': '족보를 선택하세요',
      'bd.unmet': '조건 미충족',
      'bd.none': '적용되는 효과 없음',

      'log.roundStart': '{night}번째 밤 · {type} {round}R 시작',
      'log.score': '{hand} 정산',
      'log.clear': '라운드 클리어',
      'log.relic': '{name} 획득',
      'log.charm': '{name} 획득',
      'log.sell': '{name} 판매',
      'log.curse': '저주: {name}',
      'log.tax': '영혼세 −3 골드',

      'cond.always': '상시',
      'cond.even_count': '짝수 3개 이상',
      'cond.odd_count': '홀수 3개 이상',
      'cond.pair_or_better': '원 페어 이상',
      'cond.straight': '스트레이트',
      'cond.six_present': '6 포함',
      'cond.one_present': '1 포함',
      'cond.last_hand': '마지막 핸드',
      'cond.gold_over_15': '골드 15+',

      'title.best': '최고 기록 {score}점 · 밤 {night}',
      'title.noBest': '아직 기록이 없습니다 — 첫 계약을 맺어 보세요.',
      'title.runs': '{runs}회 도전 · {wins}회 갱신'
    },

    en: {
      'title.kicker': 'A DICE ROGUELIKE DECKBUILDER',
      'title.sub': 'THE SOUL PAWNSHOP',
      'title.tag': 'Pledge your soul. Pay the debt with dice.\nSurvive five nights and the contract renews.',
      'title.start': 'Sign the Contract',

      'ui.rules': 'Hands · Rulebook',
      'ui.curse': 'Boss Curse',
      'ui.relics': 'Relics',
      'ui.charms': 'Charms',
      'ui.preview': 'Hand Preview',
      'ui.previewHint': 'Click to select · relic conditions use all 5 dice',
      'ui.breakdown': 'Settlement',
      'ui.log': 'Ledger',
      'ui.charmsHint': 'Click to trigger instantly',
      'ui.cancel': 'Cancel',
      'ui.sell': 'Sell',
      'ui.buy': 'Buy',
      'ui.owned': 'Owned',
      'ui.close': 'Close',

      'hud.night': 'Night',
      'hud.roundSuffix': 'Round',
      'hud.score': 'Score',
      'hud.hands': 'Hands',
      'hud.rerolls': 'Rerolls',
      'hud.gold': 'Gold',

      'type.normal': 'Normal',
      'type.elite': 'Elite',
      'type.boss': 'Boss',

      'dealer.title': 'Pawnbroker',
      'dealer.round': 'Roll, dear customer. I will keep your collateral safe.',
      'dealer.boss': 'Tonight\'s guest is a difficult one. Curses cost extra.',
      'dealer.clear': 'Oh? Still useful, then. Your soul has a lovely shine.',
      'dealer.fail': 'A pity. I shall take the collateral.',
      'dealer.buy': 'A wise choice. It is yours... for now.',

      'btn.roll': 'Roll',
      'btn.reroll': 'Reroll',
      'btn.score': 'Settle!',
      'btn.scoreIdle': 'Settle',

      'msg.rollFirst': 'Roll the dice to begin this hand',
      'msg.handStart': 'Hand {n} — click dice to HOLD',
      'msg.selectHand': 'Pick a hand to settle',
      'msg.noReroll': 'No rerolls left',
      'msg.focusFlip': 'Click a die to flip it (ESC to cancel)',
      'msg.needHand': 'Pick a hand first',
      'msg.roundClear': 'Round cleared',
      'msg.lastHand': 'This is your last hand',

      'toast.notEnoughGold': 'Not enough gold',
      'toast.relicsFull': 'Relic slots are full (max 6)',
      'toast.charmsFull': 'Charm slots are full (max 3)',
      'toast.evenLocked': 'Curse: even dice cannot be held',
      'toast.charmUsed': '{name} triggered',
      'toast.sold': 'Sold {name} for {g} gold',
      'toast.shopReroll': 'Stock refreshed (−3 gold)',
      'toast.bought': 'Bought {name} for {g} gold',
      'toast.diceFirst': 'Roll the dice first',
      'toast.noCharmTarget': 'No die to flip',
      'toast.soldOut': 'Sold out',

      'shop.kicker': 'CONTRACT FULFILLED',
      'shop.title': 'Round Cleared',
      'shop.titleBoss': 'Night Survived',
      'shop.reward': 'Reward +{g} gold',
      'shop.bonus': 'Relic bonus +{b}',
      'shop.tax': 'Soul tax −{t} gold',
      'shop.relics': 'Relics on Display',
      'shop.charms': 'Charms on Display',
      'shop.reroll': 'Refresh Stock',
      'shop.next': 'Next Night',
      'shop.nextRound': 'Next Round',
      'shop.empty': 'The shelf is empty',
      'shop.sold': 'Sold',
      'shop.hint': 'Max 6 relics · max 3 charms',

      'result.winTitle': 'Contract Renewed',
      'result.winSub': 'You survived five nights. Your soul is still yours.',
      'result.loseTitle': 'Collateral Seized',
      'result.loseSub': 'The score fell short. The pawnshop takes your soul.',
      'result.score': 'Total Score',
      'result.night': 'Night Reached',
      'result.gold': 'Gold Held',
      'result.newBest': '★ NEW RECORD',
      'result.best': 'Best {score} pts · Night {night}',
      'result.restart': 'New Contract',
      'result.title': 'Title',

      'rules.title': 'Hands · Rulebook',
      'rules.loopTitle': 'Core Loop',
      'rules.loop1': 'Roll 5 dice, then click dice you want to keep to HOLD them.',
      'rules.loop2': 'A reroll only rerolls the dice you did not hold.',
      'rules.loop3': 'Choose one hand and press [Settle] to bank its points.',
      'rules.loop4': 'Reach the target score to clear the round and shop for relics and charms.',
      'rules.loop5': 'Each night is 3 rounds (normal, elite, boss). Bosses curse the table. Survive 5 nights to win.',
      'rules.formulaTitle': 'Score Formula',
      'rules.formula': '(base chips + relic chips) × (base mult + relic mult) × relic multipliers',
      'rules.formulaNote': 'Dice pips are not added to chips. Relic conditions always check all five dice.',
      'rules.handsTitle': 'Hand Table',
      'rules.curseTitle': 'Boss Curses',
      'rules.controlsTitle': 'Controls',
      'rules.keyRoll': 'Roll / Reroll',
      'rules.keyHold': 'Hold a die',
      'rules.keyScore': 'Settle the selected hand',
      'rules.keyRules': 'Open rulebook',
      'rules.keySound': 'Toggle sound',
      'rules.condTitle': 'Relic Conditions',
      'rules.condNote': 'Even/odd/6/1 conditions count those pips among all five dice.',
      'rules.source': 'Data Source',
      'rules.sourceFallback': 'Built-in fallback (file:// or missing game_data.json)',
      'rules.sourceJson': 'data/game_data.json',
      'rules.effectTitle': 'Effect Types',
      'rules.effectChips': '+chips: added to settlement chips.',
      'rules.effectMult': '+mult: added to settlement multiplier.',
      'rules.effectMul': '×mult: multiplies the multiplier at the end.',
      'rules.effectReroll': '+reroll: extra reroll each hand.',
      'rules.effectHand': '+hand: extra hand each round.',
      'rules.effectGold': '+gold: gold on round clear.',

      'bd.base': 'Base chips',
      'bd.baseMult': 'Base mult',
      'bd.chipsAdd': 'Relic chips',
      'bd.multAdd': 'Relic mult',
      'bd.mul': 'Multiplier',
      'bd.charmMult': 'Charm mult',
      'bd.curse': 'Curse',
      'bd.total': 'Projected',
      'bd.pick': 'Roll the dice to see projected scores',
      'bd.noHand': 'Select a hand',
      'bd.unmet': 'condition unmet',
      'bd.none': 'No active effects',

      'log.roundStart': 'Night {night} · {type} {round}R begins',
      'log.score': '{hand} settled',
      'log.clear': 'Round cleared',
      'log.relic': 'Gained {name}',
      'log.charm': 'Gained {name}',
      'log.sell': 'Sold {name}',
      'log.curse': 'Curse: {name}',
      'log.tax': 'Soul tax −3 gold',

      'cond.always': 'Always',
      'cond.even_count': '3+ even',
      'cond.odd_count': '3+ odd',
      'cond.pair_or_better': 'Pair+',
      'cond.straight': 'Straight',
      'cond.six_present': 'A six',
      'cond.one_present': 'A one',
      'cond.last_hand': 'Last hand',
      'cond.gold_over_15': '15+ gold',

      'title.best': 'Best {score} pts · Night {night}',
      'title.noBest': 'No record yet — sign your first contract.',
      'title.runs': '{runs} runs · {wins} renewals'
    }
  };

  /* ══════════════════════════════ 3. 내장 폴백 데이터 ══════════════════════════════ */
  /* data/game_data.json 이 없거나(file://) 로드에 실패해도 동일하게 플레이되도록
     기획 데이터와 같은 스키마/수치를 내장한다. */
  const FALLBACK_DATA = {"meta":{"game_title_ko":"CURSED PAWN: 영혼 전당포","game_title_en":"CURSED PAWN","version":"1.0.0","locale_default":"ko","locales":["ko","en"],"design_doc":"docs/GDD.md","designer":"이재근 (기획/밸런스)","updated_at":"2026-11-21","dice_count":5,"max_rerolls_per_hand":2,"relic_slots":6,"charm_slots":3,"start_gold":4,"shop_reroll_cost":3,"shop_relic_offers":3,"shop_charm_offers":2,"score_formula":"(base_chips + sum(relic add_chips)) * (base_mult + sum(relic add_mult)) * product(relic mul_mult)","notes":"condition 문자열은 GDD 2.5 '조건 판정 사전'과 1:1로 대응한다. 일반/정예 라운드의 boss_* 필드는 빈 문자열이다."},"hands":[{"id":"high_card","name_ko":"하이카드","name_en":"High Card","base_chips":5,"base_mult":1,"desc_ko":"족보를 이루지 못했을 때, 가장 높은 눈금 하나로 겨우 정산한다.","desc_en":"When nothing else fits, settle with your single highest die."},{"id":"one_pair","name_ko":"원 페어","name_en":"One Pair","base_chips":10,"base_mult":2,"desc_ko":"같은 눈금 2개. 전당포에서 가장 흔한 담보.","desc_en":"Two of a kind — the pawnshop's most common collateral."},{"id":"two_pair","name_ko":"투 페어","name_en":"Two Pair","base_chips":20,"base_mult":2,"desc_ko":"같은 눈금 2쌍. 두 개의 빚을 한 번에 맡긴다.","desc_en":"Two pairs — two debts pledged at once."},{"id":"three_kind","name_ko":"트리플","name_en":"Three of a Kind","base_chips":30,"base_mult":3,"desc_ko":"같은 눈금 3개. 담보의 무게가 세 배로 늘어난다.","desc_en":"Three of a kind — the weight of the pledge triples."},{"id":"small_straight","name_ko":"스몰 스트레이트","name_en":"Small Straight","base_chips":30,"base_mult":4,"desc_ko":"이어진 눈금 4개. 흐름이 끊기지 않으면 이자가 붙는다.","desc_en":"Four dice in sequence. Keep the flow unbroken and interest accrues."},{"id":"large_straight","name_ko":"라지 스트레이트","name_en":"Large Straight","base_chips":40,"base_mult":4,"desc_ko":"이어진 눈금 5개. 완벽한 흐름은 완벽한 담보다.","desc_en":"Five dice in sequence. A perfect run is perfect collateral."},{"id":"full_house","name_ko":"풀 하우스","name_en":"Full House","base_chips":40,"base_mult":4,"desc_ko":"같은 눈금 3개와 2개. 세 식구와 두 식구가 한 지붕 아래 모인다.","desc_en":"Three of a kind plus a pair — three souls and two under one roof."},{"id":"four_kind","name_ko":"포 카드","name_en":"Four of a Kind","base_chips":60,"base_mult":7,"desc_ko":"같은 눈금 4개. 네 번의 맹세, 한 번의 배신.","desc_en":"Four of a kind — four oaths, one betrayal."},{"id":"yahtzee","name_ko":"야찌","name_en":"Yahtzee","base_chips":100,"base_mult":8,"desc_ko":"다섯 개가 모두 같은 눈금. 영혼이 하나로 뭉쳐 터진다.","desc_en":"All five dice match. Five souls fuse and burst."}],"relics":[{"id":"rusty_locket","name_ko":"녹슨 로켓","name_en":"Rusty Locket","rarity":"common","cost":4,"icon":"🪙","trigger":"on_score","effect_type":"add_chips","value":18,"condition":"always","desc_ko":"정산할 때마다 칩 +18.","desc_en":"Whenever you score, +18 Chips."},{"id":"cracked_monocle","name_ko":"금 간 단안경","name_en":"Cracked Monocle","rarity":"common","cost":4,"icon":"🔍","trigger":"on_score","effect_type":"add_mult","value":2,"condition":"always","desc_ko":"정산할 때마다 배수 +2.","desc_en":"Whenever you score, +2 Mult."},{"id":"bone_die","name_ko":"뼈 주사위","name_en":"Bone Die","rarity":"common","cost":4,"icon":"🦴","trigger":"on_roll","effect_type":"add_chips","value":10,"condition":"always","desc_ko":"핸드를 시작할 때 칩 +10 (핸드당 1회).","desc_en":"At the start of each hand, +10 Chips (once per hand)."},{"id":"pawn_ticket","name_ko":"전당포 표","name_en":"Pawn Ticket","rarity":"common","cost":4,"icon":"🎫","trigger":"passive","effect_type":"gold_bonus","value":2,"condition":"always","desc_ko":"라운드를 마칠 때마다 골드 +2.","desc_en":"Gain +2 Gold at the end of every round."},{"id":"even_tally","name_ko":"짝수 눈금판","name_en":"Even Tally","rarity":"common","cost":5,"icon":"⚖️","trigger":"on_score","effect_type":"add_chips","value":30,"condition":"even_count","desc_ko":"짝수 눈금이 3개 이상이면 칩 +30.","desc_en":"If you hold 3+ even dice, +30 Chips."},{"id":"odd_tally","name_ko":"홀수 눈금판","name_en":"Odd Tally","rarity":"common","cost":5,"icon":"✴️","trigger":"on_score","effect_type":"add_mult","value":4,"condition":"odd_count","desc_ko":"홀수 눈금이 3개 이상이면 배수 +4.","desc_en":"If you hold 3+ odd dice, +4 Mult."},{"id":"ash_ring","name_ko":"재의 반지","name_en":"Ash Ring","rarity":"common","cost":5,"icon":"💍","trigger":"on_score","effect_type":"add_mult","value":3,"condition":"pair_or_better","desc_ko":"원 페어 이상으로 정산하면 배수 +3.","desc_en":"If you score One Pair or better, +3 Mult."},{"id":"iron_nail","name_ko":"무쇠못","name_en":"Iron Nail","rarity":"common","cost":5,"icon":"🔩","trigger":"on_score","effect_type":"add_chips","value":22,"condition":"straight","desc_ko":"스트레이트 계열로 정산하면 칩 +22.","desc_en":"If you score a Straight, +22 Chips."},{"id":"wax_candle","name_ko":"녹아내린 촛농","name_en":"Wax Candle","rarity":"common","cost":4,"icon":"🕯️","trigger":"on_score","effect_type":"add_chips","value":20,"condition":"one_present","desc_ko":"1 눈금이 하나라도 있으면 칩 +20.","desc_en":"If at least one die shows 1, +20 Chips."},{"id":"mirror_shard","name_ko":"거울 조각","name_en":"Mirror Shard","rarity":"uncommon","cost":6,"icon":"🪞","trigger":"on_score","effect_type":"mul_mult","value":1.15,"condition":"even_count","desc_ko":"짝수 눈금이 3개 이상이면 배수 ×1.15.","desc_en":"If you hold 3+ even dice, ×1.15 Mult."},{"id":"ashen_scale","name_ko":"잿빛 저울","name_en":"Ashen Scale","rarity":"uncommon","cost":6,"icon":"🧿","trigger":"on_score","effect_type":"mul_mult","value":1.15,"condition":"odd_count","desc_ko":"홀수 눈금이 3개 이상이면 배수 ×1.15.","desc_en":"If you hold 3+ odd dice, ×1.15 Mult."},{"id":"chalk_line","name_ko":"분필 선","name_en":"Chalk Line","rarity":"uncommon","cost":6,"icon":"✏️","trigger":"on_score","effect_type":"add_mult","value":6,"condition":"straight","desc_ko":"스트레이트 계열로 정산하면 배수 +6.","desc_en":"If you score a Straight, +6 Mult."},{"id":"blood_ledger","name_ko":"핏빛 장부","name_en":"Blood Ledger","rarity":"uncommon","cost":7,"icon":"📕","trigger":"on_score","effect_type":"add_mult","value":6,"condition":"always","desc_ko":"정산할 때마다 배수 +6.","desc_en":"Whenever you score, +6 Mult."},{"id":"loaded_dice","name_ko":"속임수 주사위","name_en":"Loaded Dice","rarity":"uncommon","cost":7,"icon":"🎲","trigger":"passive","effect_type":"extra_reroll","value":1,"condition":"always","desc_ko":"핸드마다 리롤 +1.","desc_en":"+1 Reroll per hand."},{"id":"six_bell","name_ko":"여섯의 종","name_en":"Six Bell","rarity":"uncommon","cost":7,"icon":"🔔","trigger":"on_score","effect_type":"add_mult","value":7,"condition":"six_present","desc_ko":"6 눈금이 하나라도 있으면 배수 +7.","desc_en":"If any die shows 6, +7 Mult."},{"id":"last_rites","name_ko":"마지막 예배","name_en":"Last Rites","rarity":"uncommon","cost":8,"icon":"⚰️","trigger":"on_score","effect_type":"mul_mult","value":1.25,"condition":"last_hand","desc_ko":"라운드 마지막 핸드로 정산하면 배수 ×1.25.","desc_en":"On the final hand of the round, ×1.25 Mult."},{"id":"gilded_grin","name_ko":"도금된 미소","name_en":"Gilded Grin","rarity":"rare","cost":10,"icon":"🎭","trigger":"on_score","effect_type":"mul_mult","value":1.4,"condition":"always","desc_ko":"정산할 때마다 배수 ×1.4.","desc_en":"Whenever you score, ×1.4 Mult."},{"id":"marble_run","name_ko":"대리석 질주","name_en":"Marble Run","rarity":"rare","cost":9,"icon":"🧱","trigger":"on_score","effect_type":"mul_mult","value":1.3,"condition":"straight","desc_ko":"스트레이트 계열로 정산하면 배수 ×1.3.","desc_en":"If you score a Straight, ×1.3 Mult."},{"id":"coin_purse","name_ko":"동전 주머니","name_en":"Coin Purse","rarity":"rare","cost":9,"icon":"💰","trigger":"on_score","effect_type":"mul_mult","value":1.3,"condition":"gold_over_15","desc_ko":"골드가 15 이상이면 배수 ×1.3.","desc_en":"If you hold 15+ Gold, ×1.3 Mult."},{"id":"moneylender_eye","name_ko":"전당포 주인장의 눈","name_en":"Pawnbroker's Eye","rarity":"rare","cost":8,"icon":"👁️","trigger":"passive","effect_type":"extra_hand","value":1,"condition":"always","desc_ko":"라운드마다 핸드 +1.","desc_en":"+1 Hand per round."},{"id":"parity_crown","name_ko":"홀짝 왕관","name_en":"Parity Crown","rarity":"rare","cost":9,"icon":"👑","trigger":"on_score","effect_type":"add_mult","value":10,"condition":"even_count","desc_ko":"짝수 눈금이 3개 이상이면 배수 +10.","desc_en":"If you hold 3+ even dice, +10 Mult."},{"id":"debtors_hand","name_ko":"채무자의 손","name_en":"Debtor's Hand","rarity":"cursed","cost":3,"icon":"✋","trigger":"on_score","effect_type":"mul_mult","value":1.6,"condition":"six_present","desc_ko":"6 눈금이 하나라도 있으면 배수 ×1.6. 6이 없으면 아무 일도 없다.","desc_en":"If any die shows 6, ×1.6 Mult. Does nothing without a 6."},{"id":"hungry_maw","name_ko":"굶주린 아귀","name_en":"Hungry Maw","rarity":"cursed","cost":3,"icon":"👄","trigger":"on_score","effect_type":"add_mult","value":14,"condition":"last_hand","desc_ko":"라운드 마지막 핸드로 정산하면 배수 +14. 그 전 핸드는 아무 일도 없다.","desc_en":"On the final hand of the round, +14 Mult. Silent on any earlier hand."},{"id":"black_mirror","name_ko":"검은 거울","name_en":"Black Mirror","rarity":"cursed","cost":3,"icon":"⬛","trigger":"on_score","effect_type":"mul_mult","value":1.45,"condition":"odd_count","desc_ko":"홀수 눈금이 3개 이상이면 배수 ×1.45. 짝수 위주의 판을 스스로 뒤집어야 한다.","desc_en":"If you hold 3+ odd dice, ×1.45 Mult. You must turn an even-heavy board over."}],"charms":[{"id":"lucky_ash","name_ko":"행운의 재","name_en":"Lucky Ash","cost":4,"icon":"🍀","effect_type":"all_plus_one","value":1,"desc_ko":"이번 라운드 동안 모든 주사위 눈금 +1 (최대 6).","desc_en":"For this round, every die shows +1 (max 6)."},{"id":"second_wind","name_ko":"두 번째 숨결","name_en":"Second Wind","cost":4,"icon":"🌬️","effect_type":"reroll_plus","value":1,"desc_ko":"이번 라운드 리롤 +1.","desc_en":"+1 Reroll for this round."},{"id":"cracked_compass","name_ko":"금 간 나침반","name_en":"Cracked Compass","cost":6,"icon":"🧭","effect_type":"reroll_plus","value":2,"desc_ko":"이번 라운드 리롤 +2.","desc_en":"+2 Rerolls for this round."},{"id":"extra_palm","name_ko":"여분의 손바닥","name_en":"Extra Palm","cost":6,"icon":"🖐️","effect_type":"hand_plus","value":1,"desc_ko":"이번 라운드 핸드 +1.","desc_en":"+1 Hand for this round."},{"id":"crooked_coin","name_ko":"휘어진 동전","name_en":"Crooked Coin","cost":3,"icon":"🌀","effect_type":"flip_dice","value":1,"desc_ko":"선택한 주사위 1개를 반대 면으로 뒤집는다 (1↔6, 2↔5, 3↔4).","desc_en":"Flip one chosen die to its opposite face (1↔6, 2↔5, 3↔4)."},{"id":"soul_flask","name_ko":"영혼 플라스크","name_en":"Soul Flask","cost":5,"icon":"🧪","effect_type":"temp_mult","value":5,"desc_ko":"이번 핸드 정산 배수 +5.","desc_en":"+5 Mult on this hand's score."},{"id":"blood_vial","name_ko":"핏빛 시약","name_en":"Blood Vial","cost":8,"icon":"🩸","effect_type":"temp_mult","value":12,"desc_ko":"이번 핸드 정산 배수 +12. 마지막 한 수를 위한 값비싼 도박.","desc_en":"+12 Mult on this hand's score. An expensive gamble for the last push."},{"id":"debt_script","name_ko":"채무 증서","name_en":"Debt Script","cost":5,"icon":"📜","effect_type":"gold_gain","value":8,"desc_ko":"즉시 골드 +8 (구매가 5골드, 순이익 3골드).","desc_en":"Gain +8 Gold immediately (costs 5, net +3)."}],"nights":[{"night":1,"name_ko":"첫 번째 밤 — 닫히지 않는 문","name_en":"Night 1 — The Door That Won't Close","rounds":[{"round":1,"type":"normal","target_score":150,"reward_gold":3,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":400,"reward_gold":4,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":330,"reward_gold":5,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"minus_reroll","boss_name_ko":"박자 없는 종","boss_desc_ko":"종소리가 한 박자 늦게 울린다. 이 라운드에는 리롤이 1회뿐이다.","boss_name_en":"The Out-of-Tune Bell","boss_desc_en":"The bell rings a beat late. You get only 1 Reroll this round."}]},{"night":2,"name_ko":"두 번째 밤 — 영혼세","name_en":"Night 2 — The Soul Tax","rounds":[{"round":1,"type":"normal","target_score":1400,"reward_gold":4,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":1700,"reward_gold":5,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":1300,"reward_gold":6,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"tax_gold","boss_name_ko":"영혼세 징수관","boss_desc_ko":"정산이 끝나면 골드 3을 압수한다. 빚은 점수로도 골드로도 갚아야 한다.","boss_name_en":"Soul-Tax Collector","boss_desc_en":"When the round settles, 3 Gold is seized. Debts are paid in score and in coin."}]},{"night":3,"name_ko":"세 번째 밤 — 눈금 도둑","name_en":"Night 3 — The Pip Thief","rounds":[{"round":1,"type":"normal","target_score":2900,"reward_gold":6,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":3100,"reward_gold":7,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":3000,"reward_gold":8,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"cap_six_to_three","boss_name_ko":"눈금 도둑","boss_desc_ko":"6 눈금을 훔쳐 3으로 바꿔 놓는다. 여섯을 노리던 판이 무너진다.","boss_name_en":"The Pip Thief","boss_desc_en":"Every 6 is stolen and turned into a 3. Plans built on sixes collapse."}]},{"night":4,"name_ko":"네 번째 밤 — 쌍둥이 사기꾼","name_en":"Night 4 — The Twin Cheats","rounds":[{"round":1,"type":"normal","target_score":4100,"reward_gold":8,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":4400,"reward_gold":9,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":3400,"reward_gold":10,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"no_pair_bonus","boss_name_ko":"쌍둥이 사기꾼","boss_desc_ko":"같은 눈금을 맞춰도 배수가 붙지 않는다. 페어 계열 족보의 기본 배수가 1 줄어든다(최소 1).","boss_name_en":"The Twin Cheats","boss_desc_en":"Matching pips earn no bonus: pair-type hands lose 1 base Mult (minimum 1)."}]},{"night":5,"name_ko":"다섯 번째 밤 — 무덤의 주인","name_en":"Night 5 — The Gravekeeper","rounds":[{"round":1,"type":"normal","target_score":4900,"reward_gold":10,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":5200,"reward_gold":12,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":6000,"reward_gold":14,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"no_even","boss_name_ko":"무덤의 주인","boss_desc_ko":"무덤은 짝수를 삼킨다. 짝수 눈금 주사위는 홀드할 수 없다.","boss_name_en":"The Gravekeeper","boss_desc_en":"The grave swallows even numbers. You cannot hold dice showing an even face."}]}]};

  /* ══════════════════════════════ 4. 상태 ══════════════════════════════ */

  const S = {
    lang: 'ko',
    sound: true,
    screen: 'title',
    phase: 'title',          // title | rolled | scoring | shop | over | won
    dataSource: 'fallback',
    meta: {},

    roundIndex: 0,
    night: 1,
    roundNum: 1,
    roundName: '',
    target: 0,
    score: 0,
    gold: 0,

    hands: 0,
    handsMax: 0,
    rerolls: 0,
    rerollsMax: 0,

    dice: [],                 // { value, held }
    relics: [],               // { ...relic, uid }
    charms: [],               // { ...charm, uid }

    selectedHand: null,
    tempMult: 0,
    tempMultLabel: '',

    roundPipBonus: 0,
    roundBonusRerolls: 0,
    roundBaseRerolls: 2,
    handBonus: { chips: 0, mult: 0, rows: [] },

    totalScore: 0,
    focusCharm: -1,
    rolling: false,
    skipAnim: false,
    best: null,
    lastResult: null,

    shop: null,
    log: [],
    uid: 1
  };

  let DATA = null;          // { meta, hands, relics, charms, nights }
  let ROUNDS = [];          // 평탄화된 라운드 목록
  let tooltipTimer = 0;
  let toastTimer = 0;

  /* ══════════════════════════════ 5. 유틸 ══════════════════════════════ */

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) {
    const node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text != null) node.textContent = text;
    return node;
  }
  function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }
  function rnd(n) { return Math.floor(Math.random() * n); }
  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = rnd(i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }

  // 상점 유물 진열 등급 가중치 (GDD 3.3 권장: common 55 / uncommon 28 / rare 12 / cursed 5)
  const RARITY_WEIGHT = { common: 55, uncommon: 28, rare: 12, cursed: 5 };
  function pickWeightedRelics(pool, count) {
    const remaining = pool.slice();
    const out = [];
    while (out.length < count && remaining.length) {
      let total = 0;
      const weights = remaining.map(r => {
        const w = RARITY_WEIGHT[r.rarity] != null ? RARITY_WEIGHT[r.rarity] : 10;
        total += w;
        return w;
      });
      let roll = Math.random() * total;
      let idx = 0;
      for (; idx < remaining.length; idx++) {
        roll -= weights[idx];
        if (roll <= 0) break;
      }
      if (idx >= remaining.length) idx = remaining.length - 1;
      out.push(remaining.splice(idx, 1)[0]);
    }
    return out;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function num(v, d) { const n = Number(v); return isFinite(n) ? n : (d || 0); }
  function comma(n) {
    try { return Math.round(n).toLocaleString(S.lang === 'ko' ? 'ko-KR' : 'en-US'); }
    catch (e) { return String(Math.round(n)); }
  }
  function t(key, vars) {
    const dict = I18N[S.lang] || I18N.ko;
    let str = dict[key];
    if (str == null) str = (I18N.ko[key] != null ? I18N.ko[key] : key);
    if (vars) {
      Object.keys(vars).forEach(k => {
        str = str.replace(new RegExp('\\{' + k + '\\}', 'g'), String(vars[k]));
      });
    }
    return str;
  }
  function dname(obj) {
    if (!obj) return '';
    const v = S.lang === 'ko' ? obj.name_ko : obj.name_en;
    return v || obj.name_ko || obj.name_en || obj.id || '';
  }
  function ddesc(obj) {
    if (!obj) return '';
    const v = S.lang === 'ko' ? obj.desc_ko : obj.desc_en;
    return v || obj.desc_ko || obj.desc_en || '';
  }
  function condLabel(cond) {
    return t('cond.' + cond);
  }
  function sfx(name) {
    if (!window.CPSound) return;
    try { window.CPSound[name].apply(null, Array.prototype.slice.call(arguments, 1)); }
    catch (e) { /* 사운드는 실패해도 게임을 막지 않는다 */ }
  }

  /* ══════════════════════════════ 6. 저장소 ══════════════════════════════ */

  function loadSave() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (e) { return {}; }
  }
  function writeSave(obj) {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(obj)); } catch (e) { /* private mode */ }
  }
  function loadSettings() {
    const save = loadSave();
    if (save.lang === 'en' || save.lang === 'ko') S.lang = save.lang;
    if (typeof save.sound === 'boolean') S.sound = save.sound;
    S.best = save.best || null;
  }
  function persistSettings() {
    const save = loadSave();
    save.lang = S.lang;
    save.sound = S.sound;
    writeSave(save);
  }
  function persistBest(best) {
    const save = loadSave();
    save.best = best;
    writeSave(save);
    S.best = best;
  }

  /* ══════════════════════════════ 7. 데이터 로딩/정규화 ══════════════════════════════ */

  function normalizeHand(h, fb) {
    const base = fb || {};
    const id = h.id || base.id;
    if (!id) return null;
    return {
      id: id,
      name_ko: h.name_ko || base.name_ko || id,
      name_en: h.name_en || base.name_en || id,
      base_chips: num(h.base_chips, num(base.base_chips, 0)),
      base_mult: num(h.base_mult, num(base.base_mult, 1)),
      desc_ko: h.desc_ko || base.desc_ko || '',
      desc_en: h.desc_en || base.desc_en || ''
    };
  }

  function normalizeRelic(r) {
    if (!r || !r.id) return null;
    return {
      id: r.id,
      name_ko: r.name_ko || r.id,
      name_en: r.name_en || r.id,
      rarity: (r.rarity || 'common'),
      cost: num(r.cost, 4),
      icon: r.icon || '◆',
      trigger: (r.trigger || 'on_score'),
      effect_type: (r.effect_type || 'add_chips'),
      value: num(r.value, 0),
      condition: (r.condition || 'always'),
      desc_ko: r.desc_ko || '',
      desc_en: r.desc_en || ''
    };
  }

  function normalizeCharm(c) {
    if (!c || !c.id) return null;
    return {
      id: c.id,
      name_ko: c.name_ko || c.id,
      name_en: c.name_en || c.id,
      cost: num(c.cost, 3),
      icon: c.icon || '✧',
      effect_type: (c.effect_type || 'gold_gain'),
      value: num(c.value, 1),
      desc_ko: c.desc_ko || '',
      desc_en: c.desc_en || ''
    };
  }

  function normalizeData(json) {
    const fb = FALLBACK_DATA || {};
    const meta = Object.assign({
      start_gold: 4,
      shop_reroll_cost: 3,
      shop_relic_offers: 3,
      shop_charm_offers: 2,
      relic_slots: 6,
      charm_slots: 3,
      dice_count: 5
    }, fb.meta || {}, (json && json.meta) || {});

    // 손패: 알려진 9종은 순서 고정, 누락분은 폴백으로 보충
    const remoteHands = Array.isArray(json && json.hands) ? json.hands : [];
    const fbHands = Array.isArray(fb.hands) ? fb.hands : [];
    const handMap = {};
    fbHands.forEach(h => { handMap[h.id] = h; });
    remoteHands.forEach(h => { if (h && h.id) handMap[h.id] = h; });
    const hands = HAND_ORDER
      .map(id => normalizeHand(handMap[id] || {}, fbHands.find(h => h.id === id)))
      .filter(Boolean);

    let relics = (Array.isArray(json && json.relics) ? json.relics : [])
      .map(normalizeRelic).filter(Boolean);
    if (!relics.length && Array.isArray(fb.relics)) relics = fb.relics.map(normalizeRelic).filter(Boolean);

    let charms = (Array.isArray(json && json.charms) ? json.charms : [])
      .map(normalizeCharm).filter(Boolean);
    if (!charms.length && Array.isArray(fb.charms)) charms = fb.charms.map(normalizeCharm).filter(Boolean);

    // 밤/라운드: {night, rounds:[...]} 형태와 평탄 배열 모두 지원
    let nights = Array.isArray(json && json.nights) && json.nights.length ? json.nights : (fb.nights || []);
    const flat = [];
    if (Array.isArray(nights)) {
      if (nights.length && nights.every(n => n && typeof n.target_score === 'number')) {
        nights.forEach((r, i) => flat.push(Object.assign({}, r, { night: Math.floor(i / 3) + 1 })));
      } else {
        nights.forEach((n, ni) => {
          if (!n) return;
          const nightNo = num(n.night, ni + 1);
          const list = Array.isArray(n.rounds) ? n.rounds : (Array.isArray(n) ? n : []);
          list.forEach(r => {
            if (!r) return;
            flat.push(Object.assign({}, r, {
              night: nightNo,
              night_name_ko: n.name_ko || '',
              night_name_en: n.name_en || '',
              round: num(r.round, flat.length % 3 + 1)
            }));
          });
        });
      }
    }
    if (!flat.length && Array.isArray(fb.nights)) {
      fb.nights.forEach((n, ni) => {
        (n.rounds || []).forEach(r => {
          flat.push(Object.assign({}, r, { night: n.night || ni + 1, night_name_ko: n.name_ko || '', night_name_en: n.name_en || '' }));
        });
      });
    }
    flat.sort((a, b) => (a.night - b.night) || (a.round - b.round));
    flat.forEach((r, i) => {
      r.target_score = num(r.target_score, 100);
      r.reward_gold = num(r.reward_gold, 3);
      r.hands_allowed = num(r.hands_allowed, 4);
      r.rerolls_per_hand = num(r.rerolls_per_hand, 2);
      r.type = r.type || 'normal';
      r.boss_curse_id = r.boss_curse_id || null;
      r._index = i;
    });

    return { meta: meta, hands: hands, relics: relics, charms: charms, nights: flat };
  }

  function loadGameData() {
    const fallback = () => {
      DATA = normalizeData(FALLBACK_DATA || {});
      ROUNDS = DATA.nights;
      S.dataSource = 'fallback';
      console.warn('[CP] 내장 기본 데이터로 실행합니다.');
    };
    let timeout = null;
    const guard = new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error('timeout')), 3000);
    });
    const req = fetch('data/game_data.json', { cache: 'no-store' })
      .then(res => {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(json => {
        if (!json || !Array.isArray(json.hands) || !json.hands.length) throw new Error('invalid schema');
        DATA = normalizeData(json);
        ROUNDS = DATA.nights;
        if (!ROUNDS.length) throw new Error('no rounds');
        S.dataSource = 'json';
        console.log('[CP] game_data.json 로드 완료 —', ROUNDS.length, '라운드');
      });

    return Promise.race([req, guard])
      .catch(err => {
        console.warn('[CP] game_data.json 을 불러오지 못했습니다 (' + err.message + ') → fallback');
        fallback();
      })
      .then(() => { if (timeout) clearTimeout(timeout); });
  }

  /* ══════════════════════════════ 8. 데이터 접근 ══════════════════════════════ */

  function handById(id) { return DATA.hands.find(h => h.id === id) || null; }
  function relicDefById(id) { return DATA.relics.find(r => r.id === id) || null; }
  function charmDefById(id) { return DATA.charms.find(c => c.id === id) || null; }
  function currentRound() { return ROUNDS[S.roundIndex] || ROUNDS[0]; }
  function currentCurse() {
    const r = currentRound();
    return r && r.boss_curse_id ? r.boss_curse_id : null;
  }
  function nightName() {
    const r = currentRound() || {};
    return (S.lang === 'ko' ? r.night_name_ko : r.night_name_en) || '';
  }

  /* ══════════════════════════════ 9. 조건 판정 ══════════════════════════════ */

  const WORD2NUM = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };

  function evalVal(v) {
    if (currentCurse() === 'cap_six_to_three' && v === 6) return 3;
    return v;
  }

  function pipValues() {
    return S.dice.filter(d => d.value).map(d => evalVal(d.value));
  }

  function countOf(vals, n) {
    return vals.reduce((acc, v) => acc + (v === n ? 1 : 0), 0);
  }

  /**
   * 유물 조건 판정.
   * ctx: { vals(유효 눈금 5개), handId, handRank, handsLeft, gold }
   * 짝수/홀수/6/1 조건은 항상 주사위 5개 기준.
   */
  function conditionMet(condition, ctx) {
    const c = String(condition || 'always').toLowerCase().trim();
    if (!c || c === 'always' || c === 'any' || c === 'true' || c === 'none') return true;

    const vals = ctx.vals || [];
    const even = vals.filter(v => v % 2 === 0).length;
    const odd = vals.length - even;
    const rank = typeof ctx.handRank === 'number' ? ctx.handRank : (HAND_RANK[ctx.handId] || 0);

    switch (c) {
      case 'even_count': return even >= 3;
      case 'odd_count': return odd >= 3;
      case 'pair_or_better': return rank >= 1;
      case 'straight': return ctx.handId === 'small_straight' || ctx.handId === 'large_straight';
      case 'six_present': return vals.indexOf(6) >= 0;
      case 'one_present': return vals.indexOf(1) >= 0;
      case 'last_hand': return ctx.handsLeft <= 1;
      case 'gold_over_15': return ctx.gold >= 15;
      default: break;
    }

    // 방어적 확장 처리 (데이터가 변형되어도 죽지 않도록)
    let m;
    if ((m = c.match(/^(even|odd)_count_(\d+)$/))) {
      return (m[1] === 'even' ? even : odd) >= +m[2];
    }
    if ((m = c.match(/^gold_over_(\d+)$/))) return ctx.gold > +m[1];
    if ((m = c.match(/^gold_at_least_(\d+)$/))) return ctx.gold >= +m[1];
    if ((m = c.match(/^(one|two|three|four|five|six)_present$/))) return vals.indexOf(WORD2NUM[m[1]]) >= 0;
    if ((m = c.match(/^(one|two|three|four|five|six)_count_(\d+)$/))) return countOf(vals, WORD2NUM[m[1]]) >= +m[2];
    if ((m = c.match(/^(even|odd)_exact_(\d+)$/))) return (m[1] === 'even' ? even : odd) === +m[2];

    const altRanks = {
      two_pair_or_better: 2,
      three_kind_or_better: 3,
      full_house_or_better: 6,
      four_kind_or_better: 7,
      yahtzee_or_better: 8
    };
    if (altRanks[c] != null) return rank >= altRanks[c];

    console.warn('[CP] 알 수 없는 유물 조건:', condition);
    return false;
  }

  /* ══════════════════════════════ 10. 족보 판정 ══════════════════════════════ */

  function evaluate(vals) {
    const counts = {};
    vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
    const entries = Object.keys(counts).map(k => ({ v: +k, n: counts[k] }));
    const uniq = entries.map(e => e.v).sort((a, b) => a - b);
    const maxCount = entries.reduce((m, e) => Math.max(m, e.n), 0);
    const pairs = entries.filter(e => e.n >= 2).sort((a, b) => (b.n - a.n) || (b.v - a.v));

    function hasRun(len) {
      let run = 1;
      for (let i = 1; i < uniq.length; i++) {
        if (uniq[i] === uniq[i - 1] + 1) {
          run += 1;
          if (run >= len) return true;
        } else {
          run = 1;
        }
      }
      return run >= len;
    }

    const isLarge = uniq.length === 5 && uniq[4] - uniq[0] === 4;
    const isSmall = !isLarge && hasRun(4);
    const isFull = entries.some(e => e.n === 3) && entries.some(e => e.n === 2);

    const achievable = {
      high_card: true,
      one_pair: pairs.length >= 1,
      two_pair: pairs.length >= 2,
      three_kind: maxCount >= 3,
      small_straight: isSmall,
      large_straight: isLarge,
      full_house: isFull,
      four_kind: maxCount >= 4,
      yahtzee: maxCount === 5
    };

    // 정산에 포함되는 주사위(연출용 하이라이트)
    const idxOfValue = (v) => vals.map((x, i) => (x === v ? i : -1)).filter(i => i >= 0);

    const scoring = {};
    scoring.high_card = idxOfValue(uniq[uniq.length - 1]).slice(0, 1);
    scoring.one_pair = pairs.length ? idxOfValue(pairs[0].v) : [];
    scoring.two_pair = pairs.length >= 2 ? idxOfValue(pairs[0].v).concat(idxOfValue(pairs[1].v)) : [];
    scoring.three_kind = maxCount >= 3 ? idxOfValue(pairs.slice().sort((a, b) => b.n - a.n)[0].v) : [];
    scoring.small_straight = achievable.small_straight ? [0, 1, 2, 3, 4] : [];
    scoring.large_straight = achievable.large_straight ? [0, 1, 2, 3, 4] : [];
    scoring.full_house = achievable.full_house ? [0, 1, 2, 3, 4] : [];
    scoring.four_kind = maxCount >= 4 ? idxOfValue(entries.find(e => e.n >= 4).v) : [];
    scoring.yahtzee = achievable.yahtzee ? [0, 1, 2, 3, 4] : [];

    let best = 'high_card';
    if (achievable.yahtzee) best = 'yahtzee';
    else if (achievable.four_kind) best = 'four_kind';
    else if (achievable.full_house) best = 'full_house';
    else if (achievable.large_straight) best = 'large_straight';
    else if (achievable.small_straight) best = 'small_straight';
    else if (achievable.three_kind) best = 'three_kind';
    else if (achievable.two_pair) best = 'two_pair';
    else if (achievable.one_pair) best = 'one_pair';

    return { achievable: achievable, best: best, scoring: scoring, counts: counts, uniq: uniq };
  }

  /* ══════════════════════════════ 11. 점수 계산 ══════════════════════════════ */

  function buildContext(handId) {
    const res = evaluate(pipValues());
    return {
      vals: pipValues(),
      handId: handId || res.best,
      handRank: HAND_RANK[handId || res.best] || 0,
      handsLeft: S.hands,
      gold: S.gold,
      curse: currentCurse(),
      diceValues: S.dice.map(d => d.value)
    };
  }

  /**
   * (기본 칩 + 유물 add_chips) × (기본 배수 + 유물 add_mult) × mul_mult 곱
   */
  function computeScore(handId) {
    if (!S.dice.length || S.dice.some(d => !d.value)) return null;
    const hand = handById(handId);
    if (!hand) return null;

    const vals = pipValues();
    const res = evaluate(vals);
    if (!res.achievable[handId]) return null;

    const ctx = {
      vals: vals,
      handId: handId,
      handRank: HAND_RANK[handId] || 0,
      handsLeft: S.hands,
      gold: S.gold,
      curse: currentCurse()
    };

    let baseChips = num(hand.base_chips, 0);
    let baseMult = num(hand.base_mult, 1);
    const curseNotes = [];

    if (ctx.curse === 'no_pair_bonus' && PAIR_FAMILY.indexOf(handId) >= 0) {
      baseMult = Math.max(1, baseMult - 1);
      curseNotes.push({ type: 'no_pair_bonus', text: t('bd.curse') });
    }

    let chips = baseChips;
    let mult = baseMult;
    const muls = [];
    const rows = [];

    // 핸드 시작 시 확정된 on_roll 보너스 (핸드당 1회)
    const bonus = S.handBonus || { chips: 0, mult: 0, rows: [] };
    chips += num(bonus.chips, 0);
    mult += num(bonus.mult, 0);
    (bonus.rows || []).forEach(row => {
      rows.push({ relic: row.relic, kind: row.kind, value: row.value, met: !!row.met, trigger: 'on_roll' });
    });

    S.relics.forEach(relic => {
      const kind = relic.effect_type;
      if (kind !== 'add_chips' && kind !== 'add_mult' && kind !== 'mul_mult') return;
      if (relic.trigger === 'on_roll') return; // 위에서 1회만 반영
      const met = conditionMet(relic.condition, ctx);
      if (!met) {
        rows.push({ relic: relic, kind: kind, value: num(relic.value, 0), met: false });
        return;
      }
      const value = num(relic.value, 0);
      if (kind === 'add_chips') chips += value;
      else if (kind === 'add_mult') mult += value;
      else if (kind === 'mul_mult') muls.push(value);
      rows.push({ relic: relic, kind: kind, value: value, met: true });
    });

    let tempMult = 0;
    if (S.tempMult) {
      tempMult = S.tempMult;
      mult += tempMult;
    }

    // 모든 mul_mult 를 곱한 뒤 최종 배수에 한 번만 적용한다.
    const mulProduct = Math.round(muls.reduce((a, b) => a * b, 1) * 10000) / 10000;
    const total = Math.max(0, Math.floor(chips * mult * mulProduct + 1e-9));

    return {
      handId: handId,
      hand: hand,
      vals: vals,
      diceValues: S.dice.map(d => d.value),
      scoringIdx: res.scoring[handId] || [],
      baseChips: baseChips,
      baseMult: baseMult,
      chips: chips,
      mult: mult,
      muls: muls,
      mulProduct: mulProduct,
      tempMult: tempMult,
      total: total,
      rows: rows,
      curseNotes: curseNotes
    };
  }

  /**
   * on_roll 유물은 핸드의 첫 굴림에서 한 번만 확정된다.
   * 리롤을 반복해도 다시 발동하지 않는다. (핸드당 1회)
   */
  function computeHandBonus() {
    const bonus = { chips: 0, mult: 0, rows: [] };
    if (!S.dice.length) return bonus;

    const vals = pipValues();
    const ctx = {
      vals: vals,
      handId: 'high_card',
      handRank: 0,
      handsLeft: S.hands,
      gold: S.gold,
      curse: currentCurse()
    };

    S.relics.forEach(relic => {
      if (relic.trigger !== 'on_roll') return;
      if (relic.effect_type !== 'add_chips' && relic.effect_type !== 'add_mult') return;
      const met = conditionMet(relic.condition, ctx);
      const value = num(relic.value, 0);
      bonus.rows.push({ relic: relic, kind: relic.effect_type, value: value, met: met, trigger: 'on_roll' });
      if (!met) return;
      if (relic.effect_type === 'add_chips') bonus.chips += value;
      else bonus.mult += value;
    });

    return bonus;
  }

  function bestHand() {
    let best = null;
    let bestTotal = -1;
    HAND_ORDER.forEach(id => {
      const bd = computeScore(id);
      if (bd && bd.total > bestTotal) { bestTotal = bd.total; best = id; }
    });
    return best;
  }

  /* ══════════════════════════════ 12. 런 진행 ══════════════════════════════ */

  function startRun() {
    DATA = DATA || normalizeData(FALLBACK_DATA || {});
    S.roundIndex = 0;
    S.totalScore = 0;
    S.relics = [];
    S.charms = [];
    S.log = [];
    S.gold = num(DATA.meta.start_gold, 4);
    S.uid = 1;
    S.tempMult = 0;
    S.lastResult = null;
    startRound();
  }

  function startRound() {
    const r = currentRound();
    if (!r) return;

    S.phase = 'idle';
    S.night = num(r.night, 1);
    S.roundNum = num(r.round, 1);
    S.roundName = (S.lang === 'ko' ? r.night_name_ko : r.night_name_en) || '';
    S.target = num(r.target_score, 100);
    S.score = 0;
    S.roundPipBonus = 0;
    S.roundBonusRerolls = 0;
    S.roundBaseRerolls = currentCurse() === 'minus_reroll' ? 1 : num(r.rerolls_per_hand, 2);
    S.tempMult = 0;
    S.tempMultLabel = '';
    S.focusCharm = -1;
    S.selectedHand = null;
    S.handCount = 0;

    const extraHands = S.relics.reduce((acc, rl) => acc + (rl.effect_type === 'extra_hand' ? num(rl.value, 0) : 0), 0);
    S.handsMax = num(r.hands_allowed, 4) + extraHands;
    S.hands = S.handsMax;

    addLog('roundStart', t('log.roundStart', {
      night: S.night,
      type: t('type.' + (r.type || 'normal')),
      round: S.roundNum
    }), '', '');

    if (r.boss_curse_id) {
      addLog('curse', t('log.curse', { name: dname(CURSE_INFO[r.boss_curse_id] ? { name_ko: CURSE_INFO[r.boss_curse_id].ko.name, name_en: CURSE_INFO[r.boss_curse_id].en.name } : {}) }), '', 'bad');
      sfx('boss');
      say('boss');
    } else {
      sfx('click');
      say('round');
    }

    renderBoss();
    startHand(true);
  }

  function computeRerolls() {
    const base = currentCurse() === 'minus_reroll' ? 1 : num(currentRound().rerolls_per_hand, 2);
    const relicBonus = S.relics.reduce((acc, r) => acc + (r.effect_type === 'extra_reroll' ? num(r.value, 0) : 0), 0);
    return Math.max(0, base + relicBonus + (S.roundBonusRerolls || 0));
  }

  function rollValue() {
    return clamp(1 + rnd(6) + (S.roundPipBonus || 0), 1, 6);
  }

  function startHand(first) {
    S.rerollsMax = computeRerolls();
    S.rerolls = S.rerollsMax;
    S.tempMult = 0;
    S.tempMultLabel = '';
    S.focusCharm = -1;
    S.phase = 'idle';
    S.rolling = false;
    S.handCount = (S.handCount || 0) + 1;

    // 이번 기회의 주사위는 아직 굴리지 않은 상태로 시작한다. (첫 굴리기는 무료)
    S.dice = [];
    for (let i = 0; i < DICE_COUNT; i++) S.dice.push({ value: 0, held: false });

    S.handBonus = { chips: 0, mult: 0, rows: [] };
    S.selectedHand = null;

    renderAll();
    if (!first) sfx('tick');
  }

  function rollHand() {
    S.dice.forEach(d => { d.value = rollValue(); d.held = false; });
    S.phase = 'rolled';
    S.handBonus = computeHandBonus();
    S.selectedHand = bestHand();
    renderAll();
    animateDiceRoll(S.dice.map((_, i) => i));
    sfx('dice', DICE_COUNT);
  }

  function animateDiceRoll(indices) {
    S.rolling = true;
    renderButtons();
    const nodes = $('dice-stage').querySelectorAll('.die');
    indices.forEach((idx, k) => {
      const node = nodes[idx];
      if (!node) return;
      const inner = node.querySelector('.die-inner');
      if (inner) inner.style.animationDelay = (k * 45) + 'ms';
      node.classList.add('rolling');
    });

    const churn = setInterval(() => {
      indices.forEach(idx => {
        const node = nodes[idx];
        if (node) node.setAttribute('data-face', String(1 + rnd(6)));
      });
    }, 65);

    setTimeout(() => {
      clearInterval(churn);
      S.rolling = false;
      renderDice();
      renderButtons();
    }, 660);
  }

  function onRoll() {
    if (S.rolling) return;
    if (S.focusCharm >= 0) { cancelFocus(); }
    if (S.phase === 'idle') { rollHand(); return; }
    if (S.phase !== 'rolled') return;
    if (S.rerolls <= 0) {
      toast(t('msg.noReroll'), true);
      sfx('error');
      return;
    }
    S.rerolls -= 1;
    const idx = [];
    S.dice.forEach((d, i) => {
      if (!d.held) {
        d.value = rollValue();
        idx.push(i);
      }
    });
    if (!idx.length) {
      toast(t('msg.selectHand'), true);
      S.rerolls += 1;
      return;
    }
    S.selectedHand = bestHand();
    sfx('reroll');
    renderAll();
    animateDiceRoll(idx);
  }

  function onDieClick(i) {
    if (S.phase !== 'rolled' || S.rolling) return;

    if (S.focusCharm >= 0) {
      applyFlip(i);
      return;
    }

    const d = S.dice[i];
    if (!d) return;

    if (currentCurse() === 'no_even' && d.value % 2 === 0) {
      toast(t('toast.evenLocked'), true);
      sfx('error');
      const node = $('dice-stage').querySelectorAll('.die')[i];
      if (node) {
        node.classList.add('shake');
        setTimeout(() => node.classList.remove('shake'), 340);
      }
      return;
    }

    d.held = !d.held;
    sfx('hold', d.held);
    renderDice();
    renderButtons();
    renderTableMessage();
  }

  function handDiceHighlight(indices) {
    const nodes = $('dice-stage').querySelectorAll('.die');
    nodes.forEach(node => node.classList.remove('in-hand'));
    indices.forEach(i => {
      if (nodes[i]) nodes[i].classList.add('in-hand');
    });
  }

  function doScore() {
    if (S.phase !== 'rolled' || S.rolling) return;
    if (!S.selectedHand) {
      toast(t('msg.needHand'), true);
      sfx('error');
      return;
    }
    const bd = computeScore(S.selectedHand);
    if (!bd) {
      toast(t('msg.needHand'), true);
      sfx('error');
      return;
    }

    S.phase = 'scoring';
    S.skipAnim = false;
    renderButtons();

    playScoreAnimation(bd).then(() => commitScore(bd));
  }

  async function playScoreAnimation(bd) {
    const popup = $('score-popup');
    $('sp-hand-name').textContent = dname(bd.hand);
    $('sp-hand-tag').textContent = bd.diceValues.join(' · ');

    $('sp-chips-base').textContent = comma(bd.baseChips);
    $('sp-chips-dice').style.display = 'none';

    const chipAdds = bd.rows.filter(r => r.met && r.kind === 'add_chips');
    const chipSum = chipAdds.reduce((a, r) => a + r.value, 0);
    $('sp-relic-chips').textContent = chipSum ? '+' + comma(chipSum) : (chipAdds.length ? '+0' : '');
    $('sp-chips-total').textContent = comma(bd.chips);

    $('sp-mult-base').textContent = comma(bd.baseMult);
    const multAdds = bd.rows.filter(r => r.met && r.kind === 'add_mult');
    const multSum = multAdds.reduce((a, r) => a + r.value, 0) + (bd.tempMult || 0);
    $('sp-mult-add').textContent = multSum ? '+' + comma(multSum) : '';
    const mulMuls = bd.rows.filter(r => r.met && r.kind === 'mul_mult');
    $('sp-relic-mults').textContent = mulMuls.length || bd.mulProduct !== 1
      ? bd.muls.map(m => '×' + m).join(' ')
      : '';
    $('sp-mult-total').textContent = comma(bd.mult);

    const rowsBox = $('sp-relic-rows');
    rowsBox.innerHTML = '';
    const shown = bd.rows.filter(r => r.met);
    shown.forEach(r => {
      const row = el('div', 'sp-relic-row');
      row.innerHTML = '';
      const left = el('span', '', r.relic.icon + ' ' + dname(r.relic));
      const right = el('b', '', r.kind === 'add_chips'
        ? '+' + comma(r.value) + ' CHIPS'
        : (r.kind === 'add_mult' ? '+' + comma(r.value) + ' MULT' : '×' + r.value + ' MULT'));
      row.appendChild(left);
      row.appendChild(right);
      rowsBox.appendChild(row);
    });
    if (bd.tempMult) {
      const row = el('div', 'sp-relic-row');
      row.appendChild(el('span', '', '🜏 ' + (bd.tempMultLabel || 'CHARM')));
      row.appendChild(el('b', '', '+' + comma(bd.tempMult) + ' MULT'));
      rowsBox.appendChild(row);
    }
    if (!shown.length && !bd.tempMult) {
      rowsBox.appendChild(el('div', 'sp-relic-row', t('bd.none')));
    }

    $('sp-total').textContent = '= ' + comma(bd.total);

    popup.classList.remove('hidden');
    // reflow 후 show
    void popup.offsetWidth;
    popup.classList.add('show');
    sfx('score', 0);

    await sleep(200);
    for (let i = 0; i < shown.length; i++) {
      if (S.skipAnim) break;
      sfx('score', Math.min(10, i + 1));
      const rows = rowsBox.children;
      if (rows[i]) rows[i].classList.add('lit');
      await sleep(105);
    }
    if (bd.tempMult) sfx('score', 4);

    $('sp-total').classList.remove('pop');
    void $('sp-total').offsetWidth;
    $('sp-total').classList.add('pop');
    sfx('scoreTotal');

    await sleep(S.skipAnim ? 60 : 620);

    popup.classList.remove('show');
    await sleep(170);
    popup.classList.add('hidden');
    $('sp-total').classList.remove('pop');
  }

  function commitScore(bd) {
    S.score += bd.total;
    S.totalScore += bd.total;
    S.hands -= 1;
    S.tempMult = 0;
    S.tempMultLabel = '';

    addLog('score', t('log.score', { hand: dname(bd.hand) }), '+' + comma(bd.total), 'good');
    sfx('coins', 2);

    const handsEl = $('stat-hands');
    floatAt($('hud-score'), '+' + comma(bd.total), '');
    if (handsEl) handsEl.classList.add('pulse');
    setTimeout(() => { if (handsEl) handsEl.classList.remove('pulse'); }, 520);

    renderHUD();
    renderScoreBar();

    if (S.score >= S.target) {
      S.phase = 'shop';
      setTimeout(roundClear, 420);
      return;
    }
    if (S.hands <= 0) {
      setTimeout(gameOver, 520);
      return;
    }
    startHand(false);
  }

  function roundClear() {
    const r = currentRound();
    let reward = num(r.reward_gold, 3);

    // 골드 보너스 유물 (패시브)
    let bonus = 0;
    const ctx = buildContext(S.selectedHand || 'high_card');
    S.relics.forEach(relic => {
      if (relic.effect_type !== 'gold_bonus') return;
      if (conditionMet(relic.condition, ctx)) bonus += num(relic.value, 0);
    });

    S.gold += reward + bonus;

    let tax = 0;
    if (currentCurse() === 'tax_gold') {
      tax = Math.min(3, S.gold);
      S.gold -= tax;
      addLog('tax', t('log.tax'), '−' + tax, 'bad');
      sfx('error');
    }

    addLog('clear', t('log.clear'), '+' + comma(reward + bonus), 'good');
    sfx('roundClear');
    say('clear');

    renderAll();

    if (S.roundIndex >= ROUNDS.length - 1) {
      setTimeout(victory, 500);
      return;
    }
    openShop(reward, bonus, tax);
  }

  function gameOver() {
    S.phase = 'over';
    finishRun(false);
    say('fail');
    sfx('lose');
    setTimeout(() => showResult(false), 450);
  }

  function victory() {
    S.phase = 'won';
    finishRun(true);
    sfx('win');
    setTimeout(() => showResult(true), 300);
  }

  function finishRun(won) {
    const prev = loadSave().best || { score: 0, night: 0, round: 0, wins: 0, runs: 0 };
    const best = {
      score: Math.max(num(prev.score, 0), S.totalScore),
      night: Math.max(num(prev.night, 0), S.night),
      round: num(prev.night, 0) < S.night ? S.roundNum : Math.max(num(prev.round, 0), S.roundNum),
      wins: num(prev.wins, 0) + (won ? 1 : 0),
      runs: num(prev.runs, 0) + 1,
      date: new Date().toISOString()
    };
    const isNew = S.totalScore > num(prev.score, 0);
    persistBest(best);

    S.lastResult = {
      won: won,
      score: S.totalScore,
      night: S.night,
      round: S.roundNum,
      gold: S.gold,
      isNew: isNew
    };
  }

  /* ══════════════════════════════ 13. 상점 ══════════════════════════════ */

  function openShop(reward, bonus, tax) {
    const ownedRelicIds = S.relics.map(r => r.id);
    const pool = DATA.relics.filter(r => ownedRelicIds.indexOf(r.id) < 0);
    const relicOffers = pickWeightedRelics(pool, num(DATA.meta.shop_relic_offers, 3));
    const charmOffers = [];
    const charmCount = num(DATA.meta.shop_charm_offers, 2);
    for (let i = 0; i < charmCount; i++) {
      const pick = DATA.charms[rnd(DATA.charms.length)];
      if (pick) charmOffers.push(pick);
    }

    S.shop = {
      relics: relicOffers.map(r => ({ def: r, bought: false })),
      charms: charmOffers.map(c => ({ def: c, bought: false })),
      reward: reward,
      bonus: bonus,
      tax: tax,
      rerollCost: num(DATA.meta.shop_reroll_cost, 3),
      clearedBoss: (currentRound().type === 'boss')
    };

    renderShop();
    $('overlay-shop').classList.remove('hidden');
    say('buy');
  }

  function renderShop() {
    if (!S.shop) return;
    const shop = S.shop;

    $('shop-title').textContent = shop.clearedBoss ? t('shop.titleBoss') : t('shop.title');
    let rewardText = t('shop.reward', { g: comma(shop.reward) });
    if (shop.bonus) rewardText += ' · ' + t('shop.bonus', { b: comma(shop.bonus) });
    if (shop.tax) rewardText += ' · ' + t('shop.tax', { t: comma(shop.tax) });
    $('shop-reward').textContent = rewardText;
    $('shop-gold').textContent = comma(S.gold);
    $('btn-shop-reroll').querySelector('.cost').textContent = '◎ ' + shop.rerollCost;
    $('btn-shop-reroll').disabled = S.gold < shop.rerollCost;
    $('btn-next-label').textContent = shop.clearedBoss ? t('shop.next') : t('shop.nextRound');

    const shopHint = $('shop-hint');
    if (shopHint) shopHint.textContent = t('shop.hint');

    const relicBox = $('shop-relics');
    relicBox.innerHTML = '';
    if (!shop.relics.length) relicBox.appendChild(el('div', 'bd-empty', t('shop.empty')));
    shop.relics.forEach((entry, i) => {
      relicBox.appendChild(makeShopCard(entry, 'relic', i));
    });

    const charmBox = $('shop-charms');
    charmBox.innerHTML = '';
    if (!shop.charms.length) charmBox.appendChild(el('div', 'bd-empty', t('shop.empty')));
    shop.charms.forEach((entry, i) => {
      charmBox.appendChild(makeShopCard(entry, 'charm', i));
    });
  }

  function makeShopCard(entry, kind, index) {
    const def = entry.def;
    const card = el('article', 'shop-card rarity-' + (def.rarity || 'common'));
    if (entry.bought) card.classList.add('is-bought');

    const top = el('div', 'sc-top');
    top.appendChild(el('div', 'sc-icon', def.icon || '◆'));
    top.appendChild(el('div', 'sc-rarity', kind === 'relic'
      ? (RARITY_INFO[def.rarity] ? RARITY_INFO[def.rarity][S.lang] : def.rarity)
      : t('ui.charms')));
    card.appendChild(top);

    card.appendChild(el('div', 'sc-name', dname(def)));
    if (kind === 'relic') {
      card.appendChild(el('div', 'sc-trigger', TRIGGER_INFO[def.trigger] ? TRIGGER_INFO[def.trigger][S.lang] : def.trigger));
    }
    card.appendChild(el('p', 'sc-desc', ddesc(def)));
    if (kind === 'relic' && def.condition && def.condition !== 'always') {
      card.appendChild(el('div', 'sc-cond', '◇ ' + condLabel(def.condition)));
    }

    const buy = el('button', 'sc-buy');
    const full = kind === 'relic' ? S.relics.length >= MAX_RELICS : S.charms.length >= MAX_CHARMS;
    buy.textContent = '◎ ' + comma(def.cost);
    buy.disabled = entry.bought || full || S.gold < def.cost;
    buy.addEventListener('click', (e) => {
      e.stopPropagation();
      if (kind === 'relic') buyRelic(index);
      else buyCharm(index);
    });
    card.appendChild(buy);

    return card;
  }

  function buyRelic(index) {
    const entry = S.shop && S.shop.relics[index];
    if (!entry || entry.bought) return;
    if (S.relics.length >= MAX_RELICS) { toast(t('toast.relicsFull'), true); sfx('error'); return; }
    if (S.gold < entry.def.cost) { toast(t('toast.notEnoughGold'), true); sfx('error'); return; }

    S.gold -= entry.def.cost;
    entry.bought = true;
    const owned = Object.assign({}, entry.def, { uid: S.uid++ });
    S.relics.push(owned);
    addLog('relic', t('log.relic', { name: dname(entry.def) }), '−' + comma(entry.def.cost), '');
    toast(t('toast.bought', { name: dname(entry.def), g: comma(entry.def.cost) }));
    sfx('buy');
    renderShop();
    renderAll();
  }

  function buyCharm(index) {
    const entry = S.shop && S.shop.charms[index];
    if (!entry || entry.bought) return;
    if (S.charms.length >= MAX_CHARMS) { toast(t('toast.charmsFull'), true); sfx('error'); return; }
    if (S.gold < entry.def.cost) { toast(t('toast.notEnoughGold'), true); sfx('error'); return; }

    S.gold -= entry.def.cost;
    entry.bought = true;
    S.charms.push(Object.assign({}, entry.def, { uid: S.uid++ }));
    addLog('charm', t('log.charm', { name: dname(entry.def) }), '−' + comma(entry.def.cost), '');
    toast(t('toast.bought', { name: dname(entry.def), g: comma(entry.def.cost) }));
    sfx('buy');
    renderShop();
    renderAll();
  }

  function shopReroll() {
    if (!S.shop) return;
    const cost = S.shop.rerollCost;
    if (S.gold < cost) { toast(t('toast.notEnoughGold'), true); sfx('error'); return; }
    S.gold -= cost;

    const ownedRelicIds = S.relics.map(r => r.id);
    const pool = DATA.relics.filter(r => ownedRelicIds.indexOf(r.id) < 0);
    S.shop.relics = pickWeightedRelics(pool, num(DATA.meta.shop_relic_offers, 3)).map(r => ({ def: r, bought: false }));

    const charmOffers = [];
    for (let i = 0; i < num(DATA.meta.shop_charm_offers, 2); i++) {
      const pick = DATA.charms[rnd(DATA.charms.length)];
      if (pick) charmOffers.push({ def: pick, bought: false });
    }
    S.shop.charms = charmOffers;

    toast(t('toast.shopReroll'));
    sfx('reroll');
    renderShop();
    renderHUD();
  }

  function closeShop() {
    $('overlay-shop').classList.add('hidden');
    S.shop = null;
    S.roundIndex += 1;
    if (S.roundIndex >= ROUNDS.length) {
      victory();
      return;
    }
    startRound();
  }

  /* ══════════════════════════════ 14. 부적 ══════════════════════════════ */

  function charmUsable(charm) {
    if (!charm) return false;
    if (charm.effect_type === 'flip_dice' || charm.effect_type === 'all_plus_one') {
      return S.phase === 'rolled';
    }
    return true;
  }

  function activateCharm(index) {
    if (S.phase !== 'rolled') {
      if (S.phase === 'scoring') return;
      toast(t('toast.diceFirst'), true);
      sfx('error');
      return;
    }
    if (S.focusCharm >= 0) { cancelFocus(); return; }

    const charm = S.charms[index];
    if (!charm) return;

    if (charm.effect_type === 'flip_dice') {
      S.focusCharm = index;
      renderTableMessage();
      renderDice();
      renderCharms();
      return;
    }

    if (charm.effect_type === 'all_plus_one') {
      const v = num(charm.value, 1);
      S.roundPipBonus += v;
      S.dice.forEach(d => { d.value = clamp(d.value + v, 1, 6); });
    } else if (charm.effect_type === 'reroll_plus') {
      S.roundBonusRerolls += num(charm.value, 1);
      S.rerollsMax = computeRerolls();
      S.rerolls += num(charm.value, 1);
    } else if (charm.effect_type === 'hand_plus') {
      S.hands += num(charm.value, 1);
      S.handsMax += num(charm.value, 1);
    } else if (charm.effect_type === 'temp_mult') {
      S.tempMult += num(charm.value, 1);
      S.tempMultLabel = dname(charm);
    } else if (charm.effect_type === 'gold_gain') {
      S.gold += num(charm.value, 0);
      floatAt($('hud-gold'), '+' + comma(num(charm.value, 0)), 'good');
      sfx('coins', 3);
    }

    S.charms.splice(index, 1);
    toast(t('toast.charmUsed', { name: dname(charm) }));
    sfx('charm');
    S.selectedHand = bestHand();
    renderAll();
  }

  function applyFlip(index) {
    const charm = S.charms[S.focusCharm];
    if (!charm) { cancelFocus(); return; }
    const d = S.dice[index];
    if (!d) { cancelFocus(); return; }

    d.value = 7 - d.value;
    d.held = false;
    S.charms.splice(S.focusCharm, 1);
    S.focusCharm = -1;
    toast(t('toast.charmUsed', { name: dname(charm) }));
    sfx('charm');
    S.selectedHand = bestHand();
    renderAll();
  }

  function cancelFocus() {
    S.focusCharm = -1;
    renderTableMessage();
    renderDice();
    renderCharms();
  }

  /* ══════════════════════════════ 15. 유물 판매 ══════════════════════════════ */

  function sellPrice(relic) {
    return Math.max(1, Math.floor(num(relic.cost, 4) / 2));
  }

  function sellRelic(uid) {
    const idx = S.relics.findIndex(r => r.uid === uid);
    if (idx < 0) return;
    const relic = S.relics[idx];
    const price = sellPrice(relic);
    hideTooltip();

    askConfirm(
      t('ui.sell') + ' — ' + dname(relic) + ' (+' + price + ' ◎)',
      t('ui.sell'),
      () => {
        S.relics.splice(idx, 1);
        S.gold += price;
        addLog('sell', t('log.sell', { name: dname(relic) }), '+' + price, 'good');
        toast(t('toast.sold', { name: dname(relic), g: price }));
        sfx('coins', 2);
        renderAll();
      }
    );
  }

  /* ══════════════════════════════ 16. 렌더링 ══════════════════════════════ */

  function renderAll() {
    renderHUD();
    renderNightTrack();
    renderBoss();
    renderRelics();
    renderCharms();
    renderDice();
    renderHandList();
    renderBreakdown();
    renderLog();
    renderButtons();
    renderTableMessage();
    renderDealerPersistent();
  }

  function renderHUD() {
    $('hud-night').textContent = S.night;
    $('hud-round').textContent = S.roundNum;
    const type = (currentRound() && currentRound().type) || 'normal';
    const badge = $('hud-type');
    badge.className = 'type-badge ' + type;
    badge.textContent = t('type.' + type);

    $('hud-score').textContent = comma(S.score);
    $('hud-target').textContent = comma(S.target);
    $('hud-hands').textContent = Math.max(0, S.hands);
    $('hud-rerolls').textContent = Math.max(0, S.rerolls);
    $('hud-gold').textContent = comma(S.gold);

    $('stat-hands').classList.toggle('is-zero', S.hands <= 0);
    $('stat-rerolls').classList.toggle('is-zero', S.rerolls <= 0);
    renderScoreBar();
  }

  function renderScoreBar() {
    const pct = S.target > 0 ? clamp((S.score / S.target) * 100, 0, 100) : 0;
    const fill = $('progress-fill');
    fill.style.width = pct + '%';
    fill.classList.toggle('is-full', S.score >= S.target);
  }

  function renderNightTrack() {
    const box = $('night-track');
    if (!box) return;
    box.innerHTML = '';
    const totalNights = 5;
    for (let n = 1; n <= totalNights; n++) {
      const pip = el('div', 'nt-pip' + (n === 5 ? ' boss-pip' : ''));
      if (n < S.night) pip.classList.add('done');
      if (n === S.night) pip.classList.add('current');
      box.appendChild(pip);
    }
    box.appendChild(el('span', 'nt-label', t('hud.night') + ' ' + S.night + ' / ' + totalNights));
  }

  function renderBoss() {
    const r = currentRound();
    const panel = $('boss-panel');
    if (!r || !r.boss_curse_id) {
      panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    const info = CURSE_INFO[r.boss_curse_id];
    const bossName = (S.lang === 'ko');
    const name = bossName
      ? (r.boss_name_ko || (info ? info.ko.name : r.boss_curse_id))
      : (r.boss_name_en || (info ? info.en.name : r.boss_curse_id));
    const desc = bossName
      ? (r.boss_desc_ko || (info ? info.ko.desc : ''))
      : (r.boss_desc_en || (info ? info.en.desc : ''));
    $('boss-name').textContent = name;
    $('boss-desc').textContent = desc;
  }

  function renderDealerPersistent() {
    if (!$('dealer-line').textContent.trim()) say('round');
  }

  function say(kind) {
    const key = 'dealer.' + kind;
    const line = t(key);
    const node = $('dealer-line');
    if (!node) return;
    node.style.opacity = '0';
    setTimeout(() => {
      node.textContent = line;
      node.style.opacity = '1';
    }, 130);
    const titleQuote = $('title-quote');
    if (titleQuote && !S.dice.length) titleQuote.textContent = '“' + line + '”';
  }

  function renderRelics() {
    const box = $('relic-slots');
    box.innerHTML = '';
    for (let i = 0; i < MAX_RELICS; i++) {
      const relic = S.relics[i];
      if (!relic) {
        box.appendChild(el('div', 'slot empty', ''));
        continue;
      }
      const slot = el('div', 'slot relic-slot rarity-' + relic.rarity);
      slot.dataset.uid = relic.uid;
      slot.appendChild(el('span', 'slot-icon', relic.icon || '◆'));
      slot.appendChild(el('span', 'slot-name', dname(relic)));

      if (relic.condition && relic.condition !== 'always') {
        const met = conditionMet(relic.condition, buildContext(S.selectedHand));
        const dot = el('span', 'slot-condition', met ? '●' : '○');
        slot.appendChild(dot);
        slot.classList.toggle('cond-met', met);
      }

      slot.addEventListener('mouseenter', () => showRelicTooltip(slot, relic));
      slot.addEventListener('mouseleave', hideTooltipSoon);
      box.appendChild(slot);
    }
    $('relic-count').textContent = S.relics.length + ' / ' + MAX_RELICS;
  }

  function renderCharms() {
    const box = $('charm-slots');
    box.innerHTML = '';
    for (let i = 0; i < MAX_CHARMS; i++) {
      const charm = S.charms[i];
      if (!charm) {
        box.appendChild(el('div', 'slot empty', ''));
        continue;
      }
      const slot = el('button', 'slot charm-slot');
      slot.appendChild(el('span', 'slot-icon', charm.icon || '✧'));
      slot.appendChild(el('span', 'slot-name', dname(charm)));
      if (!charmUsable(charm)) slot.classList.add('is-disabled');
      if (S.focusCharm === i) slot.style.borderColor = 'var(--violet)';

      slot.addEventListener('click', () => activateCharm(i));
      slot.addEventListener('mouseenter', () => showCharmTooltip(slot, charm));
      slot.addEventListener('mouseleave', hideTooltipSoon);
      box.appendChild(slot);
    }
    $('charm-count').textContent = S.charms.length + ' / ' + MAX_CHARMS;
  }

  function renderDice() {
    const stage = $('dice-stage');
    stage.innerHTML = '';
    if (!S.dice.length) {
      for (let i = 0; i < DICE_COUNT; i++) {
        stage.appendChild(makeDie(i, 1, false, true));
      }
      return;
    }
    S.dice.forEach((d, i) => {
      stage.appendChild(makeDie(i, d.value, d.held, false));
    });
  }

  function makeDie(index, value, held, idle) {
    const die = el('button', 'die');
    die.dataset.index = index;
    die.setAttribute('data-face', String(value));
    if (held) die.classList.add('held');
    if (idle) die.classList.add('is-idle');
    if (!value) die.classList.add('is-unrolled');

    const inner = el('span', 'die-inner');
    for (let i = 0; i < 9; i++) inner.appendChild(el('i', 'dot'));
    die.appendChild(inner);

    if (held) {
      const label = el('span', 'die-hold', 'HOLD');
      die.appendChild(label);
    }

    if (S.dice[index] && currentCurse() === 'cap_six_to_three' && S.dice[index].value === 6) {
      die.appendChild(el('span', 'die-curse', '→3'));
    }
    if (S.dice[index] && currentCurse() === 'no_even' && S.dice[index].value % 2 === 0) {
      die.classList.add('is-locked');
    }
    if (S.focusCharm >= 0) die.classList.add('is-target');

    die.addEventListener('click', () => onDieClick(index));
    return die;
  }

  function renderHandList() {
    const box = $('hand-list');
    const hint = $('preview-hint');
    if (hint) hint.textContent = S.phase === 'idle' ? t('bd.pick') : t('ui.previewHint');
    box.innerHTML = '';
    if (!S.dice.length) {
      box.appendChild(el('div', 'bd-empty', t('bd.pick')));
      return;
    }

    const scores = {};
    HAND_ORDER.forEach(id => { scores[id] = computeScore(id); });

    let bestId = null;
    let bestTotal = -1;
    HAND_ORDER.forEach(id => {
      if (scores[id] && scores[id].total > bestTotal) { bestTotal = scores[id].total; bestId = id; }
    });

    HAND_ORDER.forEach(id => {
      const hand = handById(id);
      if (!hand) return;
      const bd = scores[id];
      const card = el('button', 'hand-card');
      card.dataset.hand = id;

      const name = el('span', 'hc-name', dname(hand));
      const vals = el('span', 'hc-values');
      const chips = el('em', 'hc-chips', comma(hand.base_chips));
      const x = el('span', '', '×');
      const mult = el('em', 'hc-mult', comma(bd ? bd.baseMult : hand.base_mult));
      vals.appendChild(chips); vals.appendChild(x); vals.appendChild(mult);

      const total = el('span', 'hc-total');
      total.textContent = bd ? comma(bd.total) : '—';

      card.appendChild(name);
      card.appendChild(vals);
      card.appendChild(total);

      if (!bd) {
        card.classList.add('is-locked');
      } else {
        card.classList.add('is-available');
        if (id === S.selectedHand) card.classList.add('is-selected');
        if (id === bestId && id !== S.selectedHand) card.classList.add('is-best');
        card.addEventListener('click', () => {
          if (S.phase !== 'rolled') return;
          if (S.focusCharm >= 0) return;
          S.selectedHand = id;
          sfx('select');
          renderHandList();
          renderBreakdown();
          renderButtons();
          handDiceHighlight(bd.scoringIdx);
        });
      }

      box.appendChild(card);
    });

    if (S.selectedHand && scores[S.selectedHand]) {
      handDiceHighlight(scores[S.selectedHand].scoringIdx);
    }
  }

  function renderBreakdown() {
    const box = $('breakdown');
    const totalNode = $('breakdown-total');
    box.innerHTML = '';
    totalNode.textContent = '';

    if (!S.dice.length) {
      box.appendChild(el('div', 'bd-empty', t('bd.pick')));
      return;
    }
    if (!S.selectedHand) {
      box.appendChild(el('div', 'bd-empty', t('bd.noHand')));
      return;
    }
    const bd = computeScore(S.selectedHand);
    if (!bd) {
      box.appendChild(el('div', 'bd-empty', t('bd.noHand')));
      return;
    }

    const head = el('div', 'bd-hand');
    head.appendChild(el('span', 'bd-hand-name', dname(bd.hand)));
    head.appendChild(el('span', 'bd-hand-chips', comma(bd.baseChips) + ' × ' + comma(bd.baseMult)));
    box.appendChild(head);

    box.appendChild(makeBdRow('chips', t('bd.base'), comma(bd.baseChips)));

    bd.rows.forEach(row => {
      if (row.kind !== 'add_chips') return;
      const rowEl = makeBdRow('chips', (row.relic.icon ? row.relic.icon + ' ' : '') + dname(row.relic),
        row.met ? '+' + comma(row.value) : t('bd.unmet'));
      if (!row.met) rowEl.classList.add('cond-off');
      box.appendChild(rowEl);
    });

    box.appendChild(el('div', 'bd-sep'));

    box.appendChild(makeBdRow('mult', t('bd.baseMult'), comma(bd.baseMult)));

    bd.rows.forEach(row => {
      if (row.kind !== 'add_mult') return;
      const rowEl = makeBdRow('mult', (row.relic.icon ? row.relic.icon + ' ' : '') + dname(row.relic),
        row.met ? '+' + comma(row.value) : t('bd.unmet'));
      if (!row.met) rowEl.classList.add('cond-off');
      box.appendChild(rowEl);
    });

    if (bd.tempMult) {
      box.appendChild(makeBdRow('mult', '🜏 ' + (bd.tempMultLabel || t('bd.charmMult')), '+' + comma(bd.tempMult)));
    }

    bd.rows.forEach(row => {
      if (row.kind !== 'mul_mult') return;
      const rowEl = makeBdRow('mul', (row.relic.icon ? row.relic.icon + ' ' : '') + dname(row.relic),
        row.met ? '×' + row.value : t('bd.unmet'));
      if (!row.met) rowEl.classList.add('cond-off');
      box.appendChild(rowEl);
    });

    bd.curseNotes.forEach(note => {
      const curseName = CURSE_INFO[note.type] ? CURSE_INFO[note.type][S.lang].name : note.text;
      box.appendChild(makeBdRow('curse', curseName, '−1 (min 1)'));
    });

    box.appendChild(el('div', 'bd-sep'));

    const totalRow = el('div', 'bd-total');
    totalRow.appendChild(el('span', '', t('bd.total')));
    totalRow.appendChild(el('b', '', comma(bd.total)));
    box.appendChild(totalRow);
    totalNode.textContent = comma(bd.total);
  }

  function makeBdRow(kind, key, value) {
    const row = el('div', 'bd-row ' + kind);
    row.appendChild(el('span', 'bd-k', key));
    row.appendChild(el('span', 'bd-v', value));
    return row;
  }

  function renderLog() {
    const box = $('log-list');
    box.innerHTML = '';
    if (!S.log.length) {
      box.appendChild(el('div', 'log-empty', '—'));
      return;
    }
    S.log.slice(0, 12).forEach(item => {
      const row = el('div', 'log-row ' + (item.tone || ''));
      row.appendChild(el('span', 'lg-ic', item.icon || '·'));
      row.appendChild(el('span', 'lg-t', item.text));
      if (item.value) row.appendChild(el('span', 'lg-v', item.value));
      box.appendChild(row);
    });
  }

  const LOG_ICONS = {
    roundStart: '☾', score: '✦', clear: '❖', relic: '⚱', charm: '🜏', sell: '↩', curse: '☠', tax: '☠'
  };

  function addLog(kind, text, value, tone) {
    S.log.unshift({ kind: kind, text: text, value: value || '', tone: tone || '', icon: LOG_ICONS[kind] || '·' });
    if (S.log.length > 40) S.log.length = 40;
    renderLog();
  }

  function renderButtons() {
    const rollBtn = $('btn-roll');
    const scoreBtn = $('btn-score');
    const rollLabel = $('btn-roll-label');
    const rollSub = $('btn-roll-sub');
    const scoreLabel = $('btn-score-label');
    const scoreSub = $('btn-score-sub');

    const idle = S.phase === 'idle';
    const busy = !!S.rolling || S.phase === 'scoring';
    const canRoll = idle || (S.phase === 'rolled' && S.rerolls > 0);
    rollBtn.disabled = !canRoll || busy;
    rollLabel.textContent = idle ? t('btn.roll') : t('btn.reroll');
    rollSub.textContent = idle ? 'SPACE' : ('SPACE · ' + Math.max(0, S.rerolls));
    rollBtn.classList.toggle('available', canRoll);

    const canScore = S.phase === 'rolled' && !!S.selectedHand && !!computeScore(S.selectedHand);
    scoreBtn.disabled = !canScore || busy;
    scoreLabel.textContent = canScore ? t('btn.score') : t('btn.scoreIdle');
    scoreSub.textContent = 'ENTER';

    if (S.focusCharm >= 0) {
      rollLabel.textContent = t('btn.reroll');
      rollSub.textContent = 'ESC';
    }
  }

  function renderTableMessage() {
    const node = $('table-message');
    if (!node) return;
    if (S.focusCharm >= 0) {
      node.textContent = t('msg.focusFlip');
      return;
    }
    if (S.phase === 'idle') {
      node.textContent = t('msg.rollFirst');
      return;
    }
    if (S.phase === 'rolled') {
      if (S.hands === 1) node.textContent = t('msg.lastHand');
      else node.textContent = t('msg.handStart', { n: S.handCount || 1 });
      return;
    }
    if (S.phase === 'scoring') { node.textContent = '—'; return; }
    node.textContent = '';
  }

  /* ── 툴팁 ── */

  function positionTooltip(rect) {
    const tt = $('tooltip');
    tt.classList.remove('hidden');
    const pad = 12;
    const w = tt.offsetWidth || 268;
    const h = tt.offsetHeight || 120;
    let left = rect.right + 12;
    if (left + w > window.innerWidth - pad) left = rect.left - w - 12;
    if (left < pad) left = pad;
    let top = rect.top;
    if (top + h > window.innerHeight - pad) top = window.innerHeight - h - pad;
    if (top < pad) top = pad;
    tt.style.left = left + 'px';
    tt.style.top = top + 'px';
  }

  function showRelicTooltip(slot, relic) {
    clearTimeout(tooltipTimer);
    const tt = $('tooltip');
    tt.innerHTML = '';

    const head = el('div', 'tt-head');
    head.appendChild(el('div', 'tt-name', dname(relic)));
    head.appendChild(el('div', 'tt-rarity', RARITY_INFO[relic.rarity] ? RARITY_INFO[relic.rarity][S.lang] : relic.rarity));
    tt.appendChild(head);

    tt.appendChild(el('div', 'tt-desc', ddesc(relic)));

    const meta = el('div', 'tt-meta');
    meta.appendChild(el('span', '', TRIGGER_INFO[relic.trigger] ? TRIGGER_INFO[relic.trigger][S.lang] : relic.trigger));
    meta.appendChild(el('span', '', '◎ ' + relic.cost));
    meta.appendChild(el('span', '', t('ui.sell') + ' ◎ ' + sellPrice(relic)));
    tt.appendChild(meta);

    if (relic.condition && relic.condition !== 'always') {
      const met = conditionMet(relic.condition, buildContext(S.selectedHand));
      const cond = el('div', 'tt-cond ' + (met ? 'met' : 'unmet'), (met ? '● ' : '○ ') + condLabel(relic.condition));
      tt.appendChild(cond);
    }

    const sell = el('button', 'tt-sell', t('ui.sell') + ' (+' + sellPrice(relic) + ' ◎)');
    sell.addEventListener('click', (e) => {
      e.stopPropagation();
      sellRelic(relic.uid);
    });
    tt.appendChild(sell);

    positionTooltip(slot.getBoundingClientRect());
  }

  function showCharmTooltip(slot, charm) {
    clearTimeout(tooltipTimer);
    const tt = $('tooltip');
    tt.innerHTML = '';
    const head = el('div', 'tt-head');
    head.appendChild(el('div', 'tt-name', dname(charm)));
    head.appendChild(el('div', 'tt-rarity', 'CHARM'));
    tt.appendChild(head);
    tt.appendChild(el('div', 'tt-desc', ddesc(charm)));
    const meta = el('div', 'tt-meta');
    meta.appendChild(el('span', '', '◎ ' + charm.cost));
    if (!charmUsable(charm)) meta.appendChild(el('span', '', '· ' + t('toast.diceFirst')));
    tt.appendChild(meta);
    positionTooltip(slot.getBoundingClientRect());
  }

  function hideTooltipSoon() {
    clearTimeout(tooltipTimer);
    tooltipTimer = setTimeout(hideTooltip, 140);
  }

  function hideTooltip() {
    clearTimeout(tooltipTimer);
    const tt = $('tooltip');
    tt.classList.add('hidden');
    tt.innerHTML = '';
  }

  /* ── 토스트/플로터 ── */

  function toast(msg, bad) {
    const node = $('toast');
    node.textContent = msg;
    node.classList.toggle('bad', !!bad);
    node.classList.remove('hidden');
    void node.offsetWidth;
    node.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.classList.add('hidden'), 220);
    }, 1900);
  }

  function floatAt(anchor, text, cls) {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    const layer = $('floaters');
    const f = el('div', 'floater ' + (cls || ''), text);
    f.style.left = (rect.left + rect.width / 2) + 'px';
    f.style.top = (rect.top + rect.height / 2) + 'px';
    layer.appendChild(f);
    setTimeout(() => f.remove(), 1050);
  }

  /* ── 확인 모달 ── */

  let confirmCb = null;

  function askConfirm(text, yesLabel, cb) {
    confirmCb = cb;
    $('confirm-text').textContent = text;
    $('btn-confirm-yes').textContent = yesLabel || 'OK';
    $('modal-confirm').classList.remove('hidden');
  }

  function closeConfirm(ok) {
    $('modal-confirm').classList.add('hidden');
    const cb = confirmCb;
    confirmCb = null;
    if (ok && cb) cb();
  }

  /* ══════════════════════════════ 17. 결과 화면 ══════════════════════════════ */

  function showResult(won) {
    const res = S.lastResult || { won: won, score: S.totalScore, night: S.night, round: S.roundNum, gold: S.gold, isNew: false };
    const modal = document.querySelector('#overlay-result .result-modal');
    modal.classList.toggle('defeat', !won);

    $('result-ornament').textContent = won ? '✦' : '☠';
    $('result-title').textContent = won ? t('result.winTitle') : t('result.loseTitle');
    $('result-sub').textContent = won ? t('result.winSub') : t('result.loseSub');

    const stats = $('result-stats');
    stats.innerHTML = '';
    [
      [t('result.score'), comma(res.score)],
      [t('result.night'), t('hud.night') + ' ' + res.night + ' · ' + res.round + 'R'],
      [t('result.gold'), comma(res.gold)]
    ].forEach(pair => {
      const box = el('div', 'result-stat');
      box.appendChild(el('span', '', pair[0]));
      box.appendChild(el('b', '', pair[1]));
      stats.appendChild(box);
    });

    const best = S.best || loadSave().best;
    let bestText = '';
    if (res.isNew) bestText = t('result.newBest') + '  ';
    if (best) bestText += t('result.best', { score: comma(best.score || 0), night: best.night || 0 });
    $('result-best').textContent = bestText;

    $('overlay-result').classList.remove('hidden');
  }

  /* ══════════════════════════════ 18. 룰북 ══════════════════════════════ */

  function buildRules() {
    const handsBox = $('rules-hands');
    handsBox.innerHTML = '';
    if (DATA) {
      DATA.hands.forEach(hand => {
        const row = el('div', 'rh-row');
        row.appendChild(el('div', 'rh-name', dname(hand)));
        const vals = el('div', 'rh-vals');
        vals.innerHTML = '<b>' + hand.base_chips + '</b> × <i>' + hand.base_mult + '</i>';
        row.appendChild(vals);
        row.appendChild(el('div', 'rh-desc', ddesc(hand)));
        handsBox.appendChild(row);
      });
    }

    const cursesBox = $('rules-curses');
    cursesBox.innerHTML = '';
    CURSE_IDS.forEach(id => {
      const info = CURSE_INFO[id];
      const card = el('div', 'rc-card');
      card.appendChild(el('div', 'rc-name', info[S.lang].name));
      card.appendChild(el('div', 'rc-desc', info[S.lang].desc));
      cursesBox.appendChild(card);
    });

    // 조건 사전
    const condBox = $('rules-conditions');
    if (condBox) {
      condBox.innerHTML = '';
      Object.keys(CONDITION_INFO).forEach(key => {
        const row = el('div', 'bd-row');
        row.appendChild(el('span', 'bd-k', condLabel(key)));
        row.appendChild(el('span', 'bd-v', key));
        condBox.appendChild(row);
      });
    }

    const src = $('rules-source');
    if (src) {
      src.textContent = t('rules.source') + ': ' + (S.dataSource === 'json' ? t('rules.sourceJson') : t('rules.sourceFallback'));
    }
  }

  function openRules() {
    buildRules();
    $('modal-rules').classList.remove('hidden');
    sfx('click');
  }
  function closeRules() { $('modal-rules').classList.add('hidden'); }

  /* ══════════════════════════════ 19. 화면 전환 ══════════════════════════════ */

  function showScreen(name) {
    S.screen = name;
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('is-active'));
    $('screen-' + name).classList.add('is-active');
    if (name === 'title') renderTitleBest();
  }

  function renderTitleBest() {
    const box = $('title-best');
    if (!box) return;
    const best = S.best || loadSave().best;
    box.innerHTML = '';
    if (!best || !best.runs) {
      box.appendChild(el('span', '', t('title.noBest')));
      return;
    }
    box.appendChild(el('span', '', t('title.best', { score: comma(best.score || 0), night: best.night || 0 })));
    box.appendChild(el('span', 'best-dot', '·'));
    box.appendChild(el('span', '', t('title.runs', { runs: best.runs || 0, wins: best.wins || 0 })));
  }

  /* ══════════════════════════════ 20. 정적 텍스트 ══════════════════════════════ */

  function applyI18n() {
    document.documentElement.lang = S.lang;
    document.querySelectorAll('[data-i18n]').forEach(node => {
      const key = node.dataset.i18n;
      const val = t(key);
      if (val != null) node.textContent = val;
    });
    document.title = S.lang === 'ko' ? 'CURSED PAWN — 영혼 전당포' : 'CURSED PAWN — The Soul Pawnshop';
    $('btn-lang').textContent = S.lang === 'ko' ? 'KO' : 'EN';
    $('btn-sound').textContent = S.sound ? '♪' : '✕';
    $('btn-title-lang').textContent = S.lang === 'ko' ? '한국어 / EN' : 'KO / English';
    $('btn-title-sound').textContent = (S.sound ? '♪ ' : '✕ ') + (S.lang === 'ko' ? '사운드' : 'Sound');
  }

  function setLang(lang) {
    S.lang = lang === 'en' ? 'en' : 'ko';
    persistSettings();
    applyI18n();
    buildRules();
    if (S.phase !== 'title') renderAll();
    renderTitleBest();
    if (S.shop) renderShop();
    if (S.lastResult && !$('overlay-result').classList.contains('hidden')) showResult(S.lastResult.won);
  }

  function toggleSound() {
    S.sound = !S.sound;
    if (window.CPSound) window.CPSound.setEnabled(S.sound);
    persistSettings();
    applyI18n();
    if (S.sound) sfx('click');
  }

  /* ══════════════════════════════ 21. 이벤트 ══════════════════════════════ */

  function bindEvents() {
    $('btn-start').addEventListener('click', () => {
      sfx('click');
      showScreen('game');
      startRun();
    });

    $('btn-title-rules').addEventListener('click', openRules);
    $('btn-rules').addEventListener('click', openRules);
    $('btn-close-rules').addEventListener('click', closeRules);
    $('modal-rules').addEventListener('click', (e) => { if (e.target === $('modal-rules')) closeRules(); });

    $('btn-lang').addEventListener('click', () => setLang(S.lang === 'ko' ? 'en' : 'ko'));
    $('btn-title-lang').addEventListener('click', () => setLang(S.lang === 'ko' ? 'en' : 'ko'));
    $('btn-sound').addEventListener('click', toggleSound);
    $('btn-title-sound').addEventListener('click', toggleSound);

    $('btn-roll').addEventListener('click', onRoll);
    $('btn-score').addEventListener('click', doScore);

    $('btn-shop-reroll').addEventListener('click', shopReroll);
    $('btn-next-round').addEventListener('click', () => { sfx('click'); closeShop(); });

    $('btn-restart').addEventListener('click', () => {
      $('overlay-result').classList.add('hidden');
      sfx('click');
      startRun();
    });
    $('btn-result-title').addEventListener('click', () => {
      $('overlay-result').classList.add('hidden');
      showScreen('title');
    });

    $('btn-confirm-yes').addEventListener('click', () => closeConfirm(true));
    $('btn-confirm-no').addEventListener('click', () => closeConfirm(false));
    $('modal-confirm').addEventListener('click', (e) => { if (e.target === $('modal-confirm')) closeConfirm(false); });

    $('score-popup').addEventListener('click', () => { S.skipAnim = true; });

    // 툴팁 위에 마우스가 있으면 닫히지 않게
    $('tooltip').addEventListener('mouseenter', () => clearTimeout(tooltipTimer));
    $('tooltip').addEventListener('mouseleave', hideTooltipSoon);

    // 첫 상호작용에서 오디오 활성화
    const unlock = () => {
      if (window.CPSound) window.CPSound.unlock();
      if (window.CPSound) window.CPSound.setEnabled(S.sound);
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    document.addEventListener('keydown', onKeyDown);

    // hover 사운드 (가벼운 틱)
    document.addEventListener('mouseover', (e) => {
      const btn = e.target.closest && e.target.closest('.btn, .hand-card, .shop-card');
      if (btn && btn !== window.__lastHover) {
        window.__lastHover = btn;
        sfx('hover');
      }
    });
  }

  function onKeyDown(e) {
    const rulesOpen = !$('modal-rules').classList.contains('hidden');
    const confirmOpen = !$('modal-confirm').classList.contains('hidden');
    const shopOpen = !$('overlay-shop').classList.contains('hidden');
    const resultOpen = !$('overlay-result').classList.contains('hidden');

    if (e.key === 'Escape') {
      if (confirmOpen) { closeConfirm(false); return; }
      if (rulesOpen) { closeRules(); return; }
      if (S.focusCharm >= 0) { cancelFocus(); return; }
      return;
    }

    if (rulesOpen || confirmOpen || shopOpen || resultOpen) return;
    if (S.screen !== 'game') return;

    if (e.code === 'Space') {
      e.preventDefault();
      if (S.phase === 'rolled') onRoll();
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (S.phase === 'rolled') doScore();
      return;
    }
    if (e.key >= '1' && e.key <= '5') {
      const i = parseInt(e.key, 10) - 1;
      if (S.dice[i]) onDieClick(i);
      return;
    }
    if (e.key === 'r' || e.key === 'R') { openRules(); return; }
    if (e.key === 'm' || e.key === 'M') { toggleSound(); return; }
    if (e.key === 's' || e.key === 'S') { if (S.skipAnim) return; }
  }

  /* ══════════════════════════════ 22. 부트 ══════════════════════════════ */

  function boot() {
    loadSettings();
    if (window.CPSound) window.CPSound.setEnabled(S.sound);

    loadGameData().then(() => {
      S.meta = DATA.meta;
      applyI18n();
      buildRules();
      bindEvents();
      renderTitleBest();
      renderDice();
      renderAll();
      showScreen('title');

      if (S.dataSource === 'fallback') {
        console.info('[CP] fallback 데이터로 부팅되었습니다.');
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  /* ══════════════════════════════ 23. 디버그/QA API ══════════════════════════════ */

  window.CP = {
    get state() { return S; },
    get data() { return DATA; },
    get rounds() { return ROUNDS; },
    dataSource() { return S.dataSource; },
    evaluate: evaluate,
    computeScore: computeScore,
    conditionMet: conditionMet,
    currentCurse: currentCurse,
    startRun: startRun,
    startRound: startRound,
    startHand: startHand,
    setDice(values) {
      S.dice = values.map(v => ({ value: v, held: false }));
      S.phase = 'rolled';
      S.rolling = false;
      S.handBonus = computeHandBonus();
      S.selectedHand = bestHand();
      renderAll();
      return S.selectedHand;
    },
    setGold(v) { S.gold = v; renderAll(); },
    addRelic(id) {
      const def = relicDefById(id);
      if (!def) return false;
      S.relics.push(Object.assign({}, def, { uid: S.uid++ }));
      renderAll();
      return true;
    },
    addCharm(id) {
      const def = charmDefById(id);
      if (!def) return false;
      S.charms.push(Object.assign({}, def, { uid: S.uid++ }));
      renderAll();
      return true;
    },
    gotoRound(index) {
      S.roundIndex = index;
      startRound();
    },
    roll: onRoll,
    scoreSelected() { doScore(); }
  };

})();
