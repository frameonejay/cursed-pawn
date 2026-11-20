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

  const CURSE_IDS = [
    'no_even', 'minus_reroll', 'cap_six_to_three', 'tax_gold', 'no_pair_bonus',
    'min_hand_three_kind', 'reroll_first_double', 'odd_locked', 'six_blind', 'no_relic_conditions'
  ];

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
    },
    min_hand_three_kind: {
      ko: { name: '값을 매기지 않는 자', desc: '하찮은 담보는 받지 않는다. 트리플 미만의 족보로는 정산할 수 없습니다.' },
      en: { name: 'The Appraiser', desc: 'It refuses worthless collateral. You cannot settle below Three of a Kind.' }
    },
    reroll_first_double: {
      ko: { name: '한 박자 늦은 손', desc: '핸드마다 첫 리롤이 리롤 2회를 소모합니다.' },
      en: { name: 'The Late Hand', desc: 'Each hand, the first reroll costs 2 rerolls.' }
    },
    odd_locked: {
      ko: { name: '홀수의 사냥꾼', desc: '홀수 눈금은 홀드할 수 없습니다.' },
      en: { name: 'The Odd Hunter', desc: 'Odd dice cannot be held.' }
    },
    six_blind: {
      ko: { name: '여섯을 잊은 자', desc: '6 눈금은 조건 판정에서 없는 것으로 취급됩니다.' },
      en: { name: 'The One Who Forgot Six', desc: 'Sixes are treated as absent for condition checks.' }
    },
    no_relic_conditions: {
      ko: { name: '계약 무효', desc: '이번 라운드에는 상시를 제외한 모든 유물 조건이 거짓이 됩니다.' },
      en: { name: 'The Void Clause', desc: 'Every relic condition except Always is false this round.' }
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
    legendary: { ko: '전설', en: 'Legendary' },
    cursed: { ko: '저주', en: 'Cursed' }
  };

  const RARITY_ORDER = ['common', 'uncommon', 'rare', 'legendary', 'cursed'];

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
  const FALLBACK_DATA = {"meta":{"game_title_ko":"CURSED PAWN: 영혼 전당포","game_title_en":"CURSED PAWN","version":"1.2.0","locale_default":"ko","locales":["ko","en"],"design_doc":"docs/GDD.md","designer":"이재근 (기획/밸런스)","updated_at":"2026-11-21","dice_count":5,"max_rerolls_per_hand":2,"relic_slots":6,"charm_slots":3,"start_gold":5,"shop_reroll_cost":3,"shop_relic_offers":3,"shop_charm_offers":2,"score_formula":"(base_chips + sum(relic add_chips)) * (base_mult + sum(relic add_mult)) * product(relic mul_mult)","notes":"condition/effect_type/charm_effect/boss_curse modifier 의 단일 계약은 이 파일의 'schema' 객체다. 일반/정예 라운드의 boss_* 필드는 빈 문자열이며, boss_curses[].modifier 가 엔진이 적용할 규칙이다. gold_over_15 는 기존 엔진에서 >=15 로 구현되어 있고 gold_over_N 정규식은 >N 이므로 신규 데이터는 gold_at_least_N 만 사용한다. ascensions[].active_rules 는 해당 단계에서 누적 적용되는 규칙 목록이다.","content_counts":{"relics":50,"charms":16,"boss_curses":10,"ascensions":6,"achievements":15,"nights":5},"rarity_weights":{"common":50,"uncommon":28,"rare":11,"cursed":6,"legendary":5},"balance_note":"v1.2: A0 완주율 8.8%→20%대. 밤 2·3 목표 −10%, 밤 2·3 보상 +2골드, 시작 골드 4→5."},"hands":[{"id":"high_card","name_ko":"하이카드","name_en":"High Card","base_chips":5,"base_mult":1,"desc_ko":"족보를 이루지 못했을 때, 가장 높은 눈금 하나로 겨우 정산한다.","desc_en":"When nothing else fits, settle with your single highest die."},{"id":"one_pair","name_ko":"원 페어","name_en":"One Pair","base_chips":10,"base_mult":2,"desc_ko":"같은 눈금 2개. 전당포에서 가장 흔한 담보.","desc_en":"Two of a kind — the pawnshop's most common collateral."},{"id":"two_pair","name_ko":"투 페어","name_en":"Two Pair","base_chips":20,"base_mult":2,"desc_ko":"같은 눈금 2쌍. 두 개의 빚을 한 번에 맡긴다.","desc_en":"Two pairs — two debts pledged at once."},{"id":"three_kind","name_ko":"트리플","name_en":"Three of a Kind","base_chips":30,"base_mult":3,"desc_ko":"같은 눈금 3개. 담보의 무게가 세 배로 늘어난다.","desc_en":"Three of a kind — the weight of the pledge triples."},{"id":"small_straight","name_ko":"스몰 스트레이트","name_en":"Small Straight","base_chips":30,"base_mult":4,"desc_ko":"이어진 눈금 4개. 흐름이 끊기지 않으면 이자가 붙는다.","desc_en":"Four dice in sequence. Keep the flow unbroken and interest accrues."},{"id":"large_straight","name_ko":"라지 스트레이트","name_en":"Large Straight","base_chips":40,"base_mult":4,"desc_ko":"이어진 눈금 5개. 완벽한 흐름은 완벽한 담보다.","desc_en":"Five dice in sequence. A perfect run is perfect collateral."},{"id":"full_house","name_ko":"풀 하우스","name_en":"Full House","base_chips":40,"base_mult":4,"desc_ko":"같은 눈금 3개와 2개. 세 식구와 두 식구가 한 지붕 아래 모인다.","desc_en":"Three of a kind plus a pair — three souls and two under one roof."},{"id":"four_kind","name_ko":"포 카드","name_en":"Four of a Kind","base_chips":60,"base_mult":7,"desc_ko":"같은 눈금 4개. 네 번의 맹세, 한 번의 배신.","desc_en":"Four of a kind — four oaths, one betrayal."},{"id":"yahtzee","name_ko":"야찌","name_en":"Yahtzee","base_chips":100,"base_mult":8,"desc_ko":"다섯 개가 모두 같은 눈금. 영혼이 하나로 뭉쳐 터진다.","desc_en":"All five dice match. Five souls fuse and burst."}],"relics":[{"id":"rusty_locket","name_ko":"녹슨 로켓","name_en":"Rusty Locket","rarity":"common","cost":4,"icon":"🪙","trigger":"on_score","effect_type":"add_chips","value":18,"condition":"always","desc_ko":"정산할 때마다 칩 +18.","desc_en":"Whenever you score, +18 Chips.","tags":["chips","always"]},{"id":"cracked_monocle","name_ko":"금 간 단안경","name_en":"Cracked Monocle","rarity":"common","cost":4,"icon":"🔍","trigger":"on_score","effect_type":"add_mult","value":2,"condition":"always","desc_ko":"정산할 때마다 배수 +2.","desc_en":"Whenever you score, +2 Mult.","tags":["mult","always"]},{"id":"bone_die","name_ko":"뼈 주사위","name_en":"Bone Die","rarity":"common","cost":4,"icon":"🦴","trigger":"on_roll","effect_type":"add_chips","value":10,"condition":"always","desc_ko":"핸드를 시작할 때 칩 +10 (핸드당 1회).","desc_en":"At the start of each hand, +10 Chips (once per hand).","tags":["chips","on_roll"]},{"id":"pawn_ticket","name_ko":"전당포 표","name_en":"Pawn Ticket","rarity":"common","cost":4,"icon":"🎫","trigger":"passive","effect_type":"gold_bonus","value":2,"condition":"always","desc_ko":"라운드를 마칠 때마다 골드 +2.","desc_en":"Gain +2 Gold at the end of every round.","tags":["gold","economy"]},{"id":"even_tally","name_ko":"짝수 눈금판","name_en":"Even Tally","rarity":"common","cost":5,"icon":"⚖️","trigger":"on_score","effect_type":"add_chips","value":30,"condition":"even_count","desc_ko":"짝수 눈금이 3개 이상이면 칩 +30.","desc_en":"If you hold 3+ even dice, +30 Chips.","tags":["even","chips"]},{"id":"odd_tally","name_ko":"홀수 눈금판","name_en":"Odd Tally","rarity":"common","cost":5,"icon":"✴️","trigger":"on_score","effect_type":"add_mult","value":4,"condition":"odd_count","desc_ko":"홀수 눈금이 3개 이상이면 배수 +4.","desc_en":"If you hold 3+ odd dice, +4 Mult.","tags":["odd","mult"]},{"id":"ash_ring","name_ko":"재의 반지","name_en":"Ash Ring","rarity":"common","cost":5,"icon":"💍","trigger":"on_score","effect_type":"add_mult","value":3,"condition":"pair_or_better","desc_ko":"원 페어 이상으로 정산하면 배수 +3.","desc_en":"If you score One Pair or better, +3 Mult.","tags":["pair","mult"]},{"id":"iron_nail","name_ko":"무쇠못","name_en":"Iron Nail","rarity":"common","cost":5,"icon":"🔩","trigger":"on_score","effect_type":"add_chips","value":22,"condition":"straight","desc_ko":"스트레이트 계열로 정산하면 칩 +22.","desc_en":"If you score a Straight, +22 Chips.","tags":["straight","chips"]},{"id":"wax_candle","name_ko":"녹아내린 촛농","name_en":"Wax Candle","rarity":"common","cost":4,"icon":"🕯️","trigger":"on_score","effect_type":"add_chips","value":20,"condition":"one_present","desc_ko":"1 눈금이 하나라도 있으면 칩 +20.","desc_en":"If at least one die shows 1, +20 Chips.","tags":["pip1","chips"]},{"id":"mirror_shard","name_ko":"거울 조각","name_en":"Mirror Shard","rarity":"uncommon","cost":6,"icon":"🪞","trigger":"on_score","effect_type":"mul_mult","value":1.15,"condition":"even_count","desc_ko":"짝수 눈금이 3개 이상이면 배수 ×1.15.","desc_en":"If you hold 3+ even dice, ×1.15 Mult.","tags":["even","multiplier"]},{"id":"ashen_scale","name_ko":"잿빛 저울","name_en":"Ashen Scale","rarity":"uncommon","cost":6,"icon":"🧿","trigger":"on_score","effect_type":"mul_mult","value":1.15,"condition":"odd_count","desc_ko":"홀수 눈금이 3개 이상이면 배수 ×1.15.","desc_en":"If you hold 3+ odd dice, ×1.15 Mult.","tags":["odd","multiplier"]},{"id":"chalk_line","name_ko":"분필 선","name_en":"Chalk Line","rarity":"uncommon","cost":6,"icon":"✏️","trigger":"on_score","effect_type":"add_mult","value":6,"condition":"straight","desc_ko":"스트레이트 계열로 정산하면 배수 +6.","desc_en":"If you score a Straight, +6 Mult.","tags":["straight","mult"]},{"id":"blood_ledger","name_ko":"핏빛 장부","name_en":"Blood Ledger","rarity":"uncommon","cost":7,"icon":"📕","trigger":"on_score","effect_type":"add_mult","value":6,"condition":"always","desc_ko":"정산할 때마다 배수 +6.","desc_en":"Whenever you score, +6 Mult.","tags":["mult","always"]},{"id":"loaded_dice","name_ko":"속임수 주사위","name_en":"Loaded Dice","rarity":"uncommon","cost":7,"icon":"🎲","trigger":"passive","effect_type":"extra_reroll","value":1,"condition":"always","desc_ko":"핸드마다 리롤 +1.","desc_en":"+1 Reroll per hand.","tags":["reroll"]},{"id":"six_bell","name_ko":"여섯의 종","name_en":"Six Bell","rarity":"uncommon","cost":7,"icon":"🔔","trigger":"on_score","effect_type":"add_mult","value":7,"condition":"six_present","desc_ko":"6 눈금이 하나라도 있으면 배수 +7.","desc_en":"If any die shows 6, +7 Mult.","tags":["pip6","mult"]},{"id":"last_rites","name_ko":"마지막 예배","name_en":"Last Rites","rarity":"uncommon","cost":8,"icon":"⚰️","trigger":"on_score","effect_type":"mul_mult","value":1.25,"condition":"last_hand","desc_ko":"라운드 마지막 핸드로 정산하면 배수 ×1.25.","desc_en":"On the final hand of the round, ×1.25 Mult.","tags":["last_hand","multiplier"]},{"id":"gilded_grin","name_ko":"도금된 미소","name_en":"Gilded Grin","rarity":"rare","cost":10,"icon":"🎭","trigger":"on_score","effect_type":"mul_mult","value":1.4,"condition":"always","desc_ko":"정산할 때마다 배수 ×1.4.","desc_en":"Whenever you score, ×1.4 Mult.","tags":["multiplier","always"]},{"id":"marble_run","name_ko":"대리석 질주","name_en":"Marble Run","rarity":"rare","cost":9,"icon":"🧱","trigger":"on_score","effect_type":"mul_mult","value":1.3,"condition":"straight","desc_ko":"스트레이트 계열로 정산하면 배수 ×1.3.","desc_en":"If you score a Straight, ×1.3 Mult.","tags":["straight","multiplier"]},{"id":"coin_purse","name_ko":"동전 주머니","name_en":"Coin Purse","rarity":"rare","cost":9,"icon":"💰","trigger":"on_score","effect_type":"mul_mult","value":1.3,"condition":"gold_over_15","desc_ko":"골드가 15 이상이면 배수 ×1.3.","desc_en":"If you hold 15+ Gold, ×1.3 Mult.","tags":["gold","multiplier"]},{"id":"moneylender_eye","name_ko":"전당포 주인장의 눈","name_en":"Pawnbroker's Eye","rarity":"rare","cost":8,"icon":"👁️","trigger":"passive","effect_type":"extra_hand","value":1,"condition":"always","desc_ko":"라운드마다 핸드 +1.","desc_en":"+1 Hand per round.","tags":["hands"]},{"id":"parity_crown","name_ko":"홀짝 왕관","name_en":"Parity Crown","rarity":"rare","cost":9,"icon":"👑","trigger":"on_score","effect_type":"add_mult","value":10,"condition":"even_count","desc_ko":"짝수 눈금이 3개 이상이면 배수 +10.","desc_en":"If you hold 3+ even dice, +10 Mult.","tags":["even","mult"]},{"id":"debtors_hand","name_ko":"채무자의 손","name_en":"Debtor's Hand","rarity":"cursed","cost":3,"icon":"✋","trigger":"on_score","effect_type":"mul_mult","value":1.6,"condition":"six_present","desc_ko":"6 눈금이 하나라도 있으면 배수 ×1.6. 6이 없으면 아무 일도 없다.","desc_en":"If any die shows 6, ×1.6 Mult. Does nothing without a 6.","tags":["pip6","multiplier","cursed"]},{"id":"hungry_maw","name_ko":"굶주린 아귀","name_en":"Hungry Maw","rarity":"cursed","cost":3,"icon":"👄","trigger":"on_score","effect_type":"add_mult","value":14,"condition":"last_hand","desc_ko":"라운드 마지막 핸드로 정산하면 배수 +14. 그 전 핸드는 아무 일도 없다.","desc_en":"On the final hand of the round, +14 Mult. Silent on any earlier hand.","tags":["last_hand","mult","cursed"]},{"id":"black_mirror","name_ko":"검은 거울","name_en":"Black Mirror","rarity":"cursed","cost":3,"icon":"⬛","trigger":"on_score","effect_type":"mul_mult","value":1.45,"condition":"odd_count","desc_ko":"홀수 눈금이 3개 이상이면 배수 ×1.45. 짝수 위주의 판을 스스로 뒤집어야 한다.","desc_en":"If you hold 3+ odd dice, ×1.45 Mult. You must turn an even-heavy board over.","tags":["odd","multiplier","cursed"]},{"id":"twin_lamp","name_ko":"두 갈래 등잔","name_en":"Twin Lamp","rarity":"common","cost":4,"icon":"🪔","trigger":"on_score","effect_type":"add_chips","value":20,"condition":"two_present","desc_ko":"2 눈금이 하나라도 있으면 칩 +20.","desc_en":"If any die shows 2, +20 Chips.","tags":["pip2","chips"]},{"id":"three_tooth","name_ko":"세 이빨 빗","name_en":"Three-Tooth Comb","rarity":"common","cost":4,"icon":"🦷","trigger":"on_score","effect_type":"add_mult","value":4,"condition":"three_present","desc_ko":"3 눈금이 하나라도 있으면 배수 +4.","desc_en":"If any die shows 3, +4 Mult.","tags":["pip3","mult"]},{"id":"four_leaf","name_ko":"네 잎 부적","name_en":"Four-Leaf Charm","rarity":"common","cost":4,"icon":"🍀","trigger":"on_score","effect_type":"add_chips","value":24,"condition":"four_present","desc_ko":"4 눈금이 하나라도 있으면 칩 +24.","desc_en":"If any die shows 4, +24 Chips.","tags":["pip4","chips"]},{"id":"five_link","name_ko":"다섯 고리 사슬","name_en":"Five-Link Chain","rarity":"common","cost":5,"icon":"⛓️","trigger":"on_score","effect_type":"add_mult","value":4,"condition":"five_present","desc_ko":"5 눈금이 하나라도 있으면 배수 +4.","desc_en":"If any die shows 5, +4 Mult.","tags":["pip5","mult"]},{"id":"halfpenny_tally","name_ko":"반 푼 눈금판","name_en":"Halfpenny Tally","rarity":"common","cost":5,"icon":"🔻","trigger":"on_score","effect_type":"add_chips","value":34,"condition":"sum_at_most_15","desc_ko":"주사위 눈금의 합이 15 이하이면 칩 +34.","desc_en":"If the five dice total 15 or less, +34 Chips.","tags":["lowpip","chips"]},{"id":"third_six","name_ko":"세 번째 여섯","name_en":"Third Six","rarity":"common","cost":5,"icon":"🎯","trigger":"on_score","effect_type":"add_chips","value":70,"condition":"six_count_2","desc_ko":"6 눈금이 2개 이상이면 칩 +70.","desc_en":"If you hold 2+ sixes, +70 Chips.","tags":["pip6","chips","burst"]},{"id":"parity_lens","name_ko":"홀짝 렌즈","name_en":"Parity Lens","rarity":"uncommon","cost":6,"icon":"🔎","trigger":"on_score","effect_type":"add_chips","value":75,"condition":"even_count_4","desc_ko":"짝수 눈금이 4개 이상이면 칩 +75.","desc_en":"If you hold 4+ even dice, +75 Chips.","tags":["even","chips"]},{"id":"odd_magnet","name_ko":"홀수 자석","name_en":"Odd Magnet","rarity":"uncommon","cost":6,"icon":"🧲","trigger":"on_score","effect_type":"add_mult","value":9,"condition":"odd_count_4","desc_ko":"홀수 눈금이 4개 이상이면 배수 +9.","desc_en":"If you hold 4+ odd dice, +9 Mult.","tags":["odd","mult"]},{"id":"house_key","name_ko":"집의 열쇠","name_en":"House Key","rarity":"uncommon","cost":7,"icon":"🗝️","trigger":"on_score","effect_type":"mul_mult","value":1.25,"condition":"full_house_or_better","desc_ko":"풀 하우스 이상으로 정산하면 배수 ×1.25.","desc_en":"If you score Full House or better, ×1.25 Mult.","tags":["full_house","multiplier"]},{"id":"quad_chain","name_ko":"네 고리 사슬","name_en":"Quad Chain","rarity":"uncommon","cost":8,"icon":"🔗","trigger":"on_score","effect_type":"add_mult","value":30,"condition":"four_kind_or_better","desc_ko":"포 카드 이상으로 정산하면 배수 +30.","desc_en":"If you score Four of a Kind or better, +30 Mult.","tags":["four_kind","mult","burst"]},{"id":"reroll_whisper","name_ko":"리롤의 속삭임","name_en":"Reroll Whisper","rarity":"uncommon","cost":7,"icon":"💨","trigger":"on_score","effect_type":"add_chips_per_reroll","value":18,"scale":1,"condition":"always","desc_ko":"이번 핸드의 리롤 허용량 1회마다 칩 +18.","desc_en":"+18 Chips for each reroll allowed this hand.","tags":["reroll","chips"]},{"id":"lantern_of_hands","name_ko":"남은 손의 등불","name_en":"Lantern of Hands","rarity":"uncommon","cost":7,"icon":"🏮","trigger":"on_score","effect_type":"add_mult_per_hands_left","value":3,"scale":1,"condition":"always","desc_ko":"정산 시 남은 핸드 1회마다 배수 +3.","desc_en":"+3 Mult for each hand still remaining when you settle.","tags":["hands","mult"]},{"id":"small_purse","name_ko":"작은 주머니","name_en":"Small Purse","rarity":"uncommon","cost":6,"icon":"👝","trigger":"on_score","effect_type":"add_chips_per_gold","value":8,"scale":5,"condition":"always","desc_ko":"보유 골드 5당 칩 +8.","desc_en":"+8 Chips for every 5 Gold you hold.","tags":["gold","chips"]},{"id":"long_road","name_ko":"긴 길","name_en":"Long Road","rarity":"rare","cost":9,"icon":"🛣️","trigger":"on_score","effect_type":"mul_mult","value":1.55,"condition":"large_straight","desc_ko":"라지 스트레이트로 정산하면 배수 ×1.55.","desc_en":"If you score a Large Straight, ×1.55 Mult.","tags":["straight","multiplier"]},{"id":"yahtzee_shrine","name_ko":"야찌 신전","name_en":"Yahtzee Shrine","rarity":"rare","cost":11,"icon":"🛕","trigger":"on_score","effect_type":"mul_mult","value":2.5,"condition":"yahtzee_or_better","desc_ko":"야찌로 정산하면 배수 ×2.5.","desc_en":"If you score Yahtzee, ×2.5 Mult.","tags":["yahtzee","multiplier","burst"]},{"id":"charm_tithe","name_ko":"부적 십일조","name_en":"Charm Tithe","rarity":"rare","cost":8,"icon":"📿","trigger":"on_score","effect_type":"add_mult_per_charm","value":5,"scale":1,"condition":"always","desc_ko":"보유 부적 1개마다 배수 +5.","desc_en":"+5 Mult for each Charm you hold.","tags":["charm","mult"]},{"id":"interest_book","name_ko":"이자 장부","name_en":"Interest Book","rarity":"rare","cost":9,"icon":"📒","trigger":"passive","effect_type":"interest_gold","value":1,"scale":10,"condition":"always","desc_ko":"라운드를 마칠 때 보유 골드 10당 골드 +1.","desc_en":"At the end of each round, +1 Gold for every 10 Gold held.","tags":["gold","economy"]},{"id":"haggler_bill","name_ko":"흥정꾼의 계산서","name_en":"Haggler's Bill","rarity":"rare","cost":8,"icon":"🧾","trigger":"passive","effect_type":"shop_discount","value":25,"condition":"always","desc_ko":"상점의 유물·부적 가격이 25% 싸진다.","desc_en":"Relics and Charms cost 25% less in the shop.","tags":["economy","shop"]},{"id":"curse_bell","name_ko":"저주 종","name_en":"Curse Bell","rarity":"rare","cost":9,"icon":"🪬","trigger":"on_score","effect_type":"add_mult","value":12,"condition":"boss_round","desc_ko":"보스 라운드에서만 배수 +12.","desc_en":"During boss rounds only, +12 Mult.","tags":["boss","mult"]},{"id":"heavy_pip_stone","name_ko":"무거운 눈금비","name_en":"Heavy Pip Stone","rarity":"rare","cost":9,"icon":"🪦","trigger":"on_score","effect_type":"add_chips","value":110,"condition":"sum_at_least_22","desc_ko":"주사위 눈금의 합이 22 이상이면 칩 +110.","desc_en":"If the five dice total 22 or more, +110 Chips.","tags":["highpip","chips"]},{"id":"gallows_die","name_ko":"교수대 주사위","name_en":"Gallows Die","rarity":"cursed","cost":3,"icon":"💀","trigger":"on_score","effect_type":"mul_mult","value":1.7,"condition":"three_kind_or_better","desc_ko":"트리플 이상으로 정산하면 배수 ×1.7. 원 페어 이하는 아무 일도 없다.","desc_en":"If you score Three of a Kind or better, ×1.7 Mult. Silent below that.","tags":["highhand","multiplier","cursed"]},{"id":"ashen_loan","name_ko":"잿더미 대출","name_en":"Ashen Loan","rarity":"cursed","cost":3,"icon":"🔥","trigger":"on_score","effect_type":"add_chips","value":90,"condition":"sum_at_most_14","desc_ko":"주사위 눈금의 합이 14 이하일 때만 칩 +90. 높은 눈금을 버려야 하는 도박.","desc_en":"Only if the five dice total 14 or less, +90 Chips. A gamble that demands low pips.","tags":["lowpip","chips","cursed"]},{"id":"the_house_always_wins","name_ko":"전당포는 언제나 이긴다","name_en":"The House Always Wins","rarity":"legendary","cost":14,"icon":"🏛️","trigger":"on_score","effect_type":"mul_mult","value":1.8,"condition":"always","desc_ko":"정산할 때마다 배수 ×1.8. 전당포의 마지막 규칙.","desc_en":"Whenever you score, ×1.8 Mult. The pawnshop's final rule.","tags":["multiplier","legendary"]},{"id":"eternal_ledger","name_ko":"영원한 영혼 장부","name_en":"Eternal Soul Ledger","rarity":"legendary","cost":15,"icon":"📖","trigger":"on_score","effect_type":"mul_mult","value":1.65,"condition":"boss_round","desc_ko":"보스 라운드에서 정산할 때마다 배수 ×1.65.","desc_en":"During boss rounds, ×1.65 Mult on every score.","tags":["boss","multiplier","legendary"]},{"id":"grand_pawn","name_ko":"위대한 담보","name_en":"Grand Pawn","rarity":"legendary","cost":13,"icon":"🗿","trigger":"on_score","effect_type":"add_chips","value":140,"condition":"always","desc_ko":"정산할 때마다 칩 +140.","desc_en":"Whenever you score, +140 Chips.","tags":["chips","legendary"]},{"id":"soul_auctioneer","name_ko":"경매사의 지팡이","name_en":"Auctioneer's Wand","rarity":"legendary","cost":12,"icon":"🪄","trigger":"on_score","effect_type":"mul_mult","value":1.5,"condition":"gold_at_least_30","desc_ko":"골드가 30 이상이면 배수 ×1.5. 부를 쌓는 자만이 휘두를 수 있다.","desc_en":"If you hold 30+ Gold, ×1.5 Mult. Only the wealthy may wield it.","tags":["gold","multiplier","legendary"]}],"charms":[{"id":"lucky_ash","name_ko":"행운의 재","name_en":"Lucky Ash","cost":4,"icon":"🍀","effect_type":"all_plus_one","value":1,"desc_ko":"이번 라운드 동안 모든 주사위 눈금 +1 (최대 6).","desc_en":"For this round, every die shows +1 (max 6).","scale":1},{"id":"second_wind","name_ko":"두 번째 숨결","name_en":"Second Wind","cost":4,"icon":"🌬️","effect_type":"reroll_plus","value":1,"desc_ko":"이번 라운드 리롤 +1.","desc_en":"+1 Reroll for this round.","scale":1},{"id":"cracked_compass","name_ko":"금 간 나침반","name_en":"Cracked Compass","cost":6,"icon":"🧭","effect_type":"reroll_plus","value":2,"desc_ko":"이번 라운드 리롤 +2.","desc_en":"+2 Rerolls for this round.","scale":1},{"id":"extra_palm","name_ko":"여분의 손바닥","name_en":"Extra Palm","cost":6,"icon":"🖐️","effect_type":"hand_plus","value":1,"desc_ko":"이번 라운드 핸드 +1.","desc_en":"+1 Hand for this round.","scale":1},{"id":"crooked_coin","name_ko":"휘어진 동전","name_en":"Crooked Coin","cost":3,"icon":"🌀","effect_type":"flip_dice","value":1,"desc_ko":"선택한 주사위 1개를 반대 면으로 뒤집는다 (1↔6, 2↔5, 3↔4).","desc_en":"Flip one chosen die to its opposite face (1↔6, 2↔5, 3↔4).","scale":1},{"id":"soul_flask","name_ko":"영혼 플라스크","name_en":"Soul Flask","cost":5,"icon":"🧪","effect_type":"temp_mult","value":5,"desc_ko":"이번 핸드 정산 배수 +5.","desc_en":"+5 Mult on this hand's score.","scale":1},{"id":"blood_vial","name_ko":"핏빛 시약","name_en":"Blood Vial","cost":8,"icon":"🩸","effect_type":"temp_mult","value":12,"desc_ko":"이번 핸드 정산 배수 +12. 마지막 한 수를 위한 값비싼 도박.","desc_en":"+12 Mult on this hand's score. An expensive gamble for the last push.","scale":1},{"id":"debt_script","name_ko":"채무 증서","name_en":"Debt Script","cost":5,"icon":"📜","effect_type":"gold_gain","value":8,"desc_ko":"즉시 골드 +8 (구매가 5골드, 순이익 3골드).","desc_en":"Gain +8 Gold immediately (costs 5, net +3).","scale":1},{"id":"bone_pin","name_ko":"뼈 못","name_en":"Bone Pin","cost":4,"icon":"📌","effect_type":"hold_dice","value":1,"desc_ko":"선택한 주사위 1개를 못 박아 잠근다. 이번 핸드 동안 리롤되지 않는다.","desc_en":"Pin one chosen die. It cannot be rerolled for the rest of this hand."},{"id":"six_seal","name_ko":"여섯의 봉인","name_en":"Seal of Six","cost":6,"icon":"🔯","effect_type":"set_pip","value":6,"desc_ko":"선택한 주사위 1개의 눈금을 6으로 바꾼다.","desc_en":"Change one chosen die to a 6."},{"id":"ash_bandage","name_ko":"재 붕대","name_en":"Ash Bandage","cost":4,"icon":"🩹","effect_type":"temp_chips","value":60,"desc_ko":"이번 핸드 정산 칩 +60.","desc_en":"+60 Chips on this hand's score."},{"id":"pin_cushion","name_ko":"바늘 쿠션","name_en":"Pin Cushion","cost":7,"icon":"🧷","effect_type":"temp_chips","value":120,"desc_ko":"이번 핸드 정산 칩 +120. 마지막 한 수를 위한 담보.","desc_en":"+120 Chips on this hand's score. Collateral for the final push."},{"id":"parity_draught","name_ko":"홀짝 물약","name_en":"Parity Draught","cost":5,"icon":"⚗️","effect_type":"parity_shift","value":1,"desc_ko":"모든 홀수 눈금을 +1 한다(6은 그대로). 판을 짝수로 뒤집는다.","desc_en":"Add +1 to every odd die (6 stays 6). Flip the table toward even."},{"id":"grave_water","name_ko":"무덤의 물","name_en":"Grave Water","cost":7,"icon":"🫙","effect_type":"curse_soften","value":1,"desc_ko":"이번 라운드 보스 저주의 강도를 절반으로 줄인다(내림).","desc_en":"Halve this round's boss curse severity (rounded down)."},{"id":"iron_contract","name_ko":"무쇠 계약서","name_en":"Iron Contract","cost":9,"icon":"🛡️","effect_type":"curse_nullify","value":1,"desc_ko":"이번 라운드 보스 저주를 완전히 무효화한다.","desc_en":"Nullify this round's boss curse entirely."},{"id":"haggler_token","name_ko":"흥정 표","name_en":"Haggler's Token","cost":3,"icon":"🎟️","effect_type":"shop_free_reroll","value":1,"desc_ko":"상점 진열 교체를 1회 무료로 한다.","desc_en":"One free shop stock refresh."}],"nights":[{"night":1,"name_ko":"첫 번째 밤 — 닫히지 않는 문","name_en":"Night 1 — The Door That Won't Close","rounds":[{"round":1,"type":"normal","target_score":150,"reward_gold":3,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":400,"reward_gold":4,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":330,"reward_gold":5,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"minus_reroll","boss_name_ko":"박자 없는 종","boss_desc_ko":"종소리가 한 박자 늦게 울린다. 이 라운드에는 리롤이 1회뿐이다.","boss_name_en":"The Out-of-Tune Bell","boss_desc_en":"The bell rings a beat late. You get only 1 Reroll this round."}]},{"night":2,"name_ko":"두 번째 밤 — 영혼세","name_en":"Night 2 — The Soul Tax","rounds":[{"round":1,"type":"normal","target_score":1260,"reward_gold":6,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":1530,"reward_gold":7,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":1170,"reward_gold":8,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"tax_gold","boss_name_ko":"영혼세 징수관","boss_desc_ko":"정산이 끝나면 골드 3을 압수한다. 빚은 점수로도 골드로도 갚아야 한다.","boss_name_en":"Soul-Tax Collector","boss_desc_en":"When the round settles, 3 Gold is seized. Debts are paid in score and in coin."}]},{"night":3,"name_ko":"세 번째 밤 — 눈금 도둑","name_en":"Night 3 — The Pip Thief","rounds":[{"round":1,"type":"normal","target_score":2610,"reward_gold":8,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":2790,"reward_gold":9,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":2700,"reward_gold":10,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"cap_six_to_three","boss_name_ko":"눈금 도둑","boss_desc_ko":"6 눈금을 훔쳐 3으로 바꿔 놓는다. 여섯을 노리던 판이 무너진다.","boss_name_en":"The Pip Thief","boss_desc_en":"Every 6 is stolen and turned into a 3. Plans built on sixes collapse."}]},{"night":4,"name_ko":"네 번째 밤 — 쌍둥이 사기꾼","name_en":"Night 4 — The Twin Cheats","rounds":[{"round":1,"type":"normal","target_score":4100,"reward_gold":8,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":4400,"reward_gold":9,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":3400,"reward_gold":10,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"no_pair_bonus","boss_name_ko":"쌍둥이 사기꾼","boss_desc_ko":"같은 눈금을 맞춰도 배수가 붙지 않는다. 페어 계열 족보의 기본 배수가 1 줄어든다(최소 1).","boss_name_en":"The Twin Cheats","boss_desc_en":"Matching pips earn no bonus: pair-type hands lose 1 base Mult (minimum 1)."}]},{"night":5,"name_ko":"다섯 번째 밤 — 무덤의 주인","name_en":"Night 5 — The Gravekeeper","rounds":[{"round":1,"type":"normal","target_score":4900,"reward_gold":10,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":2,"type":"elite","target_score":5200,"reward_gold":12,"hands_allowed":4,"rerolls_per_hand":2,"boss_curse_id":null,"boss_name_ko":"","boss_desc_ko":"","boss_name_en":"","boss_desc_en":""},{"round":3,"type":"boss","target_score":6000,"reward_gold":14,"hands_allowed":3,"rerolls_per_hand":2,"boss_curse_id":"no_even","boss_name_ko":"무덤의 주인","boss_desc_ko":"무덤은 짝수를 삼킨다. 짝수 눈금 주사위는 홀드할 수 없다.","boss_name_en":"The Gravekeeper","boss_desc_en":"The grave swallows even numbers. You cannot hold dice showing an even face."}]}],"boss_curses":[{"id":"minus_reroll","scope":"night","name_ko":"박자 없는 종","name_en":"The Out-of-Tune Bell","desc_ko":"종소리가 한 박자 늦게 울린다. 이 라운드에는 리롤이 1회뿐이다.","desc_en":"The bell rings a beat late. You get only 1 Reroll this round.","modifier":{"reroll_delta":-1}},{"id":"tax_gold","scope":"night","name_ko":"영혼세 징수관","name_en":"Soul-Tax Collector","desc_ko":"정산이 끝나면 골드 3을 압수한다. 빚은 점수로도 골드로도 갚아야 한다.","desc_en":"When the round settles, 3 Gold is seized. Debts are paid in score and in coin.","modifier":{"gold_tax_on_clear":3}},{"id":"cap_six_to_three","scope":"night","name_ko":"눈금 도둑","name_en":"The Pip Thief","desc_ko":"6 눈금을 훔쳐 3으로 바꿔 놓는다. 여섯을 노리던 판이 무너진다.","desc_en":"Every 6 is stolen and turned into a 3. Plans built on sixes collapse.","modifier":{"pip_map":{"6":3}}},{"id":"no_pair_bonus","scope":"night","name_ko":"쌍둥이 사기꾼","name_en":"The Twin Cheats","desc_ko":"같은 눈금을 맞춰도 배수가 붙지 않는다. 페어 계열 족보의 기본 배수가 1 줄어든다(최소 1).","desc_en":"Matching pips earn no bonus: pair-type hands lose 1 base Mult (minimum 1).","modifier":{"pair_mult_delta":-1}},{"id":"no_even","scope":"night","name_ko":"무덤의 주인","name_en":"The Gravekeeper","desc_ko":"무덤은 짝수를 삼킨다. 짝수 눈금 주사위는 홀드할 수 없다.","desc_en":"The grave swallows even numbers. You cannot hold dice showing an even face.","modifier":{"hold_block":"even"}},{"id":"min_hand_three_kind","scope":"endless","name_ko":"값을 매기지 않는 자","name_en":"The Appraiser","desc_ko":"하찮은 담보는 받지 않는다. 트리플 미만의 족보로는 정산할 수 없다.","desc_en":"It refuses worthless collateral. You cannot settle with anything below Three of a Kind.","modifier":{"min_hand_rank":3}},{"id":"reroll_first_double","scope":"endless","name_ko":"한 박자 늦은 손","name_en":"The Late Hand","desc_ko":"핸드마다 첫 리롤이 리롤 2회를 소모한다. 서두르면 손이 늦는다.","desc_en":"Each hand, the first reroll costs 2 rerolls. Hurry and your hand arrives late.","modifier":{"first_reroll_cost":2}},{"id":"odd_locked","scope":"endless","name_ko":"홀수의 사냥꾼","name_en":"The Odd Hunter","desc_ko":"홀수 눈금은 홀드할 수 없다. 홀수로 쌓아 올린 판이 흔들린다.","desc_en":"Odd dice cannot be held. Boards stacked on odd pips start to shake.","modifier":{"hold_block":"odd"}},{"id":"six_blind","scope":"endless","name_ko":"여섯을 잊은 자","name_en":"The One Who Forgot Six","desc_ko":"6 눈금은 조건 판정에서 없는 것으로 취급된다. 여섯을 세는 유물이 모두 꺼진다.","desc_en":"Sixes are treated as absent for condition checks. Every relic that counts sixes goes dark.","modifier":{"condition_pip_void":6}},{"id":"no_relic_conditions","scope":"endless","name_ko":"계약 무효","name_en":"The Void Clause","desc_ko":"이번 라운드에는 유물의 조건이 모두 거짓이 된다(상시 조건 제외). 조건에 기댄 빌드가 멈춘다.","desc_en":"This round every relic condition evaluates false (except Always). Builds that lean on conditions stall.","modifier":{"disable_conditions":true}}],"ascensions":[{"level":0,"name_ko":"맨몸의 계약","name_en":"Bare Contract","desc_ko":"기본 규칙. 목표 점수와 시작 자금에 어떤 보정도 없다.","desc_en":"The base rules. No modifier to target scores or starting gold.","target_mult":1.0,"start_gold_delta":0,"shop_cost_delta":0,"extra_curse_rule":null,"active_rules":[]},{"level":1,"name_ko":"이자 붙은 계약","name_en":"Contract with Interest","desc_ko":"목표 점수 +2%. 같은 빚을 조금 더 비싸게 갚는다.","desc_en":"+2% target scores. The same debt costs a little more.","target_mult":1.02,"start_gold_delta":0,"shop_cost_delta":0,"extra_curse_rule":null,"active_rules":[]},{"level":2,"name_ko":"겹친 장부","name_en":"Doubled Ledger","desc_ko":"목표 점수 +4%. 장부의 숫자가 한 줄 더 얹힌다.","desc_en":"+4% target scores. One more line is added to the ledger.","target_mult":1.04,"start_gold_delta":0,"shop_cost_delta":0,"extra_curse_rule":null,"active_rules":[]},{"level":3,"name_ko":"박자 없는 밤","name_en":"The Out-of-Tune Night","desc_ko":"목표 점수 +6%, 밤 3부터 보스 라운드 리롤 −1. 밤의 마지막 손이 짧아진다.","desc_en":"+6% target scores, −1 Reroll in boss rounds from Night 3. The night's last hand gets shorter.","target_mult":1.06,"start_gold_delta":0,"shop_cost_delta":0,"extra_curse_rule":{"type":"reroll_penalty","value":1,"scope":"boss","min_night":3},"active_rules":[{"type":"reroll_penalty","value":1,"scope":"boss","min_night":3}]},{"level":4,"name_ko":"긴 밤","name_en":"The Long Night","desc_ko":"목표 점수 +8%, 밤 3부터 보스 리롤 −1, 밤 2부터 정예 리롤 −1. 숨 돌릴 구간이 사라진다.","desc_en":"+8% target scores, −1 Reroll in boss rounds from Night 3 and in elite rounds from Night 2. No breathing room.","target_mult":1.08,"start_gold_delta":0,"shop_cost_delta":0,"extra_curse_rule":{"type":"reroll_penalty","value":1,"scope":"elite","min_night":2},"active_rules":[{"type":"reroll_penalty","value":1,"scope":"boss","min_night":3},{"type":"reroll_penalty","value":1,"scope":"elite","min_night":2}]},{"level":5,"name_ko":"마지막 계약","name_en":"The Final Contract","desc_ko":"목표 점수 +10%, 보스·정예 리롤 −1, 그리고 마지막 밤의 보스는 저주를 두 개 겹쳐 건다. 이 계약을 갱신하면 아무도 남지 않는다.","desc_en":"+10% target scores, −1 Reroll in boss and elite rounds, and the final night's boss carries two curses. No one renews this contract.","target_mult":1.1,"start_gold_delta":0,"shop_cost_delta":0,"extra_curse_rule":{"type":"extra_boss_curse","value":1,"min_night":5,"pool":["six_blind","odd_locked"]},"active_rules":[{"type":"reroll_penalty","value":1,"scope":"boss","min_night":3},{"type":"reroll_penalty","value":1,"scope":"elite","min_night":2},{"type":"extra_boss_curse","value":1,"min_night":5,"pool":["six_blind","odd_locked"]}]}],"achievements":[{"id":"first_contract","icon":"🖋️","name_ko":"첫 계약 갱신","name_en":"First Renewal","desc_ko":"다섯 밤을 모두 버티고 승리한다.","desc_en":"Survive all five nights and win.","condition_type":"wins","target_value":1,"scope":"meta"},{"id":"yahtzee_roll","icon":"🎲","name_ko":"다섯 개의 맹세","name_en":"Five Oaths","desc_ko":"야찌를 한 번 이상 정산한다.","desc_en":"Settle a Yahtzee at least once.","condition_type":"yahtzee_scored","target_value":1,"scope":"run"},{"id":"hand_5000","icon":"🔥","name_ko":"한 수의 폭발","name_en":"One-Hand Blast","desc_ko":"한 핸드로 5,000점 이상을 낸다.","desc_en":"Score 5,000+ in a single hand.","condition_type":"single_hand_score","target_value":5000,"scope":"run"},{"id":"hand_20000","icon":"💥","name_ko":"전당포가 흔들린 밤","name_en":"The Night the Shop Shook","desc_ko":"한 핸드로 20,000점 이상을 낸다.","desc_en":"Score 20,000+ in a single hand.","condition_type":"single_hand_score","target_value":20000,"scope":"run"},{"id":"ascension_3","icon":"🕯️","name_ko":"세 번째 계약","name_en":"Third Contract","desc_ko":"승천 3단계 이상에서 승리한다.","desc_en":"Win at Ascension 3 or higher.","condition_type":"ascension_clear","target_value":3,"scope":"run"},{"id":"ascension_5","icon":"⛓️","name_ko":"마지막 계약자","name_en":"The Last Contractor","desc_ko":"승천 5단계에서 승리한다.","desc_en":"Win at Ascension 5.","condition_type":"ascension_clear","target_value":5,"scope":"run"},{"id":"relic_30","icon":"⚱️","name_ko":"수집가의 다락","name_en":"Collector's Loft","desc_ko":"한 계정에서 서로 다른 유물 30종을 보유한 기록을 만든다.","desc_en":"Own 30 different relics across runs.","condition_type":"relic_collection","target_value":30,"scope":"meta"},{"id":"no_reroll_boss","icon":"🎯","name_ko":"리롤 없는 밤","name_en":"A Night Without Rerolls","desc_ko":"리롤을 한 번도 쓰지 않고 보스 라운드를 클리어한다.","desc_en":"Clear a boss round without using a single reroll.","condition_type":"boss_clear_no_reroll","target_value":1,"scope":"run"},{"id":"zero_gold_win","icon":"🕳️","name_ko":"빚더미의 승리","name_en":"Victory in Debt","desc_ko":"골드 0 상태로 밤을 넘긴다.","desc_en":"Finish a night holding 0 Gold.","condition_type":"win_with_zero_gold","target_value":1,"scope":"run"},{"id":"endless_8","icon":"🌑","name_ko":"여덟 번째 밤","name_en":"The Eighth Night","desc_ko":"엔드리스에서 밤 8에 도달한다.","desc_en":"Reach night 8 in Endless mode.","condition_type":"endless_night","target_value":8,"scope":"run"},{"id":"endless_12","icon":"🌌","name_ko":"끝나지 않는 계약","name_en":"The Endless Contract","desc_ko":"엔드리스에서 밤 12에 도달한다.","desc_en":"Reach night 12 in Endless mode.","condition_type":"endless_night","target_value":12,"scope":"run"},{"id":"boss_hands_left","icon":"🏮","name_ko":"두 손이 남은 채로","name_en":"With Two Hands to Spare","desc_ko":"핸드 2회 이상을 남기고 보스 라운드를 클리어한다.","desc_en":"Clear a boss round with 2+ hands remaining.","condition_type":"boss_clear_hands_left","target_value":2,"scope":"run"},{"id":"curse_nullified","icon":"🛡️","name_ko":"계약 무효","name_en":"Void Clause","desc_ko":"보스 저주를 부적으로 3회 무효화한다.","desc_en":"Nullify a boss curse with a charm 3 times.","condition_type":"curse_nullified","target_value":3,"scope":"run"},{"id":"legendary_pair","icon":"🏛️","name_ko":"전당포의 두 기둥","name_en":"Two Pillars of the Shop","desc_ko":"전설 유물 2개를 보유한 채 라운드를 클리어한다.","desc_en":"Clear a round while holding 2 legendary relics.","condition_type":"legendary_held","target_value":2,"scope":"run"},{"id":"total_100k","icon":"📚","name_ko":"백만 냥의 장부","name_en":"A Ledger of a Hundred Thousand","desc_ko":"한 판에서 누적 100,000점을 넘긴다.","desc_en":"Reach 100,000 total score in a single run.","condition_type":"total_score","target_value":100000,"scope":"run"}],"endless":{"enabled":true,"start_night":6,"rounds_per_night":3,"hands_allowed":3,"rerolls_per_hand":2,"reward_gold_base":14,"reward_gold_growth":2,"base_target":6500,"target_growth_per_night":1.28,"round_type_target_mult":{"normal":1.0,"elite":1.08,"boss":1.0},"boss_rotation":["min_hand_three_kind","reroll_first_double","odd_locked","six_blind","no_relic_conditions"],"night_name_template_ko":"{n}번째 밤 — {boss}","night_name_template_en":"Night {n} — {boss}","best_night_key":"cursedPawn.save.endlessBest"},"schema":{"version":"2.0","description_ko":"game_data.json 의 기계 판독용 계약 사전. 모든 유물/부적이 쓰는 condition·effect_type·charm_effect 는 반드시 여기 등재되어야 하며, tools/balance_sim.py 가 이 사전과 실제 데이터의 일치를 검사한다.","description_en":"Machine-readable contract for game_data.json. Every condition, effect_type and charm effect used by relics/charms must be listed here; tools/balance_sim.py validates the match.","engine_support_legend":{"native":"기존 js/game.js 가 직접 판정","regex":"기존 js/game.js 의 방어적 정규식 분기가 판정","pending":"엔진 통합 필요 (js/game.js 수정 대상, 이번 작업에서 수정 금지)"},"locale_fields":["name_ko","name_en","desc_ko","desc_en"],"triggers":{"on_score":{"name_ko":"정산 시","name_en":"On score","engine":"native"},"on_roll":{"name_ko":"핸드 시작 시 1회","name_en":"On hand start","engine":"native"},"passive":{"name_ko":"상시","name_en":"Passive","engine":"native"}},"conditions":{"always":{"name_ko":"상시","name_en":"Always","engine":"native","params":{},"eval":"항상 참 / always true"},"even_count":{"name_ko":"짝수 눈금 3개 이상","name_en":"3+ even dice","engine":"native","params":{"pip_count":3},"eval":"짝수 눈금 개수 >= 3"},"odd_count":{"name_ko":"홀수 눈금 3개 이상","name_en":"3+ odd dice","engine":"native","params":{"pip_count":3},"eval":"홀수 눈금 개수 >= 3"},"even_count_4":{"name_ko":"짝수 눈금 4개 이상","name_en":"4+ even dice","engine":"regex","params":{"pip_count":4},"eval":"even_count_N: 짝수 개수 >= N"},"odd_count_4":{"name_ko":"홀수 눈금 4개 이상","name_en":"4+ odd dice","engine":"regex","params":{"pip_count":4},"eval":"odd_count_N: 홀수 개수 >= N"},"even_count_5":{"name_ko":"모든 눈금이 짝수","name_en":"All dice even","engine":"regex","params":{"pip_count":5},"eval":"even_count_N (N=5)"},"pair_or_better":{"name_ko":"원 페어 이상","name_en":"One Pair or better","engine":"native","params":{"min_rank":1},"eval":"족보 순위 >= 1"},"three_kind_or_better":{"name_ko":"트리플 이상","name_en":"Three of a Kind or better","engine":"regex","params":{"min_rank":3},"eval":"*_or_better: 족보 순위 >= 3"},"four_kind_or_better":{"name_ko":"포 카드 이상","name_en":"Four of a Kind or better","engine":"regex","params":{"min_rank":7},"eval":"족보 순위 >= 7"},"full_house_or_better":{"name_ko":"풀 하우스 이상","name_en":"Full House or better","engine":"regex","params":{"min_rank":6},"eval":"족보 순위 >= 6"},"yahtzee_or_better":{"name_ko":"야찌","name_en":"Yahtzee","engine":"regex","params":{"min_rank":8},"eval":"족보 순위 >= 8"},"straight":{"name_ko":"스트레이트 계열","name_en":"Straight","engine":"native","params":{},"eval":"small/large straight"},"large_straight":{"name_ko":"라지 스트레이트","name_en":"Large Straight","engine":"pending","params":{},"eval":"1-5 또는 2-6 완성"},"two_present":{"name_ko":"2 눈금 포함","name_en":"A two is present","engine":"regex","params":{"pip":2},"eval":"X_present: 해당 눈금 존재"},"three_present":{"name_ko":"3 눈금 포함","name_en":"A three is present","engine":"regex","params":{"pip":3},"eval":"X_present"},"four_present":{"name_ko":"4 눈금 포함","name_en":"A four is present","engine":"regex","params":{"pip":4},"eval":"X_present"},"five_present":{"name_ko":"5 눈금 포함","name_en":"A five is present","engine":"regex","params":{"pip":5},"eval":"X_present"},"six_present":{"name_ko":"6 눈금 포함","name_en":"A six is present","engine":"native","params":{"pip":6},"eval":"6 존재"},"one_present":{"name_ko":"1 눈금 포함","name_en":"A one is present","engine":"native","params":{"pip":1},"eval":"1 존재"},"six_count_2":{"name_ko":"6 눈금 2개 이상","name_en":"2+ sixes","engine":"regex","params":{"pip":6,"pip_count":2},"eval":"X_count_N: 해당 눈금 개수 >= N"},"last_hand":{"name_ko":"라운드 마지막 핸드","name_en":"Final hand of the round","engine":"native","params":{},"eval":"남은 핸드 <= 1"},"gold_over_15":{"name_ko":"골드 15 이상","name_en":"15+ Gold","engine":"native","params":{},"eval":"엔진 구현은 >= 15"},"gold_at_least_30":{"name_ko":"골드 30 이상","name_en":"30+ Gold","engine":"regex","params":{"gold":30},"eval":"gold_at_least_N: 골드 >= N"},"sum_at_most_15":{"name_ko":"눈금 합 15 이하","name_en":"Dice total 15 or less","engine":"pending","params":{"sum_max":15},"eval":"sum(dice) <= 15"},"sum_at_most_14":{"name_ko":"눈금 합 14 이하","name_en":"Dice total 14 or less","engine":"pending","params":{"sum_max":14},"eval":"sum(dice) <= 14"},"sum_at_least_22":{"name_ko":"눈금 합 22 이상","name_en":"Dice total 22 or more","engine":"pending","params":{"sum_min":22},"eval":"sum(dice) >= 22"},"boss_round":{"name_ko":"보스 라운드","name_en":"Boss round","engine":"pending","params":{},"eval":"current_round.type == 'boss'"}},"effect_types":{"add_chips":{"name_ko":"칩 +N","name_en":"+N Chips","engine":"native","phase":"score","eval":"chips += value"},"add_mult":{"name_ko":"배수 +N","name_en":"+N Mult","engine":"native","phase":"score","eval":"mult += value"},"mul_mult":{"name_ko":"배수 ×N","name_en":"×N Mult","engine":"native","phase":"score","eval":"mul *= value (모두 곱한 뒤 1회 적용)"},"extra_reroll":{"name_ko":"리롤 +N","name_en":"+N Reroll","engine":"native","phase":"round","eval":"핸드당 리롤 +N"},"extra_hand":{"name_ko":"핸드 +N","name_en":"+N Hand","engine":"native","phase":"round","eval":"라운드 핸드 +N"},"gold_bonus":{"name_ko":"골드 +N","name_en":"+N Gold","engine":"native","phase":"clear","eval":"라운드 클리어 시 골드 +N (조건 판정)"},"add_chips_per_reroll":{"name_ko":"리롤당 칩 +N","name_en":"+N Chips per reroll","engine":"pending","phase":"score","eval":"chips += value * rerolls_max"},"add_mult_per_hands_left":{"name_ko":"남은 핸드당 배수 +N","name_en":"+N Mult per hand left","engine":"pending","phase":"score","eval":"mult += value * hands_left"},"add_chips_per_gold":{"name_ko":"골드 N당 칩 +V","name_en":"+V Chips per N Gold","engine":"pending","phase":"score","eval":"chips += value * floor(gold / scale)"},"add_mult_per_charm":{"name_ko":"부적당 배수 +N","name_en":"+N Mult per Charm","engine":"pending","phase":"score","eval":"mult += value * charm_count"},"shop_discount":{"name_ko":"상점 할인 N%","name_en":"N% shop discount","engine":"pending","phase":"shop","eval":"price = ceil(price * (1 - value/100))"},"interest_gold":{"name_ko":"이자 골드 +N","name_en":"+N Interest Gold","engine":"pending","phase":"clear","eval":"gold += value * floor(gold / scale) (clear 시)"}},"charm_effects":{"all_plus_one":{"name_ko":"모든 눈금 +N","name_en":"All dice +N","engine":"native","eval":"라운드 동안 눈금 +value (최대 6)"},"reroll_plus":{"name_ko":"리롤 +N","name_en":"Reroll +N","engine":"native","eval":"라운드 리롤 +value"},"hand_plus":{"name_ko":"핸드 +N","name_en":"Hand +N","engine":"native","eval":"라운드 핸드 +value"},"flip_dice":{"name_ko":"주사위 뒤집기","name_en":"Flip a die","engine":"native","eval":"선택 주사위를 7-value 로"},"temp_mult":{"name_ko":"이번 핸드 배수 +N","name_en":"+N Mult this hand","engine":"native","eval":"이번 핸드 mult +value"},"gold_gain":{"name_ko":"골드 +N","name_en":"+N Gold","engine":"native","eval":"즉시 골드 +value"},"hold_dice":{"name_ko":"주사위 고정","name_en":"Pin a die","engine":"pending","eval":"선택 주사위를 잠금(이번 핸드 리롤 불가)"},"set_pip":{"name_ko":"눈금 변환","name_en":"Set a die","engine":"pending","eval":"선택 주사위 눈금을 value 로"},"temp_chips":{"name_ko":"이번 핸드 칩 +N","name_en":"+N Chips this hand","engine":"pending","eval":"이번 핸드 chips +value"},"parity_shift":{"name_ko":"홀수 눈금 +1","name_en":"Odd dice +1","engine":"pending","eval":"모든 홀수 눈금 +value (최대 6)"},"curse_soften":{"name_ko":"저주 약화","name_en":"Soften curse","engine":"pending","eval":"이번 라운드 저주 강도 절반(내림)"},"curse_nullify":{"name_ko":"저주 무효","name_en":"Nullify curse","engine":"pending","eval":"이번 라운드 저주 무효"},"shop_free_reroll":{"name_ko":"상점 무료 리롤","name_en":"Free shop reroll","engine":"pending","eval":"진열 교체 1회 무료"}},"boss_curse_modifiers":{"reroll_delta":"라운드 리롤 허용량 증감 (int)","gold_tax_on_clear":"클리어 보상 지급 후 압수할 골드 (int)","pip_map":"정산/조건 판정 시 눈금 변환 맵 (예: {\"6\": 3})","pair_mult_delta":"페어 계열 족보 기본 배수 증감 (int, 최소 1)","hold_block":"홀드 금지 눈금 종류: even | odd | null","min_hand_rank":"정산 가능한 최소 족보 순위 (0~8)","first_reroll_cost":"핸드마다 첫 리롤이 소모하는 리롤 수 (int)","condition_pip_void":"조건 판정에서 없는 것으로 취급할 눈금 (1~6|null)","disable_conditions":"true 이면 always 를 제외한 모든 유물 조건이 거짓"},"achievement_condition_types":{"wins":"누적 승리 횟수","yahtzee_scored":"야찌 정산 횟수","single_hand_score":"한 핸드 최고 점수","ascension_clear":"클리어한 최고 승천 단계","relic_collection":"보유한 서로 다른 유물 종류 수 (계정 누적)","boss_clear_no_reroll":"리롤 0회 보스 클리어 횟수","win_with_zero_gold":"골드 0 상태로 밤을 넘긴 횟수","endless_night":"도달한 엔드리스 밤","boss_clear_hands_left":"보스 클리어 시 남은 핸드 수","curse_nullified":"부적으로 무효화한 저주 횟수","legendary_held":"보유 전설 유물 수","total_score":"한 판 누적 점수"},"ascension_rule_types":{"shop_surcharge":{"ko":"상점 가격 +N 골드","en":"+N Gold shop prices","params":["value"]},"start_gold":{"ko":"시작 골드 +N","en":"+N starting Gold","params":["value"]},"gold_tax":{"ko":"라운드 보상 −N 골드","en":"−N Gold per round clear","params":["value"]},"reroll_penalty":{"ko":"해당 라운드 리롤 −N","en":"−N Reroll in matching rounds","params":["value","scope(boss|elite|all)","min_night"]},"hand_penalty":{"ko":"해당 라운드 핸드 −N","en":"−N Hand in matching rounds","params":["value","scope","min_night"]},"extra_boss_curse":{"ko":"보스에 저주 N개 추가","en":"+N extra boss curse","params":["value","min_night","pool"]}}}};

  /* ══════════════════════════════ 4. 상태 ══════════════════════════════ */

  const S = {
    lang: 'ko',
    sound: true,
    bgm: true,
    volume: 0.85,
    screen: 'title',
    phase: 'title',          // title | idle | rolled | scoring | shop | over | won | endlessChoice
    dataSource: 'fallback',
    meta: {},

    roundIndex: 0,
    night: 1,
    roundNum: 1,
    roundName: '',
    target: 0,
    score: 0,
    gold: 0,

    // 승천 · 엔드리스 · 메타 진행
    ascension: 0,
    ascensionMax: 0,
    endless: false,
    endlessStart: 0,
    endlessBest: 0,
    endlessPending: false,
    progress: { unlocked: {}, relicSeen: [], runs: 0, wins: 0, bestNight: 0, curseNullified: 0 },
    achQueue: [],

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
    tempChips: 0,
    tempChipsLabel: '',

    roundPipBonus: 0,
    roundParityBonus: 0,
    roundBonusRerolls: 0,
    roundBaseRerolls: 2,
    roundRerollPenalty: 0,
    handBonus: { chips: 0, mult: 0, rows: [] },

    // 보스 저주 (라운드마다 컴파일)
    curseIds: [],
    mods: null,
    curseSoft: false,
    curseNull: false,

    shopFree: 0,

    totalScore: 0,
    focusCharm: -1,
    focusMode: '',
    rolling: false,
    skipAnim: false,
    best: null,
    lastResult: null,
    run: {
      rerolls: 0,             // 이번 판 전체 리롤 사용
      bossRerolls: 0,         // 현재 보스 라운드 리롤 사용
      curseNull: 0,           // 부적으로 저주 무효화한 횟수
      bestHand: 0,            // 한 핸드 최고 점수
      yahtzee: 0,             // 야찌 정산 횟수
      legendary: 0,           // 보유 전설 유물 최대
      endlessNight: 0
    },

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

  // 상점 유물 진열 등급 가중치 (meta.rarity_weights 가 있으면 그것을 사용)
  const RARITY_WEIGHT = { common: 50, uncommon: 28, rare: 11, legendary: 5, cursed: 6 };
  function syncRarityWeights() {
    const w = DATA && DATA.meta && DATA.meta.rarity_weights;
    if (!w) return;
    Object.keys(w).forEach(k => { if (isFinite(Number(w[k]))) RARITY_WEIGHT[k] = Number(w[k]); });
  }
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
    // js/i18n.js 의 단일 사전(window.CursedI18n)이 있으면 그것을 우선 사용한다.
    if (window.CursedI18n) {
      const s = window.CursedI18n.t(key, vars);
      if (s != null && s !== key) return s;
    }
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
    if (window.CursedI18n) return window.CursedI18n.dataName(obj);
    const v = S.lang === 'ko' ? obj.name_ko : obj.name_en;
    return v || obj.name_ko || obj.name_en || obj.id || '';
  }
  function ddesc(obj) {
    if (!obj) return '';
    if (window.CursedI18n) return window.CursedI18n.dataDesc(obj);
    const v = S.lang === 'ko' ? obj.desc_ko : obj.desc_en;
    return v || obj.desc_ko || obj.desc_en || '';
  }
  function condLabel(cond) {
    if (window.CursedI18n) {
      const s = window.CursedI18n.condLabel(cond);
      if (s && s !== 'cond.' + cond) return s;
    }
    return t('cond.' + cond);
  }
  function rarityLabel(rarity) {
    if (window.CursedI18n) {
      const s = window.CursedI18n.rarityLabel(rarity);
      if (s && s !== 'rarity.' + rarity) return s;
    }
    return RARITY_INFO[rarity] ? RARITY_INFO[rarity][S.lang] : (rarity || '');
  }
  function triggerLabel(trigger) {
    if (window.CursedI18n) return window.CursedI18n.triggerLabel(trigger);
    return TRIGGER_INFO[trigger] ? TRIGGER_INFO[trigger][S.lang] : (trigger || '');
  }
  function curseName(id) {
    const info = CURSE_INFO[id];
    if (info) return info[S.lang].name;
    if (window.CursedI18n) return window.CursedI18n.curseLabel(id, 'name');
    return id;
  }
  function curseDesc(id) {
    const info = CURSE_INFO[id];
    if (info) return info[S.lang].desc;
    if (window.CursedI18n) return window.CursedI18n.curseLabel(id, 'desc');
    return '';
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
    if (typeof save.bgm === 'boolean') S.bgm = save.bgm;
    if (isFinite(Number(save.volume))) S.volume = clamp(Number(save.volume), 0, 1);
    S.best = save.best || null;
    S.ascensionMax = clamp(num(save.ascensionMax, 0), 0, 5);
    const p = save.progress || {};
    S.progress = {
      unlocked: (p.unlocked && typeof p.unlocked === 'object') ? p.unlocked : {},
      relicSeen: Array.isArray(p.relicSeen) ? p.relicSeen.slice() : [],
      runs: num(p.runs, 0),
      wins: num(p.wins, 0),
      bestNight: num(p.bestNight, 0),
      curseNullified: num(p.curseNullified, 0),
      endlessBest: num(p.endlessBest, 0),
      totalScore: num(p.totalScore, 0),
      bestHand: num(p.bestHand, 0)
    };
    S.endlessBest = num(S.progress.endlessBest, 0);
  }
  function persistSettings() {
    const save = loadSave();
    save.lang = S.lang;
    save.sound = S.sound;
    save.bgm = S.bgm;
    save.volume = S.volume;
    writeSave(save);
  }
  function persistBest(best) {
    const save = loadSave();
    save.best = best;
    writeSave(save);
    S.best = best;
  }
  function persistProgress() {
    const save = loadSave();
    save.progress = S.progress;
    save.ascensionMax = S.ascensionMax;
    writeSave(save);
  }

  /** 오디오 설정을 실제 신디사이저에 반영한다. (BGM/SFX/볼륨) */
  function applyAudioSettings(opts) {
    const SND = window.CPSound;
    if (!SND) return;
    try {
      SND.setEnabled(S.sound);
      if (SND.setMasterVolume) SND.setMasterVolume(S.volume);
      if (SND.setBgmEnabled) SND.setBgmEnabled(S.bgm && S.sound);
      if (SND.startBgm && S.bgm && S.sound && !(opts && opts.noStart)) SND.startBgm('normal');
    } catch (e) { /* 사운드 실패는 게임을 막지 않는다 */ }
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
      scale: num(r.scale, 1) || 1,
      condition: (r.condition || 'always'),
      tags: Array.isArray(r.tags) ? r.tags.slice() : [],
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

  function normalizeCurse(c) {
    if (!c || !c.id) return null;
    return {
      id: c.id,
      scope: c.scope || 'night',
      name_ko: c.name_ko || c.id,
      name_en: c.name_en || c.id,
      desc_ko: c.desc_ko || '',
      desc_en: c.desc_en || '',
      modifier: (c.modifier && typeof c.modifier === 'object') ? c.modifier : {}
    };
  }

  function normalizeAscension(a, i) {
    if (!a) return null;
    return {
      level: num(a.level, i),
      name_ko: a.name_ko || ('A' + num(a.level, i)),
      name_en: a.name_en || ('A' + num(a.level, i)),
      desc_ko: a.desc_ko || '',
      desc_en: a.desc_en || '',
      target_mult: num(a.target_mult, 1),
      start_gold_delta: num(a.start_gold_delta, 0),
      shop_cost_delta: num(a.shop_cost_delta, 0),
      extra_curse_rule: a.extra_curse_rule || null,
      active_rules: Array.isArray(a.active_rules) ? a.active_rules.slice() : []
    };
  }

  function normalizeAchievement(a) {
    if (!a || !a.id) return null;
    return {
      id: a.id,
      icon: a.icon || '✦',
      name_ko: a.name_ko || a.id,
      name_en: a.name_en || a.id,
      desc_ko: a.desc_ko || '',
      desc_en: a.desc_en || '',
      condition_type: a.condition_type || '',
      target_value: num(a.target_value, 1),
      scope: a.scope || 'run'
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

    // 보스 저주 · 승천 · 업적 · 엔드리스 (신규 블록)
    let bossCurses = (Array.isArray(json && json.boss_curses) ? json.boss_curses : [])
      .map(normalizeCurse).filter(Boolean);
    if (!bossCurses.length && Array.isArray(fb.boss_curses)) bossCurses = fb.boss_curses.map(normalizeCurse).filter(Boolean);
    const curseMap = {};
    bossCurses.forEach(c => { curseMap[c.id] = c; });

    let ascensions = (Array.isArray(json && json.ascensions) ? json.ascensions : [])
      .map(normalizeAscension).filter(Boolean);
    if (!ascensions.length && Array.isArray(fb.ascensions)) ascensions = fb.ascensions.map(normalizeAscension).filter(Boolean);
    if (!ascensions.length) ascensions = [normalizeAscension({ level: 0, target_mult: 1 }, 0)];
    ascensions.sort((a, b) => a.level - b.level);

    let achievements = (Array.isArray(json && json.achievements) ? json.achievements : [])
      .map(normalizeAchievement).filter(Boolean);
    if (!achievements.length && Array.isArray(fb.achievements)) achievements = fb.achievements.map(normalizeAchievement).filter(Boolean);

    const endless = Object.assign({
      enabled: true, start_night: 6, rounds_per_night: 3, hands_allowed: 3, rerolls_per_hand: 2,
      reward_gold_base: 14, reward_gold_growth: 2, base_target: 6500, target_growth_per_night: 1.28,
      round_type_target_mult: { normal: 1, elite: 1.08, boss: 1 },
      boss_rotation: ['min_hand_three_kind', 'reroll_first_double', 'odd_locked', 'six_blind', 'no_relic_conditions'],
      night_name_template_ko: '{n}번째 밤 — {boss}',
      night_name_template_en: 'Night {n} — {boss}',
      best_night_key: 'cursedPawn.save.endlessBest'
    }, fb.endless || {}, (json && json.endless) || {});

    return {
      meta: meta, hands: hands, relics: relics, charms: charms, nights: flat,
      bossCurses: bossCurses, curseMap: curseMap,
      ascensions: ascensions, achievements: achievements, endless: endless,
      schema: (json && json.schema) || (fb && fb.schema) || {}
    };
  }

  function loadGameData() {
    const fallback = () => {
      DATA = normalizeData(FALLBACK_DATA || {});
      ROUNDS = DATA.nights;
      S.dataSource = 'fallback';
      syncRarityWeights();
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
        syncRarityWeights();
        console.log('[CP] game_data.json 로드 완료 —', ROUNDS.length, '라운드 · 유물', DATA.relics.length, '종');
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

  /* ── 보스 저주 modifier 컴파일 ──────────────────────────────────────
     game_data.json boss_curses[].modifier 를 라운드 시작 시 하나의 객체로 합산한다.
     부적 grave_water(curse_soften) / iron_contract(curse_nullify) 가
     이 객체를 약화·무효화한다. */
  const LEGACY_MODIFIER = {
    minus_reroll: { reroll_delta: -1 },
    tax_gold: { gold_tax_on_clear: 3 },
    cap_six_to_three: { pip_map: { '6': 3 } },
    no_pair_bonus: { pair_mult_delta: -1 },
    no_even: { hold_block: 'even' }
  };

  function curseModifier(id) {
    const def = DATA && DATA.curseMap ? DATA.curseMap[id] : null;
    if (def && def.modifier && Object.keys(def.modifier).length) return def.modifier;
    return LEGACY_MODIFIER[id] || {};
  }

  function emptyMods() {
    return {
      ids: [], rerollDelta: 0, goldTax: 0, pipMap: {}, pairMultDelta: 0,
      holdBlock: '', minHandRank: 0, firstRerollCost: 1, pipVoid: 0,
      disableConditions: false, nullified: false, softened: false
    };
  }

  function compileMods(ids) {
    const mods = emptyMods();
    (ids || []).forEach(id => {
      if (!id) return;
      mods.ids.push(id);
      const m = curseModifier(id);
      if (m.reroll_delta) mods.rerollDelta += num(m.reroll_delta, 0);
      if (m.gold_tax_on_clear) mods.goldTax += num(m.gold_tax_on_clear, 0);
      if (m.pip_map) {
        Object.keys(m.pip_map).forEach(k => { mods.pipMap[Number(k)] = num(m.pip_map[k], 0); });
      }
      if (m.pair_mult_delta) mods.pairMultDelta += num(m.pair_mult_delta, 0);
      if (m.hold_block) mods.holdBlock = m.hold_block;
      if (m.min_hand_rank) mods.minHandRank = Math.max(mods.minHandRank, num(m.min_hand_rank, 0));
      if (m.first_reroll_cost) mods.firstRerollCost = Math.max(mods.firstRerollCost, num(m.first_reroll_cost, 1));
      if (m.condition_pip_void) mods.pipVoid = num(m.condition_pip_void, 0);
      if (m.disable_conditions) mods.disableConditions = true;
    });
    return mods;
  }

  function halve(v) { return Math.trunc(num(v, 0) / 2); }

  /** 이번 라운드에 실제로 적용되는 modifier (부적 약화·무효 반영) */
  function activeMods() {
    const base = S.mods || emptyMods();
    if (!base.ids.length) return base;
    if (S.curseNull) {
      const m = emptyMods();
      m.ids = base.ids.slice();
      m.nullified = true;
      return m;
    }
    if (!S.curseSoft) return base;
    const m = emptyMods();
    m.ids = base.ids.slice();
    m.softened = true;
    m.rerollDelta = halve(base.rerollDelta);
    m.goldTax = halve(base.goldTax);
    m.pairMultDelta = halve(base.pairMultDelta);
    m.minHandRank = base.minHandRank > 1 ? halve(base.minHandRank) : 0;
    m.firstRerollCost = base.firstRerollCost > 1 ? Math.max(1, halve(base.firstRerollCost)) : 1;
    // hold_block · pip_map · condition_pip_void · disable_conditions 는 해제
    return m;
  }

  function evalVal(v) {
    const map = activeMods().pipMap;
    if (map && map[v] != null) return map[v];
    return v;
  }

  function pipValues() {
    return S.dice.filter(d => d.value).map(d => evalVal(d.value));
  }

  function countOf(vals, n) {
    return vals.reduce((acc, v) => acc + (v === n ? 1 : 0), 0);
  }

  function uniqueSorted(vals) {
    return vals.slice().sort((a, b) => a - b).filter((v, i, arr) => i === 0 || v !== arr[i - 1]);
  }

  /**
   * 유물 조건 판정.
   * ctx: { vals(유효 눈금 5개), handId, handRank, handsLeft, gold, roundType }
   * 짝수/홀수/6/1 조건은 항상 주사위 5개 기준.
   */
  function conditionMet(condition, ctx) {
    const c = String(condition || 'always').toLowerCase().trim();
    if (!c || c === 'always' || c === 'any' || c === 'true' || c === 'none') return true;

    const mods = activeMods();
    if (mods.disableConditions) return false;

    let vals = (ctx.vals || []).slice();
    if (mods.pipVoid) vals = vals.filter(v => v !== mods.pipVoid);

    const even = vals.filter(v => v % 2 === 0).length;
    const odd = vals.length - even;
    const rank = typeof ctx.handRank === 'number' ? ctx.handRank : (HAND_RANK[ctx.handId] || 0);
    const sum = vals.reduce((a, b) => a + b, 0);

    switch (c) {
      case 'even_count': return even >= 3;
      case 'odd_count': return odd >= 3;
      case 'pair_or_better': return rank >= 1;
      case 'straight': return ctx.handId === 'small_straight' || ctx.handId === 'large_straight';
      case 'large_straight': {
        if (vals.length < 5) return false;
        const u = uniqueSorted(vals);
        return u.length === 5 && u[4] - u[0] === 4;
      }
      case 'six_present': return vals.indexOf(6) >= 0;
      case 'one_present': return vals.indexOf(1) >= 0;
      case 'last_hand': return ctx.handsLeft <= 1;
      case 'gold_over_15': return ctx.gold >= 15;
      case 'boss_round': return ctx.roundType === 'boss';
      default: break;
    }

    // 방어적 확장 처리 (데이터가 변형되어도 죽지 않도록)
    let m;
    if ((m = c.match(/^(even|odd)_count_(\d+)$/))) {
      return (m[1] === 'even' ? even : odd) >= +m[2];
    }
    if ((m = c.match(/^gold_over_(\d+)$/))) return ctx.gold > +m[1];
    if ((m = c.match(/^gold_at_least_(\d+)$/))) return ctx.gold >= +m[1];
    if ((m = c.match(/^sum_at_most_(\d+)$/))) return sum <= +m[1];
    if ((m = c.match(/^sum_at_least_(\d+)$/))) return sum >= +m[1];
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
      roundType: (currentRound() && currentRound().type) || 'normal',
      diceValues: S.dice.map(d => d.value)
    };
  }

  /** 조건 없이 항상 계산되는 비례 효과의 실효값 */
  function effectValue(relic, ctx) {
    const type = relic.effect_type;
    const value = num(relic.value, 0);
    const scale = Math.max(1, num(relic.scale, 1));
    if (type === 'add_chips_per_reroll') return value * Math.max(0, S.rerollsMax || 0);
    if (type === 'add_mult_per_hands_left') return value * Math.max(0, S.hands);
    if (type === 'add_chips_per_gold') return value * Math.floor(Math.max(0, S.gold) / scale);
    if (type === 'add_mult_per_charm') return value * S.charms.length;
    return value;
  }

  const SCORE_EFFECTS = [
    'add_chips', 'add_mult', 'mul_mult',
    'add_chips_per_reroll', 'add_mult_per_hands_left', 'add_chips_per_gold', 'add_mult_per_charm'
  ];

  /**
   * (기본 칩 + 유물 칩) × (기본 배수 + 유물 배수 + 부적) × mul_mult 곱
   */
  function computeScore(handId) {
    if (!S.dice.length || S.dice.some(d => !d.value)) return null;
    const hand = handById(handId);
    if (!hand) return null;

    const vals = pipValues();
    const res = evaluate(vals);
    if (!res.achievable[handId]) return null;

    const mods = activeMods();
    if (mods.minHandRank && HAND_RANK[handId] < mods.minHandRank) return null;

    const ctx = {
      vals: vals,
      handId: handId,
      handRank: HAND_RANK[handId] || 0,
      handsLeft: S.hands,
      gold: S.gold,
      curse: currentCurse(),
      roundType: (currentRound() && currentRound().type) || 'normal'
    };

    let baseChips = num(hand.base_chips, 0);
    let baseMult = num(hand.base_mult, 1);
    const curseNotes = [];

    if (mods.pairMultDelta && PAIR_FAMILY.indexOf(handId) >= 0) {
      const before = baseMult;
      baseMult = Math.max(1, baseMult + mods.pairMultDelta);
      curseNotes.push({
        type: mods.ids.filter(id => curseModifier(id).pair_mult_delta)[0] || 'no_pair_bonus',
        text: t('bd.curse'),
        delta: baseMult - before
      });
    }

    let chips = baseChips;
    let mult = baseMult;
    const muls = [];
    const rows = [];
    let triggerStep = 0;

    // 핸드 시작 시 확정된 on_roll 보너스 (핸드당 1회)
    const bonus = S.handBonus || { chips: 0, mult: 0, rows: [] };
    chips += num(bonus.chips, 0);
    mult += num(bonus.mult, 0);
    (bonus.rows || []).forEach(row => {
      rows.push({ relic: row.relic, kind: row.kind, value: row.value, met: !!row.met, trigger: 'on_roll', step: ++triggerStep });
    });

    S.relics.forEach(relic => {
      const kind = relic.effect_type;
      if (SCORE_EFFECTS.indexOf(kind) < 0) return;
      if (relic.trigger === 'on_roll') return; // 위에서 1회만 반영
      const met = conditionMet(relic.condition, ctx);
      const shownValue = (kind.indexOf('_per_') >= 0) ? effectValue(relic, ctx) : num(relic.value, 0);
      if (!met) {
        rows.push({ relic: relic, kind: kind, value: shownValue, met: false, step: 0 });
        return;
      }
      if (kind === 'add_chips' || kind === 'add_chips_per_reroll' || kind === 'add_chips_per_gold') chips += shownValue;
      else if (kind === 'add_mult' || kind === 'add_mult_per_hands_left' || kind === 'add_mult_per_charm') mult += shownValue;
      else if (kind === 'mul_mult') muls.push(shownValue);
      rows.push({ relic: relic, kind: kind, value: shownValue, met: true, step: ++triggerStep });
    });

    let tempMult = 0;
    if (S.tempMult) {
      tempMult = S.tempMult;
      mult += tempMult;
    }
    let tempChips = 0;
    if (S.tempChips) {
      tempChips = S.tempChips;
      chips += tempChips;
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
      tempChips: tempChips,
      tempChipsLabel: S.tempChipsLabel || '',
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
      curse: currentCurse(),
      roundType: (currentRound() && currentRound().type) || 'normal'
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

  /** 이번 라운드에서 정산 가능한 최소 족보 rank (저주 min_hand_rank) */
  function minHandRank() { return activeMods().minHandRank || 0; }

  function bestHand() {
    let best = null;
    let bestTotal = -1;
    HAND_ORDER.forEach(id => {
      const bd = computeScore(id);
      if (bd && bd.total > bestTotal) { bestTotal = bd.total; best = id; }
    });
    return best;
  }

  /* ══════════════════════════════ 12. 승천 · 런 진행 ══════════════════════════════ */

  function ascensionDef(level) {
    const lv = clamp(num(level, S.ascension), 0, 5);
    const list = (DATA && DATA.ascensions) || [];
    return list.find(a => a.level === lv) || list[0] || { level: 0, target_mult: 1, active_rules: [] };
  }
  function ascensionRules() { return ascensionDef(S.ascension).active_rules || []; }
  function ascensionLabel(level) {
    const a = ascensionDef(level);
    return 'A' + num(level, 0) + (a && a.name_ko ? ' · ' + dname(a) : '');
  }

  /** 승천 규칙: 특정 라운드의 리롤 감소 */
  function ascensionRerollPenalty(round) {
    let penalty = 0;
    ascensionRules().forEach(rule => {
      if (!rule || rule.type !== 'reroll_penalty') return;
      const scope = rule.scope || 'all';
      if (scope !== 'all' && scope !== round.type) return;
      if (num(rule.min_night, 0) > num(round.night, 0)) return;
      penalty += num(rule.value, 1);
    });
    return penalty;
  }

  /** 승천 규칙: 보스 저주 추가 (A5 마지막 밤 보스 2개) */
  function extraBossCurses(round) {
    const out = [];
    ascensionRules().forEach(rule => {
      if (!rule || rule.type !== 'extra_boss_curse') return;
      if (round.type !== 'boss') return;
      if (num(round.night, 0) < num(rule.min_night, 0)) return;
      const pool = (Array.isArray(rule.pool) && rule.pool.length) ? rule.pool : CURSE_IDS;
      const count = Math.max(0, num(rule.value, 1));
      for (let i = 0; i < count; i++) {
        const pick = pool[(num(round.night, 0) + i) % pool.length];
        if (pick && out.indexOf(pick) < 0) out.push(pick);
      }
    });
    return out;
  }

  function roundCurseIds(round) {
    const ids = [];
    if (round && round.boss_curse_id) ids.push(round.boss_curse_id);
    extraBossCurses(round || {}).forEach(id => { if (ids.indexOf(id) < 0) ids.push(id); });
    return ids;
  }

  function startRun(level) {
    DATA = DATA || normalizeData(FALLBACK_DATA || {});
    if (level != null) S.ascension = clamp(num(level, 0), 0, 5);
    S.ascension = clamp(S.ascension, 0, S.ascensionMax >= 0 ? 5 : 0);
    S.roundIndex = 0;
    S.totalScore = 0;
    S.relics = [];
    S.charms = [];
    S.log = [];
    S.gold = Math.max(0, num(DATA.meta.start_gold, 5) + num(ascensionDef(S.ascension).start_gold_delta, 0));
    S.uid = 1;
    S.tempMult = 0;
    S.tempMultLabel = '';
    S.tempChips = 0;
    S.tempChipsLabel = '';
    S.lastResult = null;
    S.endless = false;
    S.endlessPending = false;
    S.endlessStart = num((DATA.endless || {}).start_night, 6);
    S.baseRoundCount = ROUNDS.length;
    S.curseSoft = false;
    S.curseNull = false;
    S.shopFree = 0;
    S.run = { rerolls: 0, bossRerolls: 0, curseNull: 0, bestHand: 0, yahtzee: 0, legendary: 0, bestHandsLeft: 0, noRerollBoss: false, zeroGoldNight: false, endlessNight: 0, winAscension: -1 };
    const logAsc = S.ascension;
    addLog('ascension', t('log.ascension', { level: logAsc, name: dname(ascensionDef(logAsc)) }), '', '',
      () => t('log.ascension', { level: logAsc, name: dname(ascensionDef(logAsc)) }));
    startRound();
  }

  function startRound() {
    const r = currentRound();
    if (!r) return;

    S.phase = 'idle';
    S.night = num(r.night, 1);
    S.roundNum = num(r.round, 1);
    S.roundName = (S.lang === 'ko' ? r.night_name_ko : r.night_name_en) || '';
    S.target = Math.max(1, Math.round(num(r.target_score, 100) * num(ascensionDef(S.ascension).target_mult, 1)));
    S.score = 0;
    S.roundPipBonus = 0;
    S.roundParityBonus = 0;
    S.roundBonusRerolls = 0;
    S.curseIds = roundCurseIds(r);
    S.mods = compileMods(S.curseIds);
    S.curseSoft = false;
    S.curseNull = false;
    S.tempMult = 0;
    S.tempMultLabel = '';
    S.tempChips = 0;
    S.tempChipsLabel = '';
    S.focusCharm = -1;
    S.focusMode = '';
    S.selectedHand = null;
    S.handCount = 0;
    S.roundRerollPenalty = ascensionRerollPenalty(r);
    S.roundBaseRerolls = Math.max(0, num(r.rerolls_per_hand, 2) + S.mods.rerollDelta - S.roundRerollPenalty);
    if (r.type === 'boss') S.run.bossRerolls = 0;

    const extraHands = S.relics.reduce((acc, rl) => acc + (rl.effect_type === 'extra_hand' ? num(rl.value, 0) : 0), 0);
    S.handsMax = num(r.hands_allowed, 4) + extraHands;
    S.hands = S.handsMax;

    const logNight = S.night;
    const logRound = S.roundNum;
    const logType = r.type || 'normal';
    addLog('roundStart', t('log.roundStart', {
      night: logNight,
      type: t('type.' + logType),
      round: logRound
    }), '', '', () => t('log.roundStart', {
      night: logNight,
      type: t('type.' + logType),
      round: logRound
    }));

    if (S.curseIds.length) {
      S.curseIds.forEach(id => {
        addLog('curse', t('log.curse', { name: curseName(id) }), '', 'bad', () => t('log.curse', { name: curseName(id) }));
      });
      sfx('boss');
      say('boss');
    } else {
      sfx('click');
      say('round');
    }

    renderBoss();
    syncBgmMode();
    startHand(true);

    if (S.endless) {
      S.run.endlessNight = Math.max(S.run.endlessNight, S.night);
      checkAchievements('endless');
    }
    checkAchievements('round');
  }

  /** 저주 약화/무효화 후 리롤 예산을 다시 계산한다. */
  function recomputeRoundRerolls() {
    const r = currentRound() || {};
    S.roundBaseRerolls = Math.max(0, num(r.rerolls_per_hand, 2) + activeMods().rerollDelta - num(S.roundRerollPenalty, 0));
    const oldMax = num(S.rerollsMax, 0);
    const next = computeRerolls();
    S.rerollsMax = next;
    S.rerolls = Math.max(0, Math.min(next, num(S.rerolls, 0) + (next - oldMax)));
  }

  function computeRerolls() {
    const base = (S.roundBaseRerolls != null) ? S.roundBaseRerolls : num(currentRound().rerolls_per_hand, 2);
    const relicBonus = S.relics.reduce((acc, r) => acc + (r.effect_type === 'extra_reroll' ? num(r.value, 0) : 0), 0);
    return Math.max(0, base + relicBonus + (S.roundBonusRerolls || 0));
  }

  function rollValue() {
    let v = clamp(1 + rnd(6) + (S.roundPipBonus || 0), 1, 6);
    if (S.roundParityBonus && v % 2 === 1) v = clamp(v + S.roundParityBonus, 1, 6);
    return v;
  }

  function startHand(first) {
    S.rerollsMax = computeRerolls();
    S.rerolls = S.rerollsMax;
    S.tempMult = 0;
    S.tempMultLabel = '';
    S.tempChips = 0;
    S.tempChipsLabel = '';
    S.focusCharm = -1;
    S.focusMode = '';
    S.phase = 'idle';
    S.rolling = false;
    S.handCount = (S.handCount || 0) + 1;
    S.handRerollUsed = 0;

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
    const stage = $('dice-stage');
    const nodes = stage ? stage.querySelectorAll('.die') : [];
    indices.forEach((idx, k) => {
      const node = nodes[idx];
      if (!node) return;
      const inner = node.querySelector('.die-inner');
      if (inner) inner.style.animationDelay = (k * 45) + 'ms';
      node.classList.add('rolling');
      node.classList.remove('bounce');
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
      // 착지 바운스
      const landed = $('dice-stage') ? $('dice-stage').querySelectorAll('.die') : [];
      indices.forEach((idx, k) => {
        const node = landed[idx];
        if (!node) return;
        setTimeout(() => {
          node.classList.add('bounce');
          setTimeout(() => node.classList.remove('bounce'), 420);
        }, k * 35);
      });
      renderButtons();
    }, 660);
  }

  function rerollCost() {
    const mods = activeMods();
    if (mods.firstRerollCost > 1 && (S.handRerollUsed || 0) === 0) return mods.firstRerollCost;
    return 1;
  }

  function onRoll() {
    if (S.rolling) return;
    if (S.focusCharm >= 0) { cancelFocus(); }
    if (S.phase === 'idle') { rollHand(); return; }
    if (S.phase !== 'rolled') return;
    const cost = rerollCost();
    if (S.rerolls < cost) {
      toast(cost > 1 ? t('toast.firstRerollDouble') : t('msg.noReroll'), true);
      sfx('error');
      return;
    }
    const idx = [];
    S.dice.forEach((d, i) => {
      if (!d.held) { d.value = rollValue(); idx.push(i); }
    });
    if (!idx.length) {
      toast(t('msg.selectHand'), true);
      return;
    }
    S.rerolls -= cost;
    S.handRerollUsed = (S.handRerollUsed || 0) + 1;
    S.run.rerolls += cost;
    if (currentRound() && currentRound().type === 'boss') S.run.bossRerolls += cost;
    S.selectedHand = bestHand();
    sfx('reroll');
    renderHUD();
    renderAll();
    animateDiceRoll(idx);
  }

  function holdBlocked(value) {
    const block = activeMods().holdBlock;
    if (!block) return false;
    if (block === 'even') return value % 2 === 0;
    if (block === 'odd') return value % 2 === 1;
    return false;
  }

  function onDieClick(i) {
    if (S.phase !== 'rolled' || S.rolling) return;

    if (S.focusCharm >= 0) {
      applyCharmTarget(i);
      return;
    }

    const d = S.dice[i];
    if (!d) return;

    if (holdBlocked(d.value)) {
      toast(activeMods().holdBlock === 'even' ? t('toast.evenLocked') : t('toast.oddLocked'), true);
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
    // 홀드 인장 락인 연출
    if (d.held) {
      const node = $('dice-stage').querySelectorAll('.die')[i];
      if (node) {
        node.classList.add('locked-in');
        setTimeout(() => node.classList.remove('locked-in'), 520);
      }
    }
    renderButtons();
    renderTableMessage();
  }

  function handDiceHighlight(indices) {
    const stage = $('dice-stage');
    if (!stage) return;
    const nodes = stage.querySelectorAll('.die');
    nodes.forEach(node => node.classList.remove('in-hand'));
    indices.forEach(i => {
      if (nodes[i]) nodes[i].classList.add('in-hand');
    });
  }

  function doScore() {
    if (S.phase !== 'rolled' || S.rolling) return;
    if (!S.selectedHand) {
      toast(minHandRank() ? t('toast.handLocked') : t('msg.needHand'), true);
      sfx('error');
      return;
    }
    const bd = computeScore(S.selectedHand);
    if (!bd) {
      toast(minHandRank() ? t('toast.handLocked') : t('msg.needHand'), true);
      sfx('error');
      return;
    }

    S.phase = 'scoring';
    S.skipAnim = false;
    renderButtons();

    playScoreAnimation(bd).then(() => commitScore(bd));
  }

  /* ── 숫자 카운트업 · 연출 헬퍼 ── */

  function nowMs() {
    return (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  }

  function animateNumber(node, from, to, ms) {
    if (!node) return Promise.resolve();
    if (S.skipAnim || !ms) { node.textContent = comma(to); return Promise.resolve(); }
    const start = nowMs();
    return new Promise(resolve => {
      function step() {
        const p = clamp((nowMs() - start) / ms, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        node.textContent = comma(from + (to - from) * eased);
        if (p < 1 && !S.skipAnim) {
          if (typeof requestAnimationFrame === 'function') requestAnimationFrame(step);
          else setTimeout(step, 16);
        } else {
          node.textContent = comma(to);
          resolve();
        }
      }
      step();
    });
  }

  function screenShake(intensity) {
    const app = $('app');
    if (!app) return;
    const cls = 'shake-' + clamp(Math.round(intensity || 1), 1, 3);
    app.classList.remove('shake-1', 'shake-2', 'shake-3');
    void app.offsetWidth;
    app.classList.add(cls);
    setTimeout(() => app.classList.remove('shake-1', 'shake-2', 'shake-3'), 700);
  }

  function burstParticles(anchor, count, tone) {
    if (S.skipAnim) return;
    const layer = $('particles');
    if (!layer || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const n = clamp(count || 14, 4, 40);
    for (let i = 0; i < n; i++) {
      const p = el('span', 'particle ' + (tone || ''));
      const ang = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const dist = 40 + Math.random() * 90;
      p.style.left = (rect.left + rect.width / 2) + 'px';
      p.style.top = (rect.top + rect.height / 2) + 'px';
      p.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      p.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      p.style.setProperty('--d', (0.5 + Math.random() * 0.5).toFixed(2) + 's');
      layer.appendChild(p);
      setTimeout(() => p.remove(), 1200);
    }
  }

  async function playScoreAnimation(bd) {
    const popup = $('score-popup');
    $('sp-hand-name').textContent = dname(bd.hand);
    $('sp-hand-tag').textContent = bd.diceValues.join(' · ');

    const chipAdds = bd.rows.filter(r => r.met && (r.kind === 'add_chips' || r.kind === 'add_chips_per_reroll' || r.kind === 'add_chips_per_gold'));
    const chipSum = chipAdds.reduce((a, r) => a + r.value, 0) + (bd.tempChips || 0);
    const multAdds = bd.rows.filter(r => r.met && (r.kind === 'add_mult' || r.kind === 'add_mult_per_hands_left' || r.kind === 'add_mult_per_charm'));
    const multSum = multAdds.reduce((a, r) => a + r.value, 0) + (bd.tempMult || 0);
    const mulMuls = bd.rows.filter(r => r.met && r.kind === 'mul_mult');

    $('sp-chips-base').textContent = comma(bd.baseChips);
    $('sp-chips-dice').style.display = 'none';
    $('sp-relic-chips').textContent = chipSum ? '+' + comma(chipSum) : '';
    $('sp-chips-total').textContent = comma(bd.baseChips);
    $('sp-mult-base').textContent = comma(bd.baseMult);
    $('sp-mult-add').textContent = multSum ? '+' + comma(multSum) : '';
    $('sp-relic-mults').textContent = mulMuls.length ? bd.muls.map(m => '×' + m).join(' ') : '';
    $('sp-mult-total').textContent = comma(bd.baseMult);
    $('sp-total').textContent = '= 0';

    const rowsBox = $('sp-relic-rows');
    rowsBox.innerHTML = '';
    const shown = [];
    bd.rows.forEach(r => {
      if (!r.met) return;
      shown.push(r);
      const row = el('div', 'sp-relic-row kind-' + r.kind);
      row.appendChild(el('span', 'srr-name', (r.relic.icon || '◆') + ' ' + dname(r.relic)));
      row.appendChild(el('b', 'srr-val', r.kind === 'mul_mult' ? '×' + r.value : '+' + comma(r.value)));
      rowsBox.appendChild(row);
    });
    if (bd.tempChips) {
      const row = el('div', 'sp-relic-row kind-charm');
      row.appendChild(el('span', 'srr-name', '🜏 ' + (bd.tempChipsLabel || t('bd.charmChips'))));
      row.appendChild(el('b', 'srr-val', '+' + comma(bd.tempChips)));
      rowsBox.appendChild(row);
    }
    if (bd.tempMult) {
      const row = el('div', 'sp-relic-row kind-charm');
      row.appendChild(el('span', 'srr-name', '🜏 ' + (bd.tempMultLabel || t('bd.charmMult'))));
      row.appendChild(el('b', 'srr-val', '+' + comma(bd.tempMult)));
      rowsBox.appendChild(row);
    }
    if (!shown.length && !bd.tempMult && !bd.tempChips) {
      rowsBox.appendChild(el('div', 'sp-relic-row is-empty', t('bd.none')));
    }

    popup.classList.remove('hidden');
    void popup.offsetWidth;
    popup.classList.add('show');
    sfx('score', 0);

    // 1) 칩 카운트업
    await animateNumber($('sp-chips-total'), bd.baseChips, bd.chips, 260);
    if (S.skipAnim) { $('sp-chips-total').textContent = comma(bd.chips); }

    // 2) 유물 순차 발동 (튀며 빛나는 하이라이트 + 플로팅 수치)
    const rowNodes = rowsBox.children;
    let chipCursor = bd.baseChips;
    let multCursor = bd.baseMult;
    let chipStep = 0;
    let multStep = 0;
    for (let i = 0; i < shown.length; i++) {
      const r = shown[i];
      const node = rowNodes[i];
      if (node) {
        node.classList.add('lit');
        setTimeout(() => node.classList.remove('pulse'), 10);
        node.classList.add('pulse');
      }
      if (r.kind === 'mul_mult') {
        sfx('playRelicTrigger');
        floatAt(node || popup, '×' + r.value, 'mult');
        $('sp-relic-mults').classList.add('flash');
        setTimeout(() => $('sp-relic-mults').classList.remove('flash'), 320);
      } else {
        chipStep += 1;
        sfx('playComboHit', chipStep);
        if (r.kind === 'add_chips' || r.kind === 'add_chips_per_reroll' || r.kind === 'add_chips_per_gold') {
          const from = chipCursor;
          chipCursor += r.value;
          floatAt($('sp-chips-total'), '+' + comma(r.value), 'chips');
          await animateNumber($('sp-chips-total'), from, chipCursor, 200);
        } else {
          multStep += 1;
          const from = multCursor;
          multCursor += r.value;
          floatAt($('sp-mult-total'), '+' + comma(r.value), 'mult');
          await animateNumber($('sp-mult-total'), from, multCursor, 200);
        }
      }
      if (S.skipAnim) break;
      await sleep(95);
    }

    if (bd.tempChips) {
      const from = chipCursor;
      chipCursor += bd.tempChips;
      floatAt($('sp-chips-total'), '+' + comma(bd.tempChips), 'chips');
      await animateNumber($('sp-chips-total'), from, chipCursor, 180);
    }
    if (bd.tempMult) {
      const from = multCursor;
      multCursor += bd.tempMult;
      floatAt($('sp-mult-total'), '+' + comma(bd.tempMult), 'mult');
      await animateNumber($('sp-mult-total'), from, multCursor, 180);
    }
    if (S.skipAnim) {
      $('sp-chips-total').textContent = comma(bd.chips);
      $('sp-mult-total').textContent = comma(bd.mult);
    }

    // 3) 최종 합계
    $('sp-total').textContent = '= ' + comma(bd.total);
    void $('sp-total').offsetWidth;
    $('sp-total').classList.add('pop');
    sfx('scoreTotal');

    if (bd.total >= 1000 || bd.handId === 'yahtzee') {
      const big = bd.handId === 'yahtzee' || bd.total >= 5000;
      screenShake(big ? 3 : 2);
      burstParticles($('sp-total'), big ? 26 : 14, bd.handId === 'yahtzee' ? 'gold' : '');
      sfx(bd.handId === 'yahtzee' ? 'playAchievement' : 'playRelicTrigger');
    }

    await sleep(S.skipAnim ? 60 : 620);

    popup.classList.remove('show');
    await sleep(S.skipAnim ? 0 : 170);
    popup.classList.add('hidden');
    $('sp-total').classList.remove('pop');
  }

  function commitScore(bd) {
    S.score += bd.total;
    S.totalScore += bd.total;
    S.hands -= 1;
    S.tempMult = 0;
    S.tempMultLabel = '';
    S.tempChips = 0;
    S.tempChipsLabel = '';
    if (bd.total > S.run.bestHand) S.run.bestHand = bd.total;
    if (bd.handId === 'yahtzee') S.run.yahtzee += 1;

    addLog('score', t('log.score', { hand: dname(bd.hand) }), '+' + comma(bd.total), 'good',
      () => t('log.score', { hand: dname(bd.hand) }));
    sfx('coins', 2);

    const handsEl = $('stat-hands');
    floatAt($('hud-score'), '+' + comma(bd.total), '');
    if (handsEl) handsEl.classList.add('pulse');
    setTimeout(() => { if (handsEl) handsEl.classList.remove('pulse'); }, 520);

    renderHUD();
    renderScoreBar();
    checkAchievements('score');

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

    // 패시브 유물: 골드 보너스 · 이자
    let bonus = 0;
    let interest = 0;
    const ctx = buildContext(S.selectedHand || 'high_card');
    S.relics.forEach(relic => {
      if (relic.effect_type === 'gold_bonus' && conditionMet(relic.condition, ctx)) {
        bonus += num(relic.value, 0);
      } else if (relic.effect_type === 'interest_gold') {
        const scale = Math.max(1, num(relic.scale, 10));
        interest += num(relic.value, 0) * Math.floor(Math.max(0, S.gold) / scale);
      }
    });

    S.gold += reward + bonus + interest;

    let tax = 0;
    const goldTax = activeMods().goldTax;
    if (goldTax > 0) {
      tax = Math.min(goldTax, S.gold);
      S.gold -= tax;
      addLog('tax', t('log.tax'), '−' + tax, 'bad', () => t('log.tax'));
      sfx('error');
    }

    addLog('clear', t('log.clear'), '+' + comma(reward + bonus + interest), 'good', () => t('log.clear'));
    if (interest) addLog('interest', t('log.interest', { g: comma(interest) }), '+' + comma(interest), 'good',
      () => t('log.interest', { g: comma(interest) }));

    // 업적 트래커
    if (r.type === 'boss') {
      if ((S.run.bossRerolls || 0) === 0) S.run.noRerollBoss = true;
      S.run.bestHandsLeft = Math.max(S.run.bestHandsLeft || 0, S.hands);
      if (S.gold === 0) S.run.zeroGoldNight = true;
    }
    S.run.legendary = Math.max(S.run.legendary || 0,
      S.relics.filter(rl => rl.rarity === 'legendary').length);

    sfx('roundClear');
    say('clear');
    if (r.type === 'boss') screenShake(2);
    renderAll();
    checkAchievements('clear');

    // 밤 5 보스 격파 → 승리 화면 + 엔드리스 선택
    const isFinalBaseRound = !S.endless && S.roundIndex >= (S.baseRoundCount || ROUNDS.length) - 1;
    if (isFinalBaseRound) {
      S.phase = 'endlessChoice';
      finishRun(true);
      say('clear');
      sfx('win');
      burstParticles($('table-message') || $('hud-score'), 30, 'gold');
      setTimeout(() => { S.endlessPending = true; showResult(true); }, 500);
      return;
    }

    if (S.roundIndex >= ROUNDS.length - 1) {
      // 엔드리스에서 데이터가 소진되면 다음 밤을 생성한다.
      if (S.endless) extendEndless();
      else { setTimeout(victory, 500); return; }
    }
    openShop(reward, bonus + interest, tax);
  }

  function gameOver() {
    S.phase = 'over';
    finishRun(false);
    say('fail');
    sfx('lose');
    screenShake(2);
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
      ascension: S.ascension,
      date: new Date().toISOString()
    };
    const isNew = S.totalScore > num(prev.score, 0);
    persistBest(best);

    S.progress.runs = num(S.progress.runs, 0) + 1;
    if (won) {
      S.progress.wins = num(S.progress.wins, 0) + 1;
      S.run.winAscension = S.ascension;
      if (S.ascension >= S.ascensionMax && S.ascensionMax < 5) {
        S.ascensionMax = Math.min(5, S.ascension + 1);
      }
    }
    S.progress.bestNight = Math.max(num(S.progress.bestNight, 0), S.night);
    S.progress.bestHand = Math.max(num(S.progress.bestHand, 0), S.run.bestHand);
    S.progress.totalScore = Math.max(num(S.progress.totalScore, 0), S.totalScore);
    S.progress.endlessBest = Math.max(num(S.progress.endlessBest, 0), S.endless ? S.night : 0);
    S.endlessBest = num(S.progress.endlessBest, 0);
    persistProgress();

    S.lastResult = {
      won: won,
      score: S.totalScore,
      night: S.night,
      round: S.roundNum,
      gold: S.gold,
      ascension: S.ascension,
      endless: S.endless,
      isNew: isNew
    };
    checkAchievements('run');
    renderTitleBest();
  }

  /* ══════════════════════════════ 13. 상점 ══════════════════════════════ */

  /** 상점 할인 (유물 haggler_bill: ceil(price × (1 − 25%))) */
  function shopDiscountPct() {
    let pct = 0;
    S.relics.forEach(relic => {
      if (relic.effect_type !== 'shop_discount') return;
      if (!conditionMet(relic.condition, buildContext(S.selectedHand))) return;
      pct += num(relic.value, 0);
    });
    return clamp(pct, 0, 90);
  }

  function shopPrice(def) {
    const base = num(def && def.cost, 0);
    const pct = shopDiscountPct();
    if (!pct) return Math.max(0, Math.round(base));
    return Math.max(1, Math.ceil(base * (1 - pct / 100)));
  }

  function shopRerollCost() {
    const base = num(S.shop ? S.shop.rerollCost : num(DATA.meta.shop_reroll_cost, 3), 3);
    const delta = num(ascensionDef(S.ascension).shop_cost_delta, 0);
    return Math.max(0, base + delta);
  }

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
    syncBgmMode();
    say('buy');
  }

  function renderShop() {
    if (!S.shop) return;
    const shop = S.shop;
    const discount = shopDiscountPct();

    $('shop-title').textContent = shop.clearedBoss ? t('shop.titleBoss') : t('shop.title');
    let rewardText = t('shop.reward', { g: comma(shop.reward) });
    if (shop.bonus) rewardText += ' · ' + t('shop.bonus', { b: comma(shop.bonus) });
    if (shop.tax) rewardText += ' · ' + t('shop.tax', { t: comma(shop.tax) });
    if (discount) rewardText += ' · ' + t('shop.discount', { p: discount });
    $('shop-reward').textContent = rewardText;
    $('shop-gold').textContent = comma(S.gold);

    const rerollBtn = $('btn-shop-reroll');
    const costNode = rerollBtn.querySelector('.cost');
    if (costNode) costNode.textContent = S.shopFree > 0 ? t('shop.freeReroll') : ('◎ ' + shopRerollCost());
    rerollBtn.disabled = S.shopFree <= 0 && S.gold < shopRerollCost();
    $('btn-next-label').textContent = (shop.clearedBoss || S.endless) ? t('shop.next') : t('shop.nextRound');

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
      ? rarityLabel(def.rarity)
      : t('ui.charms')));
    card.appendChild(top);

    card.appendChild(el('div', 'sc-name', dname(def)));
    if (kind === 'relic') {
      card.appendChild(el('div', 'sc-trigger', triggerLabel(def.trigger)));
    }
    card.appendChild(el('p', 'sc-desc', ddesc(def)));
    if (kind === 'relic' && def.condition && def.condition !== 'always') {
      card.appendChild(el('div', 'sc-cond', '◇ ' + condLabel(def.condition)));
    }

    const price = shopPrice(def);
    const buy = el('button', 'sc-buy');
    const full = kind === 'relic' ? S.relics.length >= MAX_RELICS : S.charms.length >= MAX_CHARMS;
    buy.textContent = '◎ ' + comma(price);
    if (price < num(def.cost, price)) buy.classList.add('is-discounted');
    buy.disabled = entry.bought || full || S.gold < price;
    buy.addEventListener('click', (e) => {
      e.stopPropagation();
      if (kind === 'relic') buyRelic(index);
      else buyCharm(index);
    });
    card.appendChild(buy);

    return card;
  }

  function noteRelicSeen(id) {
    if (!id) return;
    if (!Array.isArray(S.progress.relicSeen)) S.progress.relicSeen = [];
    if (S.progress.relicSeen.indexOf(id) < 0) {
      S.progress.relicSeen.push(id);
      persistProgress();
    }
  }

  function buyRelic(index) {
    const entry = S.shop && S.shop.relics[index];
    if (!entry || entry.bought) return;
    if (S.relics.length >= MAX_RELICS) { toast(t('toast.relicsFull'), true); sfx('error'); return; }
    const price = shopPrice(entry.def);
    if (S.gold < price) { toast(t('toast.notEnoughGold'), true); sfx('error'); return; }

    S.gold -= price;
    entry.bought = true;
    const owned = Object.assign({}, entry.def, { uid: S.uid++ });
    S.relics.push(owned);
    noteRelicSeen(owned.id);
    if (owned.rarity === 'legendary') {
      S.run.legendary = Math.max(S.run.legendary || 0, S.relics.filter(rl => rl.rarity === 'legendary').length);
      sfx('playRelicTrigger');
    }
    addLog('relic', t('log.relic', { name: dname(entry.def) }), '−' + comma(price), '',
      () => t('log.relic', { name: dname(entry.def) }));
    toast(t('toast.bought', { name: dname(entry.def), g: comma(price) }));
    sfx('buy');
    renderShop();
    renderAll();
    checkAchievements('shop');
  }

  function buyCharm(index) {
    const entry = S.shop && S.shop.charms[index];
    if (!entry || entry.bought) return;
    if (S.charms.length >= MAX_CHARMS) { toast(t('toast.charmsFull'), true); sfx('error'); return; }
    const price = shopPrice(entry.def);
    if (S.gold < price) { toast(t('toast.notEnoughGold'), true); sfx('error'); return; }

    S.gold -= price;
    entry.bought = true;
    S.charms.push(Object.assign({}, entry.def, { uid: S.uid++ }));
    addLog('charm', t('log.charm', { name: dname(entry.def) }), '−' + comma(price), '',
      () => t('log.charm', { name: dname(entry.def) }));
    toast(t('toast.bought', { name: dname(entry.def), g: comma(price) }));
    sfx('buy');
    renderShop();
    renderAll();
  }

  function shopReroll() {
    if (!S.shop) return;
    const free = S.shopFree > 0;
    const cost = shopRerollCost();
    if (!free && S.gold < cost) { toast(t('toast.notEnoughGold'), true); sfx('error'); return; }
    if (free) S.shopFree -= 1;
    else S.gold -= cost;

    const ownedRelicIds = S.relics.map(r => r.id);
    const pool = DATA.relics.filter(r => ownedRelicIds.indexOf(r.id) < 0);
    S.shop.relics = pickWeightedRelics(pool, num(DATA.meta.shop_relic_offers, 3)).map(r => ({ def: r, bought: false }));

    const charmOffers = [];
    for (let i = 0; i < num(DATA.meta.shop_charm_offers, 2); i++) {
      const pick = DATA.charms[rnd(DATA.charms.length)];
      if (pick) charmOffers.push({ def: pick, bought: false });
    }
    S.shop.charms = charmOffers;

    toast(free ? t('toast.freeReroll') : t('toast.shopReroll', { c: cost }));
    sfx('reroll');
    renderShop();
    renderHUD();
  }

  function closeShop() {
    $('overlay-shop').classList.add('hidden');
    S.shop = null;
    S.phase = 'idle';
    S.roundIndex += 1;
    if (S.endless && S.roundIndex >= ROUNDS.length) extendEndless();
    if (S.roundIndex >= ROUNDS.length) {
      victory();
      return;
    }
    if (S.endless && S.roundIndex === (S.baseRoundCount || 0)) {
      addLog('endless', t('log.endless', { n: num((DATA.endless || {}).start_night, 6) }), '', 'good',
      () => t('log.endless', { n: num((DATA.endless || {}).start_night, 6) }));
    }
    startRound();
  }

  /* ── 엔드리스 밤 생성기 ── */

  function extendEndless() {
    const e = (DATA && DATA.endless) || {};
    let lastNight = 0;
    ROUNDS.forEach(r => { if (num(r.night, 0) > lastNight) lastNight = num(r.night, 0); });
    const n = Math.max(lastNight + 1, num(e.start_night, 6));
    const startNight = num(e.start_night, 6);
    const k = Math.max(0, n - startNight);
    const growth = num(e.target_growth_per_night, 1.28);
    const base = num(e.base_target, 6500) * Math.pow(growth, k);
    const perNight = Math.max(1, num(e.rounds_per_night, 3));
    const rotation = (Array.isArray(e.boss_rotation) && e.boss_rotation.length) ? e.boss_rotation : CURSE_IDS;
    const bossCurse = rotation[k % rotation.length];
    const mults = e.round_type_target_mult || { normal: 1, elite: 1.08, boss: 1 };
    const bossLabel = curseName(bossCurse);
    const nameKo = String(e.night_name_template_ko || '{n}번째 밤 — {boss}').replace('{n}', n).replace('{boss}', bossLabel);
    const nameEn = String(e.night_name_template_en || 'Night {n} — {boss}').replace('{n}', n).replace('{boss}', dname({ name_ko: bossLabel, name_en: (CURSE_INFO[bossCurse] ? CURSE_INFO[bossCurse].en.name : bossCurse) }));

    for (let r = 1; r <= perNight; r++) {
      const type = r === perNight ? 'boss' : (r === perNight - 1 ? 'elite' : 'normal');
      const round = {
        round: r,
        type: type,
        target_score: Math.round(base * num(mults[type], 1)),
        reward_gold: num(e.reward_gold_base, 14) + num(e.reward_gold_growth, 2) * k,
        hands_allowed: num(e.hands_allowed, 3),
        rerolls_per_hand: num(e.rerolls_per_hand, 2),
        boss_curse_id: type === 'boss' ? bossCurse : null,
        boss_name_ko: type === 'boss' ? bossLabel : '',
        boss_desc_ko: type === 'boss' ? curseDesc(bossCurse) : '',
        boss_name_en: '',
        boss_desc_en: '',
        night: n,
        night_name_ko: nameKo,
        night_name_en: nameEn,
        endless: true,
        _index: ROUNDS.length
      };
      ROUNDS.push(round);
    }
    checkAchievements('endless');
    return ROUNDS;
  }

  /** 밤 5 보스 격파 후 엔드리스로 이어서 간다. */
  function continueEndless() {
    $('overlay-result').classList.add('hidden');
    S.endless = true;
    S.endlessPending = false;
    S.run.endlessNight = Math.max(S.run.endlessNight || 0, S.night);
    S.endlessStart = num((DATA.endless || {}).start_night, 6);
    S.baseRoundCount = S.baseRoundCount || ROUNDS.length;
    if (S.roundIndex < S.baseRoundCount - 1) S.roundIndex = S.baseRoundCount - 1;
    S.roundIndex += 1;
    if (S.roundIndex >= ROUNDS.length) extendEndless();
    S.phase = 'idle';
    addLog('endless', t('log.endless', { n: S.night + 1 }), '', 'good', () => t('log.endless', { n: S.night + 1 }));
    toast(t('endless.warning'));
    startRound();
  }

  function endRunHere() {
    $('overlay-result').classList.add('hidden');
    S.endlessPending = false;
    S.phase = 'won';
    showScreen('title');
  }

  /* ══════════════════════════════ 14. 부적 ══════════════════════════════ */

  const TARGET_CHARMS = {
    flip_dice: 'flip',
    hold_dice: 'hold',
    set_pip: 'setpip'
  };

  function charmUsable(charm) {
    if (!charm) return false;
    const t0 = charm.effect_type;
    if (t0 === 'flip_dice' || t0 === 'hold_dice' || t0 === 'set_pip' || t0 === 'all_plus_one' || t0 === 'parity_shift') {
      return S.phase === 'rolled';
    }
    if (t0 === 'curse_soften' || t0 === 'curse_nullify') {
      return !!(S.mods && S.mods.ids.length) && !S.curseNull;
    }
    if (t0 === 'shop_free_reroll') return S.phase === 'shop';
    return S.phase === 'rolled' || S.phase === 'idle';
  }

  function activateCharm(index) {
    const charm = S.charms[index];
    if (!charm) return;

    // 함정: 대상 선택 모드 해제
    if (S.focusCharm >= 0) { cancelFocus(); return; }

    if (charm.effect_type === 'shop_free_reroll') {
      if (S.phase !== 'shop') {
        toast(t('toast.diceFirst'), true);
        sfx('error');
        return;
      }
    } else if (S.phase !== 'rolled') {
      if (S.phase === 'scoring') return;
      toast(t('toast.diceFirst'), true);
      sfx('error');
      return;
    }

    const targetMode = TARGET_CHARMS[charm.effect_type];
    if (targetMode) {
      S.focusCharm = index;
      S.focusMode = targetMode;
      renderTableMessage();
      renderDice();
      renderCharms();
      return;
    }

    applyCharmEffect(charm, -1);
  }

  function consumeCharm(index, charm) {
    S.charms.splice(index, 1);
    S.focusCharm = -1;
    S.focusMode = '';
    toast(t('toast.charmUsed', { name: dname(charm) }));
    sfx('playCharm');
    S.selectedHand = bestHand();
    renderAll();
    checkAchievements('charm');
  }

  function applyCharmEffect(charm, targetIndex) {
    const index = S.charms.indexOf(charm);
    const v = num(charm.value, 1);
    const type = charm.effect_type;

    if (type === 'flip_dice') {
      const d = S.dice[targetIndex];
      if (!d) { cancelFocus(); return; }
      d.value = 7 - d.value;
      d.held = false;
      if (index >= 0) consumeCharm(index, charm);
      return;
    }

    if (type === 'all_plus_one') {
      S.roundPipBonus += v;
      S.dice.forEach(d => { d.value = clamp(d.value + v, 1, 6); });
    } else if (type === 'parity_shift') {
      // 이번 라운드 홀수 눈금 +value (최대 6)
      S.roundParityBonus = Math.max(S.roundParityBonus, v);
      S.dice.forEach(d => { if (d.value % 2 === 1) d.value = clamp(d.value + v, 1, 6); });
      if (index >= 0) consumeCharm(index, charm);
      return;
    } else if (type === 'hold_dice') {
      const d = S.dice[targetIndex];
      if (!d) { cancelFocus(); return; }
      d.held = true;
      // 저주로 막힌 눈금이어도 이 부적은 예외로 잠근다.
      S.focusCharm = -1;
      S.focusMode = '';
      if (index >= 0) consumeCharm(index, charm);
      toast(t('toast.pinned'));
      return;
    } else if (type === 'set_pip') {
      const d = S.dice[targetIndex];
      if (!d) { cancelFocus(); return; }
      d.value = clamp(num(charm.value, 6), 1, 6);
      d.held = false;
      S.focusCharm = -1;
      S.focusMode = '';
      if (index >= 0) consumeCharm(index, charm);
      toast(t('toast.pipSet', { v: d.value }));
      return;
    } else if (type === 'reroll_plus') {
      S.roundBonusRerolls += num(charm.value, 1);
      S.rerollsMax = computeRerolls();
      S.rerolls += num(charm.value, 1);
    } else if (type === 'hand_plus') {
      S.hands += num(charm.value, 1);
      S.handsMax += num(charm.value, 1);
    } else if (type === 'temp_mult') {
      S.tempMult += num(charm.value, 1);
      S.tempMultLabel = dname(charm);
    } else if (type === 'temp_chips') {
      S.tempChips += num(charm.value, 0);
      S.tempChipsLabel = dname(charm);
    } else if (type === 'curse_soften') {
      if (!S.mods || !S.mods.ids.length) {
        toast(t('toast.noCharmTarget'), true);
        sfx('error');
        return;
      }
      S.curseSoft = true;
      recomputeRoundRerolls();
      toast(t('toast.curseSoftened', { name: curseName(S.mods.ids[0]) }));
      sfx('curse');
    } else if (type === 'curse_nullify') {
      if (!S.mods || !S.mods.ids.length) {
        toast(t('toast.noCharmTarget'), true);
        sfx('error');
        return;
      }
      const nulledCurse = curseName(S.mods.ids[0]);
      S.curseNull = true;
      recomputeRoundRerolls();
      S.run.curseNull = (S.run.curseNull || 0) + 1;
      S.progress.curseNullified = num(S.progress.curseNullified, 0) + 1;
      persistProgress();
      toast(t('toast.curseNullified', { name: nulledCurse }));
      addLog('curseNullified', t('log.curseNullified', { name: curseName(S.mods.ids[0]) }), '', 'good',
        () => t('log.curseNullified', { name: curseName(S.mods.ids[0]) }));
      sfx('curse');
    } else if (type === 'gold_gain') {
      S.gold += num(charm.value, 0);
      floatAt($('hud-gold'), '+' + comma(num(charm.value, 0)), 'good');
      sfx('coins', 3);
    } else if (type === 'shop_free_reroll') {
      S.shopFree += 1;
      toast(t('toast.freeReroll'));
      sfx('buy');
    }

    if (index >= 0) consumeCharm(index, charm);
  }

  /** 대상 선택 모드에서 주사위 클릭 */
  function applyCharmTarget(index) {
    const charm = S.charms[S.focusCharm];
    if (!charm) { cancelFocus(); return; }
    if (!S.dice[index]) { cancelFocus(); return; }
    applyCharmEffect(charm, index);
  }

  function cancelFocus() {
    S.focusCharm = -1;
    S.focusMode = '';
    renderTableMessage();
    renderDice();
    renderCharms();
  }

  function charmTargetHint() {
    if (S.focusMode === 'hold') return t('msg.focusPin');
    if (S.focusMode === 'setpip') return t('msg.focusPip');
    return t('msg.focusFlip');
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
        addLog('sell', t('log.sell', { name: dname(relic) }), '+' + price, 'good',
          () => t('log.sell', { name: dname(relic) }));
        toast(t('toast.sold', { name: dname(relic), g: price }));
        sfx('coins', 2);
        renderAll();
      }
    );
  }

  /* ══════════════════════════════ 15b. 업적 · 메타 진행 ══════════════════════════════ */

  function achList() { return (DATA && DATA.achievements) || []; }
  function achDef(id) { return achList().find(a => a.id === id) || null; }

  /** 업적 condition_type → 현재 값 */
  function achievementProgress(a) {
    if (!a) return 0;
    const run = S.run || {};
    switch (a.condition_type) {
      case 'wins': return num(S.progress.wins, 0);
      case 'yahtzee_scored': return num(run.yahtzee, 0);
      case 'single_hand_score': return num(run.bestHand, 0);
      case 'ascension_clear': return num(run.winAscension, -1) >= 0 ? num(run.winAscension, 0) : 0;
      case 'relic_collection': return (S.progress.relicSeen || []).length;
      case 'boss_clear_no_reroll': return run.noRerollBoss ? 1 : 0;
      case 'win_with_zero_gold': return run.zeroGoldNight ? 1 : 0;
      case 'endless_night': return num(run.endlessNight, 0);
      case 'boss_clear_hands_left': return num(run.bestHandsLeft, 0);
      case 'curse_nullified': return num(run.curseNull, 0);
      case 'legendary_held': return num(run.legendary, 0);
      case 'total_score': return num(S.totalScore, 0);
      default: return 0;
    }
  }

  function achUnlocked(a) { return !!(a && S.progress.unlocked && S.progress.unlocked[a.id]); }

  function unlockAchievement(a) {
    if (!a || achUnlocked(a)) return false;
    S.progress.unlocked[a.id] = new Date().toISOString();
    persistProgress();
    addLog('achievement', t('log.achievement', { name: dname(a) }), '', 'good',
      () => t('log.achievement', { name: dname(a) }));
    zaToast(t('toast.achievement', { name: dname(a) }), a.icon);
    sfx('playAchievement');
    steamUnlock(a);
    refreshAchievementModal();
    renderTitleProgress();
    return true;
  }

  /** Electron/Steamworks 업적 훅 (preload.js 의 window.cpSteam) */
  function steamUnlock(a) {
    if (!a) return;
    const apiName = 'ACH_' + String(a.id).toUpperCase();
    try {
      if (window.cpSteam && typeof window.cpSteam.achievement === 'function') {
        window.cpSteam.achievement(apiName);
      } else if (window.CPSteam && typeof window.CPSteam.unlockAchievement === 'function') {
        window.CPSteam.unlockAchievement(apiName);
      }
    } catch (e) { /* Steam 미연결 시 무시 */ }
  }

  function checkAchievements(reason) {
    if (!DATA) return;
    let unlocked = 0;
    achList().forEach(a => {
      if (achUnlocked(a)) return;
      const value = achievementProgress(a);
      if (value >= num(a.target_value, 1)) {
        if (unlockAchievement(a)) unlocked += 1;
      }
    });
    return unlocked;
  }

  function achievementStats() {
    const list = achList();
    const got = list.filter(achUnlocked).length;
    return { total: list.length, got: got, pct: list.length ? Math.round((got / list.length) * 100) : 0 };
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

    const asc = $('hud-ascension');
    if (asc) {
      if (S.ascension > 0) {
        asc.classList.remove('hidden');
        asc.textContent = 'A' + S.ascension;
        asc.title = dname(ascensionDef(S.ascension));
      } else {
        asc.classList.add('hidden');
      }
    }
    const endlessBadge = $('hud-endless');
    if (endlessBadge) endlessBadge.classList.toggle('hidden', !S.endless);

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
    const baseNights = 5;
    const totalNights = S.endless ? Math.max(baseNights, S.night + 1) : baseNights;
    const shown = Math.min(totalNights, 8);
    const start = Math.max(1, totalNights - shown + 1);
    for (let n = start; n <= totalNights; n++) {
      const pip = el('div', 'nt-pip' + (n % baseNights === 0 ? ' boss-pip' : ''));
      if (n < S.night) pip.classList.add('done');
      if (n === S.night) pip.classList.add('current');
      if (n > baseNights) pip.classList.add('endless-pip');
      box.appendChild(pip);
    }
    const label = S.endless
      ? t('endless.night', { n: S.night })
      : (t('hud.night') + ' ' + S.night + ' / ' + baseNights);
    box.appendChild(el('span', 'nt-label', label));
  }

  function renderBoss() {
    const r = currentRound();
    const panel = $('boss-panel');
    if (!r || !(S.curseIds && S.curseIds.length)) {
      if (panel) panel.classList.add('hidden');
      return;
    }
    panel.classList.remove('hidden');
    const nameBox = $('boss-name');
    const descBox = $('boss-desc');
    nameBox.innerHTML = '';
    descBox.innerHTML = '';

    S.curseIds.forEach((id, i) => {
      const isBase = i === 0 && r.boss_curse_id === id;
      const name = isBase
        ? ((S.lang === 'ko' ? r.boss_name_ko : r.boss_name_en) || curseName(id))
        : curseName(id);
      const desc = isBase
        ? ((S.lang === 'ko' ? r.boss_desc_ko : r.boss_desc_en) || curseDesc(id))
        : curseDesc(id);
      const row = el('div', 'boss-curse-row' + (i > 0 ? ' extra' : ''));
      row.appendChild(el('div', 'boss-curse-name', '☠ ' + name));
      row.appendChild(el('div', 'boss-curse-desc', desc));
      nameBox.appendChild(row);
    });

    const scale = $('boss-scale');
    if (scale) scale.classList.remove('hidden');

    const mods = activeMods();
    if (S.curseNull) descBox.appendChild(el('div', 'boss-note good', t('toast.curseNullified', { name: curseName(S.mods.ids[0]) })));
    else if (S.curseSoft) descBox.appendChild(el('div', 'boss-note', t('toast.curseSoftened', { name: curseName(S.mods.ids[0]) })));
    if (mods.minHandRank) descBox.appendChild(el('div', 'boss-note', t('toast.handLocked')));
    if (mods.firstRerollCost > 1) descBox.appendChild(el('div', 'boss-note', t('toast.firstRerollDouble')));
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
      if (relic.rarity === 'legendary') slot.classList.add('is-legendary');

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
      const slot = el('button', 'slot charm-slot effect-' + charm.effect_type);
      slot.appendChild(el('span', 'slot-icon', charm.icon || '✧'));
      slot.appendChild(el('span', 'slot-name', dname(charm)));
      if (!charmUsable(charm)) slot.classList.add('is-disabled');
      if (S.focusCharm === i) slot.classList.add('is-focused');

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
      die.appendChild(el('span', 'die-seal', '✦'));
    }

    const mods = activeMods();
    if (S.dice[index] && S.dice[index].value && mods.pipMap[S.dice[index].value] != null) {
      die.appendChild(el('span', 'die-curse', '→' + mods.pipMap[S.dice[index].value]));
    }
    if (S.dice[index] && S.dice[index].value && holdBlocked(S.dice[index].value)) {
      die.classList.add('is-locked');
    }
    if (S.dice[index] && S.dice[index].value && mods.pipVoid && S.dice[index].value === mods.pipVoid) {
      die.classList.add('is-voided');
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
        if (minHandRank() && HAND_RANK[id] < minHandRank()) {
          card.classList.add('is-cursed');
          card.appendChild(el('span', 'hc-curse', '☠'));
        }
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

  const CHIP_KINDS = ['add_chips', 'add_chips_per_reroll', 'add_chips_per_gold'];
  const MULT_KINDS = ['add_mult', 'add_mult_per_hands_left', 'add_mult_per_charm'];

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
      box.appendChild(el('div', 'bd-empty', minHandRank() ? t('toast.handLocked') : t('bd.noHand')));
      return;
    }
    const bd = computeScore(S.selectedHand);
    if (!bd) {
      box.appendChild(el('div', 'bd-empty', minHandRank() ? t('toast.handLocked') : t('bd.noHand')));
      return;
    }

    const head = el('div', 'bd-hand');
    head.appendChild(el('span', 'bd-hand-name', dname(bd.hand)));
    head.appendChild(el('span', 'bd-hand-chips', comma(bd.baseChips) + ' × ' + comma(bd.baseMult)));
    box.appendChild(head);

    box.appendChild(makeBdRow('chips', t('bd.base'), comma(bd.baseChips)));

    bd.rows.forEach(row => {
      if (CHIP_KINDS.indexOf(row.kind) < 0) return;
      const rowEl = makeBdRow('chips', (row.relic.icon ? row.relic.icon + ' ' : '') + dname(row.relic),
        row.met ? '+' + comma(row.value) : t('bd.unmet'));
      if (!row.met) rowEl.classList.add('cond-off');
      box.appendChild(rowEl);
    });

    if (bd.tempChips) {
      box.appendChild(makeBdRow('chips', '🜏 ' + (bd.tempChipsLabel || t('bd.charmChips')), '+' + comma(bd.tempChips)));
    }

    box.appendChild(el('div', 'bd-sep'));

    box.appendChild(makeBdRow('mult', t('bd.baseMult'), comma(bd.baseMult)));

    bd.rows.forEach(row => {
      if (MULT_KINDS.indexOf(row.kind) < 0) return;
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
      box.appendChild(makeBdRow('curse', curseName(note.type), (note.delta > 0 ? '+' : '') + note.delta + ' (min 1)'));
    });
    if (S.curseNull) box.appendChild(makeBdRow('curse', t('ui.curse'), t('toast.curseNullified', { name: curseName(S.mods.ids[0]) })));
    else if (S.curseSoft) box.appendChild(makeBdRow('curse', t('ui.curse'), t('toast.curseSoftened', { name: curseName(S.mods.ids[0]) })));

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
      let label = item.text;
      if (item.render) { try { label = item.render(); } catch (e) { label = item.text; } }
      row.appendChild(el('span', 'lg-t', label));
      if (item.value) row.appendChild(el('span', 'lg-v', item.value));
      box.appendChild(row);
    });
  }

  const LOG_ICONS = {
    roundStart: '☾', score: '✦', clear: '❖', relic: '⚱', charm: '🜏', sell: '↩', curse: '☠', tax: '☠'
  };

  function addLog(kind, text, value, tone, render) {
    S.log.unshift({
      kind: kind, text: text, value: value || '', tone: tone || '',
      icon: LOG_ICONS[kind] || '·',
      render: (typeof render === 'function') ? render : null
    });
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
      node.textContent = charmTargetHint();
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
    if (!node) return;
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

  /** 업적 전용 토스트 (상단, 아이콘 + 이름) */
  function zaToast(msg, icon) {
    const node = $('ach-toast');
    if (!node) { toast(msg); return; }
    node.innerHTML = '';
    node.appendChild(el('span', 'at-icon', icon || '✦'));
    const body = el('div', 'at-body');
    body.appendChild(el('div', 'at-kicker', t('ach.title')));
    body.appendChild(el('div', 'at-name', msg));
    node.appendChild(body);
    node.classList.remove('hidden');
    void node.offsetWidth;
    node.classList.add('show');
    setTimeout(() => {
      node.classList.remove('show');
      setTimeout(() => node.classList.add('hidden'), 260);
    }, 3200);
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
    if (modal) modal.classList.toggle('defeat', !won);

    $('result-ornament').textContent = won ? '✦' : '☠';
    $('result-title').textContent = won ? t('result.winTitle') : t('result.loseTitle');
    $('result-sub').textContent = won ? t('result.winSub') : t('result.loseSub');

    const stats = $('result-stats');
    stats.innerHTML = '';
    const rows = [
      [t('result.score'), comma(res.score)],
      [t('result.night'), t('hud.night') + ' ' + res.night + ' · ' + res.round + 'R'],
      [t('result.gold'), comma(res.gold)]
    ];
    if ((res.ascension || S.ascension) > 0) rows.push([t('result.ascension'), 'A' + (res.ascension || S.ascension)]);
    rows.forEach(pair => {
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

    // 엔드리스 선택 (밤 5 보스 격파 직후)
    const endlessBox = $('result-endless');
    if (endlessBox) {
      const show = !!S.endlessPending;
      endlessBox.classList.toggle('hidden', !show);
      if (show) {
        $('result-title').textContent = t('result.winTitle');
        $('result-sub').textContent = t('endless.sub');
        const bestNight = $('result-endless-best');
        if (bestNight) bestNight.textContent = t('endless.best', { night: Math.max(num(S.endlessBest, 0), S.night) });
      }
    }

    const actions = document.querySelector('#overlay-result .result-actions');
    if (actions) actions.classList.toggle('hidden', !!S.endlessPending);

    $('overlay-result').classList.remove('hidden');
    if (S.endlessPending) sfx('playAchievement');
  }

  /* ══════════════════════════════ 18. 룰북 ══════════════════════════════ */

  function buildRules() {
    const handsBox = $('rules-hands');
    if (!handsBox) return;
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
    if (cursesBox) {
      cursesBox.innerHTML = '';
      CURSE_IDS.forEach(id => {
        const card = el('div', 'rc-card');
        card.appendChild(el('div', 'rc-name', curseName(id)));
        card.appendChild(el('div', 'rc-desc', curseDesc(id)));
        cursesBox.appendChild(card);
      });
    }

    // 조건 사전
    const condBox = $('rules-conditions');
    if (condBox) {
      condBox.innerHTML = '';
      const conds = (DATA && DATA.schema && Array.isArray(DATA.schema.conditions))
        ? DATA.schema.conditions
        : Object.keys(CONDITION_INFO);
      conds.forEach(key => {
        const row = el('div', 'bd-row');
        row.appendChild(el('span', 'bd-k', condLabel(key)));
        row.appendChild(el('span', 'bd-v', key));
        condBox.appendChild(row);
      });
    }

    const src = $('rules-source');
    if (src) {
      src.textContent = t('rules.source') + ': ' + (S.dataSource === 'json' ? t('rules.sourceJson') : t('rules.sourceFallback'))
        + ' · v' + ((DATA && DATA.meta && DATA.meta.version) || '1.2.0');
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
    const node = $('screen-' + name);
    if (node) node.classList.add('is-active');
    if (name === 'title') {
      renderTitleBest();
      renderTitleProgress();
      renderAscensionPicker();
      syncBgmMode();
    }
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

  /** 타이틀 하단: 업적 수집률 · 엔드리스 최고 밤 */
  function renderTitleProgress() {
    const box = $('title-progress');
    if (!box) return;
    box.innerHTML = '';
    const st = achievementStats();
    box.appendChild(el('span', 'tp-ach', t('ach.progress', { value: st.got, target: st.total })));
    if (num(S.endlessBest, 0) > 0) {
      box.appendChild(el('span', 'best-dot', '·'));
      box.appendChild(el('span', 'tp-endless', t('title.endlessBest', { night: S.endlessBest })));
    }
  }

  /** 승천 단계 선택기 */
  function renderAscensionPicker() {
    const box = $('asc-chips');
    if (!box) return;
    box.innerHTML = '';
    for (let lv = 0; lv <= 5; lv++) {
      const locked = lv > S.ascensionMax;
      const chip = el('button', 'asc-chip' + (lv === S.ascension ? ' is-active' : '') + (locked ? ' is-locked' : ''));
      chip.dataset.level = String(lv);
      chip.textContent = locked ? '🔒' : ('A' + lv);
      chip.disabled = locked;
      chip.title = locked ? t('ascension.locked', { level: lv }) : dname(ascensionDef(lv));
      chip.addEventListener('click', () => {
        if (locked) { toast(t('ascension.locked', { level: lv }), true); sfx('error'); return; }
        S.ascension = lv;
        persistSettings();
        renderAscensionPicker();
        sfx('select');
      });
      box.appendChild(chip);
    }
    const desc = $('asc-desc');
    if (desc) {
      const a = ascensionDef(S.ascension);
      desc.innerHTML = '';
      desc.appendChild(el('b', '', 'A' + S.ascension + ' · ' + dname(a)));
      desc.appendChild(el('span', '', ddesc(a)));
      if (S.ascensionMax < 5) desc.appendChild(el('span', 'asc-unlock', t('ascension.unlockHint', { n: S.ascensionMax, next: Math.min(5, S.ascensionMax + 1) })));
    }
  }

  /* ══════════════════════════════ 20. 정적 텍스트 ══════════════════════════════ */

  function applyI18n() {
    document.documentElement.lang = S.lang;
    if (window.CursedI18n) window.CursedI18n.setLocale(S.lang);
    document.querySelectorAll('[data-i18n]').forEach(node => {
      const key = node.dataset.i18n;
      const val = t(key);
      if (val != null) node.textContent = val;
    });
    document.title = S.lang === 'ko' ? 'CURSED PAWN — 영혼 전당포' : 'CURSED PAWN — The Soul Pawnshop';

    const langBtn = $('btn-lang');
    if (langBtn) langBtn.textContent = S.lang === 'ko' ? 'KO' : 'EN';
    const soundBtn = $('btn-sound');
    if (soundBtn) soundBtn.textContent = S.sound ? '♪' : '✕';
    const tLang = $('btn-title-lang');
    if (tLang) tLang.textContent = S.lang === 'ko' ? '한국어 / EN' : 'KO / English';
    const tSound = $('btn-title-sound');
    if (tSound) tSound.textContent = (S.sound ? '♪ ' : '✕ ') + (S.lang === 'ko' ? '사운드' : 'Sound');
    const ver = $('title-version');
    if (ver) ver.textContent = 'v' + ((DATA && DATA.meta && DATA.meta.version) || '1.2.0') + ' · STEAM BUILD';
    renderSettings();
  }

  function setLang(lang) {
    S.lang = lang === 'en' ? 'en' : 'ko';
    if (window.CursedI18n) window.CursedI18n.setLocale(S.lang);
    persistSettings();
    applyI18n();
    buildRules();
    renderAll();
    renderTitleBest();
    renderTitleProgress();
    renderAscensionPicker();
    if (S.shop) renderShop();
    renderLog();
    say('round');
    refreshCodexModal();
    refreshAchievementModal();
    if (S.lastResult && !$('overlay-result').classList.contains('hidden')) showResult(S.lastResult.won);
    if (S.screen === 'title') renderDice();
  }

  function toggleSound() {
    S.sound = !S.sound;
    applyAudioSettings({ noStart: true });
    if (!S.sound) { try { if (window.CPSound && window.CPSound.stopBgm) window.CPSound.stopBgm(); } catch (e) {} }
    persistSettings();
    applyI18n();
    if (S.sound) {
      try { if (window.CPSound && window.CPSound.startBgm) window.CPSound.startBgm('table'); } catch (e) {}
      sfx('click');
    }
  }

  /** 게임 상태에 맞춰 BGM 모드를 바꾼다 (normal · shop · boss) */
  function syncBgmMode() {
    const SND = window.CPSound;
    if (!SND || !SND.setBgmMode) return;
    const r = currentRound();
    let mode = 'normal';
    if (S.phase === 'shop') mode = 'shop';
    else if (r && r.type === 'boss' && (S.screen === 'game')) mode = 'boss';
    try { SND.setBgmMode(mode); } catch (e) {}
  }

  function setBgm(on) {
    S.bgm = !!on;
    applyAudioSettings();
    if (!S.bgm) { try { if (window.CPSound && window.CPSound.stopBgm) window.CPSound.stopBgm(); } catch (e) {} }
    persistSettings();
    renderSettings();
  }

  function setVolume(v) {
    S.volume = clamp(Number(v) || 0, 0, 1);
    applyAudioSettings({ noStart: true });
    persistSettings();
    renderSettings();
  }

  /* ══════════════════════════════ 20b. 설정 패널 ══════════════════════════════ */

  function renderSettings() {
    const box = $('modal-settings');
    if (!box || box.classList.contains('hidden')) {
      const vol = $('vol-slider');
      if (vol) vol.value = String(Math.round(S.volume * 100));
      const lbl = $('vol-value');
      if (lbl) lbl.textContent = Math.round(S.volume * 100) + '%';
      return;
    }
    const bgm = $('btn-bgm');
    if (bgm) {
      bgm.textContent = S.bgm ? t('common.on') : t('common.off');
      bgm.classList.toggle('is-on', S.bgm);
    }
    const sfxBtn = $('btn-sfx');
    if (sfxBtn) {
      sfxBtn.textContent = S.sound ? t('common.on') : t('common.off');
      sfxBtn.classList.toggle('is-on', S.sound);
    }
    const vol = $('vol-slider');
    if (vol) vol.value = String(Math.round(S.volume * 100));
    const lbl = $('vol-value');
    if (lbl) lbl.textContent = Math.round(S.volume * 100) + '%';
    const ko = $('btn-set-ko');
    const en = $('btn-set-en');
    if (ko) ko.classList.toggle('is-active', S.lang === 'ko');
    if (en) en.classList.toggle('is-active', S.lang === 'en');
    const ver = $('settings-version');
    if (ver) ver.textContent = t('settings.version', { v: ((DATA && DATA.meta && DATA.meta.version) || '1.2.0') });
    const steam = $('settings-steam');
    if (steam) {
      const on = !!(window.cpSteam && window.cpSteam.available);
      steam.textContent = on ? t('steam.connected') : t('steam.offline');
      steam.classList.toggle('is-on', on);
    }
  }

  function openSettings() {
    renderSettings();
    $('modal-settings').classList.remove('hidden');
    renderSettings();
    sfx('click');
  }
  function closeSettings() { $('modal-settings').classList.add('hidden'); }

  /* ══════════════════════════════ 20c. 도감 (Compendium) ══════════════════════════════ */

  let codexTab = 'relics';
  let codexFilter = 'all';

  function seenRelic(id) { return (S.progress.relicSeen || []).indexOf(id) >= 0; }

  function codexCounts() {
    const relics = (DATA && DATA.relics) || [];
    const charms = (DATA && DATA.charms) || [];
    return {
      relics: relics.filter(r => seenRelic(r.id)).length,
      relicsTotal: relics.length,
      charmsTotal: charms.length,
      cursesTotal: CURSE_IDS.length
    };
  }

  function buildCodex() {
    const body = $('codex-body');
    if (!body) return;
    const tabs = $('codex-tabs');
    if (tabs) {
      tabs.querySelectorAll('.codex-tab').forEach(node => {
        node.classList.toggle('is-active', node.dataset.tab === codexTab);
      });
    }
    body.innerHTML = '';

    const c = codexCounts();
    const summary = $('codex-count');
    if (summary) {
      summary.textContent = codexTab === 'relics'
        ? t('codex.count', { n: c.relics + '/' + c.relicsTotal })
        : (codexTab === 'charms'
          ? t('codex.count', { n: c.charmsTotal })
          : t('codex.count', { n: c.cursesTotal }));
    }

    if (codexTab === 'relics') {
      const filters = $('codex-filters');
      if (filters) {
        filters.classList.remove('hidden');
        filters.querySelectorAll('.codex-filter').forEach(node => {
          node.classList.toggle('is-active', node.dataset.rarity === codexFilter);
        });
      }
      const list = (DATA.relics || []).filter(r => codexFilter === 'all' || r.rarity === codexFilter);
      const grid = el('div', 'codex-grid');
      list.forEach(relic => {
        grid.appendChild(makeCodexCard(relic, 'relic'));
      });
      body.appendChild(grid);
    } else if (codexTab === 'charms') {
      const filters = $('codex-filters');
      if (filters) filters.classList.add('hidden');
      const grid = el('div', 'codex-grid');
      (DATA.charms || []).forEach(charm => grid.appendChild(makeCodexCard(charm, 'charm')));
      body.appendChild(grid);
    } else if (codexTab === 'curses') {
      const filters = $('codex-filters');
      if (filters) filters.classList.add('hidden');
      const grid = el('div', 'codex-grid codex-curses');
      CURSE_IDS.forEach(id => {
        const card = el('article', 'codex-card curse');
        const head = el('div', 'cc-head');
        head.appendChild(el('span', 'cc-icon', '☠'));
        head.appendChild(el('span', 'cc-name', curseName(id)));
        card.appendChild(head);
        card.appendChild(el('p', 'cc-desc', curseDesc(id)));
        card.appendChild(el('div', 'cc-meta', (curseModifier(id).hold_block ? 'HOLD BLOCK' : '') + ' ' + id));
        grid.appendChild(card);
      });
      body.appendChild(grid);
    } else {
      const filters = $('codex-filters');
      if (filters) filters.classList.add('hidden');
      const grid = el('div', 'codex-grid');
      (DATA.ascensions || []).forEach(a => {
        const card = el('article', 'codex-card ascension' + (a.level === S.ascension ? ' is-current' : '') + (a.level > S.ascensionMax ? ' is-locked' : ''));
        const head = el('div', 'cc-head');
        head.appendChild(el('span', 'cc-icon', a.level > S.ascensionMax ? '🔒' : '✦'));
        head.appendChild(el('span', 'cc-name', 'A' + a.level + ' · ' + dname(a)));
        card.appendChild(head);
        card.appendChild(el('p', 'cc-desc', ddesc(a)));
        card.appendChild(el('div', 'cc-meta', '×' + a.target_mult));
        grid.appendChild(card);
      });
      body.appendChild(grid);
    }
  }

  function makeCodexCard(def, kind) {
    const locked = kind === 'relic' && !seenRelic(def.id);
    const card = el('article', 'codex-card ' + kind + ' rarity-' + (def.rarity || 'common') + (locked ? ' is-locked' : ''));
    const head = el('div', 'cc-head');
    head.appendChild(el('span', 'cc-icon', locked ? '❔' : (def.icon || '◆')));
    head.appendChild(el('span', 'cc-name', locked ? t('codex.locked') : dname(def)));
    card.appendChild(head);
    if (locked) {
      card.appendChild(el('p', 'cc-desc', t('codex.lockedHint')));
      return card;
    }
    card.appendChild(el('p', 'cc-desc', ddesc(def)));
    if (kind === 'relic') {
      const meta = el('div', 'cc-meta');
      meta.appendChild(el('span', 'cc-rarity', rarityLabel(def.rarity)));
      meta.appendChild(el('span', '', '◎ ' + num(def.cost, 0)));
      if (def.condition && def.condition !== 'always') meta.appendChild(el('span', 'cc-cond', '◇ ' + condLabel(def.condition)));
      card.appendChild(meta);
    }
    return card;
  }

  function openCodex(tab) {
    if (tab) codexTab = tab;
    buildCodex();
    $('modal-codex').classList.remove('hidden');
    sfx('click');
  }
  function closeCodex() { $('modal-codex').classList.add('hidden'); }
  function refreshCodexModal() {
    const box = $('modal-codex');
    if (box && !box.classList.contains('hidden')) buildCodex();
  }

  /* ══════════════════════════════ 20d. 업적 패널 ══════════════════════════════ */

  function buildAchievements() {
    const body = $('ach-body');
    if (!body) return;
    body.innerHTML = '';
    const st = achievementStats();
    const bar = $('ach-summary');
    if (bar) {
      bar.innerHTML = '';
      bar.appendChild(el('span', 'as-text', t('ach.progress', { value: st.got, target: st.total })));
      const track = el('div', 'as-track');
      const fill = el('div', 'as-fill');
      fill.style.width = st.pct + '%';
      track.appendChild(fill);
      bar.appendChild(track);
    }
    achList().forEach(a => {
      const got = achUnlocked(a);
      const card = el('article', 'ach-card' + (got ? ' is-unlocked' : ''));
      card.appendChild(el('span', 'ac-icon', got ? a.icon : '🔒'));
      const bodyBox = el('div', 'ac-body');
      bodyBox.appendChild(el('div', 'ac-name', dname(a)));
      bodyBox.appendChild(el('div', 'ac-desc', ddesc(a)));
      const value = Math.min(achievementProgress(a), num(a.target_value, 1));
      const target = num(a.target_value, 1);
      const prog = el('div', 'ac-progress');
      prog.appendChild(el('span', '', got ? t('ach.unlocked') : t('ach.locked')));
      if (!got && target > 1) prog.appendChild(el('b', '', comma(value) + ' / ' + comma(target)));
      bodyBox.appendChild(prog);
      card.appendChild(bodyBox);
      body.appendChild(card);
    });
    const steam = $('ach-steam');
    if (steam) {
      const on = !!(window.cpSteam && window.cpSteam.available);
      steam.textContent = on ? t('ach.steamSync') : t('ach.steamOffline');
      steam.classList.toggle('is-on', on);
    }
  }

  function openAchievements() {
    buildAchievements();
    $('modal-ach').classList.remove('hidden');
    sfx('click');
  }
  function closeAchievements() { $('modal-ach').classList.add('hidden'); }
  function refreshAchievementModal() {
    const box = $('modal-ach');
    if (box && !box.classList.contains('hidden')) buildAchievements();
  }

  /* ══════════════════════════════ 21. 이벤트 ══════════════════════════════ */

  function on(id, type, fn) {
    const node = $(id);
    if (node && node.addEventListener) node.addEventListener(type, fn);
  }

  function bindEvents() {
    on('btn-start', 'click', () => {
      sfx('click');
      showScreen('game');
      startRun(S.ascension);
    });

    on('btn-title-rules', 'click', openRules);
    on('btn-rules', 'click', openRules);
    on('btn-close-rules', 'click', closeRules);
    on('modal-rules', 'click', (e) => { if (e.target === $('modal-rules')) closeRules(); });

    on('btn-lang', 'click', () => setLang(S.lang === 'ko' ? 'en' : 'ko'));
    on('btn-title-lang', 'click', () => setLang(S.lang === 'ko' ? 'en' : 'ko'));
    on('btn-sound', 'click', toggleSound);
    on('btn-title-sound', 'click', toggleSound);

    on('btn-title-codex', 'click', () => openCodex('relics'));
    on('btn-title-ach', 'click', openAchievements);
    on('btn-title-settings', 'click', openSettings);
    on('btn-codex', 'click', () => openCodex('relics'));
    on('btn-ach', 'click', openAchievements);
    on('btn-settings', 'click', openSettings);

    on('btn-close-codex', 'click', closeCodex);
    on('modal-codex', 'click', (e) => { if (e.target === $('modal-codex')) closeCodex(); });
    on('btn-close-ach', 'click', closeAchievements);
    on('modal-ach', 'click', (e) => { if (e.target === $('modal-ach')) closeAchievements(); });
    on('btn-close-settings', 'click', closeSettings);
    on('modal-settings', 'click', (e) => { if (e.target === $('modal-settings')) closeSettings(); });

    const tabs = $('codex-tabs');
    if (tabs && tabs.querySelectorAll) {
      tabs.querySelectorAll('.codex-tab').forEach(node => {
        node.addEventListener('click', () => { codexTab = node.dataset.tab || 'relics'; buildCodex(); sfx('select'); });
      });
    }
    const filters = $('codex-filters');
    if (filters && filters.querySelectorAll) {
      filters.querySelectorAll('.codex-filter').forEach(node => {
        node.addEventListener('click', () => { codexFilter = node.dataset.rarity || 'all'; buildCodex(); sfx('select'); });
      });
    }

    on('btn-bgm', 'click', () => setBgm(!S.bgm));
    on('btn-sfx', 'click', () => toggleSound());
    on('btn-set-ko', 'click', () => setLang('ko'));
    on('btn-set-en', 'click', () => setLang('en'));
    on('vol-slider', 'input', (e) => setVolume(e.target.value));
    on('btn-reset-save', 'click', () => {
      askConfirm(t('settings.resetConfirm'), t('settings.reset'), () => {
        try { localStorage.removeItem(STORE_KEY); } catch (e) {}
        S.progress = { unlocked: {}, relicSeen: [], runs: 0, wins: 0, bestNight: 0, curseNullified: 0, endlessBest: 0, totalScore: 0, bestHand: 0 };
        S.ascensionMax = 0;
        S.ascension = 0;
        S.best = null;
        S.endlessBest = 0;
        persistProgress();
        toast(t('settings.resetDone'));
        renderTitleBest();
        renderTitleProgress();
        renderAscensionPicker();
      });
    });

    on('btn-roll', 'click', onRoll);
    on('btn-score', 'click', doScore);

    on('btn-shop-reroll', 'click', shopReroll);
    on('btn-next-round', 'click', () => { sfx('click'); closeShop(); });

    on('btn-restart', 'click', () => {
      $('overlay-result').classList.add('hidden');
      S.endlessPending = false;
      sfx('click');
      showScreen('game');
      startRun(S.ascension);
    });
    on('btn-result-title', 'click', () => {
      $('overlay-result').classList.add('hidden');
      S.endlessPending = false;
      showScreen('title');
    });
    on('btn-endless-continue', 'click', continueEndless);
    on('btn-end-run', 'click', endRunHere);

    on('btn-confirm-yes', 'click', () => closeConfirm(true));
    on('btn-confirm-no', 'click', () => closeConfirm(false));
    on('modal-confirm', 'click', (e) => { if (e.target === $('modal-confirm')) closeConfirm(false); });

    on('score-popup', 'click', () => { S.skipAnim = true; });

    // 툴팁 위에 마우스가 있으면 닫히지 않게
    on('tooltip', 'mouseenter', () => clearTimeout(tooltipTimer));
    on('tooltip', 'mouseleave', hideTooltipSoon);

    // 첫 상호작용에서 오디오 활성화
    const unlock = () => {
      const SND = window.CPSound;
      if (!SND) return;
      try {
        SND.unlock();
        SND.setEnabled(S.sound);
        if (S.bgm && SND.startBgm) SND.startBgm('table');
      } catch (e) {}
    };
    window.addEventListener('pointerdown', unlock, { once: true });
    window.addEventListener('keydown', unlock, { once: true });

    document.addEventListener('keydown', onKeyDown);

    // hover 사운드 (가벼운 틱)
    document.addEventListener('mouseover', (e) => {
      const btn = e.target && e.target.closest && e.target.closest('.btn, .hand-card, .shop-card');
      if (btn && btn !== window.__lastHover) {
        window.__lastHover = btn;
        sfx('hover');
      }
    });
  }

  function anyModalOpen() {
    const ids = ['modal-rules', 'modal-confirm', 'modal-codex', 'modal-ach', 'modal-settings'];
    for (let i = 0; i < ids.length; i++) {
      const node = $(ids[i]);
      if (node && !node.classList.contains('hidden')) return ids[i];
    }
    return '';
  }

  function onKeyDown(e) {
    const modal = anyModalOpen();
    const shopOpen = $('overlay-shop') && !$('overlay-shop').classList.contains('hidden');
    const resultOpen = $('overlay-result') && !$('overlay-result').classList.contains('hidden');

    if (e.key === 'Escape') {
      if (modal === 'modal-confirm') { closeConfirm(false); return; }
      if (modal === 'modal-rules') { closeRules(); return; }
      if (modal === 'modal-codex') { closeCodex(); return; }
      if (modal === 'modal-ach') { closeAchievements(); return; }
      if (modal === 'modal-settings') { closeSettings(); return; }
      if (S.focusCharm >= 0) { cancelFocus(); return; }
      return;
    }

    if (modal || shopOpen || resultOpen) return;
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
    if (e.key === 'c' || e.key === 'C') { openCodex('relics'); return; }
    if (e.key === 'a' || e.key === 'A') { openAchievements(); return; }
    if (e.key === 'p' || e.key === 'P') {
      if (S.phase === 'idle' || S.phase === 'rolled') openSettings();
      return;
    }
  }

  /* ══════════════════════════════ 22. 부트 ══════════════════════════════ */

  function boot() {
    loadSettings();
    if (window.CursedI18n) window.CursedI18n.setLocale(S.lang);
    applyAudioSettings();

    // 런타임 오류 수집 (QA · 지원용 로그)
    window.__cpErrors = window.__cpErrors || [];
    window.addEventListener('error', (ev) => {
      try { window.__cpErrors.push(String((ev && ev.message) || ev)); } catch (e) {}
    });
    window.addEventListener('unhandledrejection', (ev) => {
      try { window.__cpErrors.push('promise: ' + String((ev && ev.reason) || ev)); } catch (e) {}
    });

    loadGameData().then(() => {
      S.meta = DATA.meta;
      S.endlessStart = num((DATA.endless || {}).start_night, 6);
      S.baseRoundCount = ROUNDS.length;
      applyI18n();
      buildRules();
      bindEvents();
      say('round');
      renderTitleBest();
      renderTitleProgress();
      renderAscensionPicker();
      renderDice();
      renderAll();
      showScreen('title');
      renderSettings();

      if (S.dataSource === 'fallback') {
        console.info('[CP] fallback 데이터로 부팅되었습니다.');
      }
      console.log('[CP] 부팅 완료 — 언어', S.lang, '· 라운드', ROUNDS.length, '· 유물', DATA.relics.length, '종');
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
    activeMods: activeMods,
    compileMods: compileMods,
    shopPrice: shopPrice,
    activateCharm: activateCharm,
    shopReroll: shopReroll,
    buyRelic: buyRelic,
    buyCharm: buyCharm,
    finishRun: finishRun,
    openShop: openShop,
    continueEndless: continueEndless,
    extendEndless: extendEndless,
    checkAchievements: checkAchievements,
    achievementStats: achievementStats,
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
      noteRelicSeen(def.id);
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
    setVolume: setVolume,
    setBgm: setBgm,
    setLang: setLang,
    setAscension(level) { S.ascension = clamp(num(level, 0), 0, 5); renderAscensionPicker(); },
    openCodex: openCodex,
    openAchievements: openAchievements,
    openSettings: openSettings,
    roll: onRoll,
    scoreSelected() { doScore(); }
  };

})();
