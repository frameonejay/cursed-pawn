'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   CURSED PAWN: 영혼 전당포 — js/i18n.js
   한/영 이중 언어 사전 + 조회 API.

   window.CursedI18n
     · t(key, params)      문자열 조회 (누락 시 ko → en → key 순 폴백)
     · setLocale(lang)     언어 변경 ('ko' | 'en', 'ko-KR' 같은 값도 정규화)
     · getLocale()         현재 언어
     · subscribe(fn)       언어 변경 구독 (해지 함수 반환)
     · has/keys/missing/coverage   사전 검수용
     · dataName/dataDesc   game_data.json 항목의 name_ko/en, desc_ko/en 선택
     · condLabel/effectLabel/charmEffectLabel/rarityLabel/triggerLabel/curseLabel

   game_data.json 의 condition·effect_type·charm_effect·boss_curse id 와
   cond.* / effect.* / charmEffect.* / curse.* 키가 1:1로 대응한다.
   ══════════════════════════════════════════════════════════════════════════ */

(function (root) {
  'use strict';

  var LOCALES = ['ko', 'en'];
  var DEFAULT_LOCALE = 'ko';

  var STRINGS = {

    /* ───────────────────────────── 한국어 ───────────────────────────── */
    ko: {
      /* 앱 */
      'app.title': 'CURSED PAWN',
      'app.subtitle': '영혼 전당포',
      'app.studio': 'Frame One Studio',
      'app.version': '버전 {v}',

      /* 화면 라벨 (js/game.js 의 ui.* 키와 1:1) */
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

      /* 공통 */
      'common.yes': '예',
      'common.no': '아니오',
      'common.ok': '확인',
      'common.cancel': '취소',
      'common.close': '닫기',
      'common.back': '뒤로',
      'common.next': '다음',
      'common.confirm': '확인',
      'common.loading': '불러오는 중…',
      'common.on': '켜짐',
      'common.off': '꺼짐',
      'common.none': '없음',
      'common.level': '단계',
      'common.night': '밤',
      'common.round': '라운드',
      'common.score': '점수',
      'common.target': '목표',
      'common.gold': '골드',
      'common.hands': '핸드',
      'common.rerolls': '리롤',
      'common.relics': '유물',
      'common.charms': '부적',
      'common.locked': '잠김',
      'common.unlocked': '해금',
      'common.best': '최고 기록',
      'common.new': '신규',
      'common.total': '합계',
      'common.percent': '{v}%',
      'common.of': '{a} / {b}',

      /* 언어 */
      'lang.ko': '한국어',
      'lang.en': 'English',
      'lang.switch': '언어 변경',

      /* 타이틀 */
      'title.kicker': 'A DICE ROGUELIKE DECKBUILDER',
      'title.sub': '영혼 전당포',
      'title.tag': '영혼을 담보로, 주사위로 빚을 갚아라.\n다섯 밤을 버티면 계약은 갱신된다.',
      'title.start': '계약서에 서명한다',
      'title.continue': '이어서 계약하기',
      'title.endless': '엔드리스 계약',
      'title.ascension': '승천 단계',
      'title.achievements': '업적',
      'title.codex': '유물 도감',
      'title.rules': '족보 · 룰북',
      'title.settings': '설정',
      'title.quit': '나가기',
      'title.best': '최고 기록 {score}점 · 밤 {night}',
      'title.noBest': '아직 기록이 없습니다 — 첫 계약을 맺어 보세요.',
      'title.runs': '{runs}회 도전 · {wins}회 갱신',
      'title.endlessBest': '엔드리스 최고 밤 {night}',
      'title.quote': '“담보는 내가 잘 보관하지.”',
      'title.steamNotice': 'Steam 연동 시 업적과 클라우드 저장이 켜집니다.',

      /* 일시정지 메뉴 */
      'menu.pause': '일시정지',
      'menu.resume': '계속하기',
      'menu.restart': '새 계약서',
      'menu.restartConfirm': '진행 중인 계약을 버리고 처음부터 시작할까요?',
      'menu.settings': '설정',
      'menu.quitToTitle': '타이틀로',
      'menu.abandon': '계약 파기',
      'menu.abandonConfirm': '이번 판을 포기하면 담보는 회수됩니다. 계속할까요?',

      /* HUD */
      'hud.night': '밤',
      'hud.roundSuffix': '라운드',
      'hud.score': '정산 점수',
      'hud.hands': '기회',
      'hud.rerolls': '리롤',
      'hud.gold': '골드',
      'hud.curse': '저주',
      'hud.target': '목표',
      'hud.progress': '진행',
      'hud.ascension': '승천 {level}',
      'hud.endless': '엔드리스',

      'type.normal': '일반',
      'type.elite': '정예',
      'type.boss': '보스',

      /* 버튼 */
      'btn.roll': '굴리기',
      'btn.reroll': '리롤',
      'btn.score': '정산!',
      'btn.scoreIdle': '정산',
      'btn.nextRound': '다음 라운드로',
      'btn.nextNight': '다음 밤으로',
      'btn.sell': '판매',
      'btn.buy': '구매',
      'btn.owned': '보유 중',
      'btn.refresh': '진열 교체',
      'btn.use': '사용',
      'btn.select': '선택',
      'btn.retry': '다시 시도',
      'btn.continueRun': '계속',

      /* 진행 메시지 */
      'msg.rollFirst': '주사위를 굴려 기회를 시작하세요',
      'msg.handStart': '{n}번째 기회 — 남길 주사위를 HOLD 하세요',
      'msg.selectHand': '족보를 골라 정산하세요',
      'msg.noReroll': '리롤을 모두 썼습니다',
      'msg.focusFlip': '뒤집을 주사위를 클릭하세요 (ESC 취소)',
      'msg.focusPin': '고정할 주사위를 클릭하세요 (ESC 취소)',
      'msg.focusPip': '눈금을 바꿀 주사위를 클릭하세요 (ESC 취소)',
      'msg.needHand': '먼저 족보를 고르세요',
      'msg.roundClear': '라운드 클리어',
      'msg.lastHand': '마지막 기회입니다',
      'msg.noSettleHand': '저주: 이 족보로는 정산할 수 없습니다',

      /* 전당포 주인 */
      'dealer.title': '전당포 주인',
      'dealer.round': '자, 주사위를 굴려 보게. 담보는 내가 잘 보관하지.',
      'dealer.boss': '이 밤의 손님은 유난히 까다롭다네. 저주도 값이지.',
      'dealer.clear': '호오... 아직 쓸 만하군. 영혼이 반짝이는걸.',
      'dealer.fail': '유감이군. 담보는 내가 가져가지.',
      'dealer.buy': '현명한 선택이야. 그건 네 것이야... 지금은.',
      'dealer.endless': '계약은 끝나지 않는다네. 장부의 다음 장을 펴 보게.',

      /* 상점 */
      'shop.kicker': 'CONTRACT FULFILLED',
      'shop.title': '라운드 클리어',
      'shop.titleBoss': '밤을 넘겼다',
      'shop.reward': '보상 +{g} 골드',
      'shop.bonus': '유물 보너스 +{b}',
      'shop.tax': '영혼세 −{t} 골드',
      'shop.interest': '이자 +{i} 골드',
      'shop.discount': '할인 {p}%',
      'shop.relics': '유물 진열',
      'shop.charms': '부적 진열',
      'shop.reroll': '진열 교체',
      'shop.freeReroll': '무료 교체',
      'shop.next': '다음 밤으로',
      'shop.nextRound': '다음 라운드로',
      'shop.empty': '진열대가 비었습니다',
      'shop.sold': '판매 완료',
      'shop.hint': '유물 최대 6개 · 부적 최대 3개 보유',
      'shop.price': '◎ {cost}',
      'shop.priceDiscounted': '◎ {cost} (원가 {base})',

      /* 결과 */
      'result.winTitle': '계약 갱신',
      'result.winSub': '다섯 밤을 버텼습니다. 영혼은 아직 당신의 것입니다.',
      'result.loseTitle': '담보 회수',
      'result.loseSub': '목표 점수에 닿지 못했습니다. 전당포가 영혼을 가져갑니다.',
      'result.score': '총 정산',
      'result.night': '도달한 밤',
      'result.gold': '보유 골드',
      'result.ascension': '승천 단계',
      'result.newBest': '★ 신기록',
      'result.best': '최고 기록 {score}점 · 밤 {night}',
      'result.restart': '새 계약서',
      'result.title': '타이틀로',
      'result.endlessTitle': '계약은 끝나지 않는다',
      'result.endlessSub': '밤 {night}에서 담보가 회수되었습니다. 장부는 다음 계약자를 기다립니다.',

      /* 룰북 */
      'rules.title': '족보 · 룰북',
      'rules.loopTitle': '코어 루프',
      'rules.loop1': '주사위 5개를 굴리고, 남기고 싶은 주사위를 클릭해 HOLD 합니다.',
      'rules.loop2': '리롤은 HOLD 하지 않은 주사위만 다시 굴립니다.',
      'rules.loop3': '족보를 하나 골라 [정산]을 누르면 그 점수가 라운드에 쌓입니다.',
      'rules.loop4': '목표 점수에 먼저 도달하면 라운드 클리어 — 상점에서 유물과 부적을 삽니다.',
      'rules.loop5': '한 밤은 3라운드(일반 · 정예 · 보스)이고, 보스는 저주를 겁니다. 다섯 밤을 버티면 승리.',
      'rules.loop6': '승천 단계는 목표 점수와 상점 가격을 올리고, 엔드리스는 밤 6부터 계속됩니다.',
      'rules.formulaTitle': '점수 공식',
      'rules.formula': '(기본 칩 + 유물 칩) × (기본 배수 + 유물 배수 + 부적 배수) × 유물 곱연산',
      'rules.formulaNote': '주사위 눈금 합은 칩에 더해지지 않습니다. 유물 조건은 항상 주사위 5개의 눈금으로 판정합니다.',
      'rules.handsTitle': '족보표',
      'rules.curseTitle': '보스 저주',
      'rules.controlsTitle': '조작',
      'rules.keyRoll': '굴리기 / 리롤',
      'rules.keyHold': '주사위 HOLD',
      'rules.keyScore': '선택한 족보로 정산',
      'rules.keyRules': '룰북 열기',
      'rules.keySound': '사운드 On/Off',
      'rules.keyPause': '일시정지',
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
      'rules.effectScale': '비례 효과: 골드·부적·남은 핸드·리롤 수에 비례해 커집니다.',
      'rules.effectShop': '상점 효과: 진열 가격을 낮추거나 교체를 무료로 만듭니다.',
      'rules.tagsTitle': '빌드 태그',
      'rules.charmTitle': '부적 사용법',
      'rules.charmNote': '부적은 3슬롯까지 보유하고, 클릭하면 즉시 발동하며 소멸합니다.',

      /* 튜토리얼 */
      'tutorial.title': '전당포의 첫 손님',
      'tutorial.step1Title': '1. 굴린다',
      'tutorial.step1': 'SPACE 또는 [굴리기]를 눌러 주사위 5개를 굴립니다. 첫 굴리기는 무료입니다.',
      'tutorial.step2Title': '2. 남긴다',
      'tutorial.step2': '남길 주사위를 클릭해 HOLD 합니다. 리롤은 HOLD 하지 않은 주사위만 다시 굴립니다.',
      'tutorial.step3Title': '3. 정산한다',
      'tutorial.step3': '성립한 족보 중 하나를 골라 [정산]을 누릅니다. 목표 점수를 넘으면 라운드 클리어.',
      'tutorial.step4Title': '4. 산다',
      'tutorial.step4': '상점에서 유물 6슬롯과 부적 3슬롯을 채웁니다. 무엇을 버릴지가 빌드입니다.',
      'tutorial.step5Title': '5. 저주를 넘는다',
      'tutorial.step5': '밤의 마지막 라운드는 보스입니다. 저주가 규칙 하나를 바꾸므로 그에 맞춰 빌드를 꺾습니다.',
      'tutorial.hintRoll': '먼저 주사위를 굴려 보세요.',
      'tutorial.hintHold': '같은 눈금을 남기면 페어가 됩니다.',
      'tutorial.hintScore': '족보 카드를 누르면 예상 점수가 보입니다.',
      'tutorial.skip': '건너뛰기',
      'tutorial.done': '계약 시작',

      /* 도감 */
      'codex.title': '유물 도감',
      'codex.sub': '발견한 유물 {seen} / {total}',
      'codex.relics': '유물',
      'codex.charms': '부적',
      'codex.curses': '보스 저주',
      'codex.ascensions': '승천',
      'codex.achievements': '업적',
      'codex.locked': '아직 보지 못한 유물',
      'codex.lockedHint': '상점에서 진열되면 도감에 기록됩니다.',
      'codex.filterAll': '전체',
      'codex.filterRarity': '등급',
      'codex.filterTag': '태그',
      'codex.count': '{n}종',
      'codex.condition': '조건',
      'codex.effect': '효과',
      'codex.cost': '가격',
      'codex.sell': '판매가',

      /* 업적 */
      'ach.title': '업적',
      'ach.sub': '{done} / {total} 달성',
      'ach.unlocked': '달성',
      'ach.locked': '미달성',
      'ach.progress': '진행 {value} / {target}',
      'ach.toast': '업적 달성 — {name}',
      'ach.steamSync': 'Steam 업적으로 동기화됨',
      'ach.steamOffline': 'Steam에 연결되지 않아 로컬에만 기록됩니다',
      'ach.hidden': '숨겨진 업적',
      'ach.scopeRun': '한 판',
      'ach.scopeMeta': '계정 누적',

      /* 승천 */
      'ascension.title': '승천 단계',
      'ascension.sub': '계약을 갱신할수록 전당포는 더 많은 것을 요구합니다.',
      'ascension.level': '승천 {level}',
      'ascension.locked': '승천 {level} — 이전 단계를 클리어하면 열립니다',
      'ascension.unlockHint': '승천 {n}단계에서 승리하면 {next}단계가 열립니다.',
      'ascension.target': '목표 점수 ×{mult}',
      'ascension.startGold': '시작 골드 {delta}',
      'ascension.shopCost': '상점 가격 {delta}',
      'ascension.rule': '추가 규칙',
      'ascension.confirm': '승천 {level} 단계로 계약할까요?',
      'ascension.current': '현재 선택',
      'ascension.best': '최고 클리어: 승천 {level}',
      'ascension.none': '추가 규칙 없음',

      /* 엔드리스 */
      'endless.title': '엔드리스',
      'endless.sub': '다섯 밤 이후에도 계약은 끝나지 않습니다. 목표는 밤마다 28%씩 오릅니다.',
      'endless.start': '엔드리스 시작',
      'endless.night': '밤 {n}',
      'endless.best': '최고 도달 밤 {night}',
      'endless.record': '신기록 — 밤 {night}',
      'endless.warning': '엔드리스에서는 승리가 없습니다. 버티는 만큼이 기록입니다.',
      'endless.quit': '엔드리스 종료',
      'endless.bossPool': '엔드리스 보스',

      /* 설정 */
      'settings.title': '설정',
      'settings.bgm': '배경 음악 (BGM)',
      'settings.sfx': '효과음 (SFX)',
      'settings.master': '마스터 볼륨',
      'settings.language': '언어',
      'settings.fullscreen': '전체 화면',
      'settings.skipAnim': '정산 연출 빠르게',
      'settings.highContrast': '고대비 눈금',
      'settings.reset': '기록 초기화',
      'settings.resetConfirm': '최고 기록과 업적 진행을 모두 지웁니다. 되돌릴 수 없습니다. 계속할까요?',
      'settings.resetDone': '기록을 초기화했습니다',
      'settings.credits': '제작',
      'settings.version': '빌드 {v}',

      /* Steam */
      'steam.title': 'Steam',
      'steam.sub': 'Steam 연동 상태',
      'steam.connected': 'Steam에 연결됨',
      'steam.offline': 'Steam에 연결되지 않음 — 기록은 로컬에 저장됩니다',
      'steam.achievements': '업적 동기화',
      'steam.cloud': '클라우드 저장',
      'steam.overlay': '오버레이',
      'steam.wishlist': '위시리스트에 추가',
      'steam.notice': 'Steam 연동은 steam_appid.txt 와 steamworks.js 가 있을 때만 켜집니다.',
      'steam.aiDisclosure': '이 게임의 일부 이미지와 문구는 AI 생성 도구로 제작되었습니다.',

      /* 기록 */
      'log.roundStart': '{night}번째 밤 · {type} {round}R 시작',
      'log.score': '{hand} 정산',
      'log.clear': '라운드 클리어',
      'log.relic': '{name} 획득',
      'log.charm': '{name} 획득',
      'log.sell': '{name} 판매',
      'log.curse': '저주: {name}',
      'log.tax': '영혼세 −3 골드',
      'log.interest': '이자 +{i} 골드',
      'log.achievement': '업적: {name}',
      'log.ascension': '승천 {level} 계약',
      'log.endless': '엔드리스 밤 {n}',
      'log.curseNullified': '저주 무효: {name}',

      /* 토스트 */
      'toast.notEnoughGold': '골드가 부족합니다',
      'toast.relicsFull': '유물 슬롯이 가득 찼습니다 (최대 6개)',
      'toast.charmsFull': '부적 슬롯이 가득 찼습니다 (최대 3개)',
      'toast.evenLocked': '저주: 짝수 눈금은 홀드할 수 없습니다',
      'toast.oddLocked': '저주: 홀수 눈금은 홀드할 수 없습니다',
      'toast.charmUsed': '{name} 발동',
      'toast.sold': '{name} 판매 — {g} 골드',
      'toast.shopReroll': '진열을 교체했습니다 (−{c} 골드)',
      'toast.bought': '{name} 구매 — {g} 골드',
      'toast.diceFirst': '먼저 주사위를 굴리세요',
      'toast.noCharmTarget': '뒤집을 주사위가 없습니다',
      'toast.soldOut': '품절',
      'toast.curseNullified': '저주 무효 — {name}',
      'toast.curseSoftened': '저주 약화 — {name}',
      'toast.pinned': '주사위를 고정했습니다',
      'toast.pipSet': '눈금을 {v}로 바꿨습니다',
      'toast.freeReroll': '무료 진열 교체를 사용했습니다',
      'toast.achievement': '업적 달성 — {name}',
      'toast.newRecord': '신기록!',
      'toast.handLocked': '저주: 트리플 미만으로는 정산할 수 없습니다',
      'toast.firstRerollDouble': '저주: 첫 리롤은 2회를 소모합니다',

      /* 정산 내역 */
      'bd.base': '기본 칩',
      'bd.baseMult': '기본 배수',
      'bd.chipsAdd': '유물 칩',
      'bd.multAdd': '유물 배수',
      'bd.mul': '곱연산',
      'bd.charmMult': '부적 배수',
      'bd.charmChips': '부적 칩',
      'bd.curse': '저주',
      'bd.total': '예상 정산',
      'bd.pick': '주사위를 굴리면 예상 점수가 표시됩니다',
      'bd.noHand': '족보를 선택하세요',
      'bd.unmet': '조건 미충족',
      'bd.none': '적용되는 효과 없음',

      /* 오류 */
      'error.dataLoad': '데이터를 불러오지 못해 내장 기본값으로 실행합니다.',
      'error.saveFail': '저장에 실패했습니다. 브라우저 저장 공간을 확인하세요.',
      'error.unknownCondition': '알 수 없는 유물 조건: {id}',
      'error.unknownEffect': '알 수 없는 유물 효과: {id}',
      'error.unknownCurse': '알 수 없는 보스 저주: {id}',
      'error.steam': 'Steam 초기화에 실패했습니다.',
      'error.audio': '오디오를 시작할 수 없습니다. 첫 클릭 이후 다시 시도합니다.',

      /* 조건 (game_data.json schema.conditions 와 1:1) */
      'cond.always': '상시',
      'cond.even_count': '짝수 3개 이상',
      'cond.odd_count': '홀수 3개 이상',
      'cond.even_count_4': '짝수 4개 이상',
      'cond.odd_count_4': '홀수 4개 이상',
      'cond.even_count_5': '모두 짝수',
      'cond.pair_or_better': '원 페어 이상',
      'cond.three_kind_or_better': '트리플 이상',
      'cond.four_kind_or_better': '포 카드 이상',
      'cond.full_house_or_better': '풀 하우스 이상',
      'cond.yahtzee_or_better': '야찌',
      'cond.straight': '스트레이트',
      'cond.large_straight': '라지 스트레이트',
      'cond.one_present': '1 포함',
      'cond.two_present': '2 포함',
      'cond.three_present': '3 포함',
      'cond.four_present': '4 포함',
      'cond.five_present': '5 포함',
      'cond.six_present': '6 포함',
      'cond.six_count_2': '6이 2개 이상',
      'cond.last_hand': '마지막 핸드',
      'cond.gold_over_15': '골드 15+',
      'cond.gold_at_least_30': '골드 30+',
      'cond.sum_at_most_15': '눈금 합 15 이하',
      'cond.sum_at_most_14': '눈금 합 14 이하',
      'cond.sum_at_least_22': '눈금 합 22 이상',
      'cond.boss_round': '보스 라운드',

      /* 유물 효과 (schema.effect_types) */
      'effect.add_chips': '칩 +N',
      'effect.add_mult': '배수 +N',
      'effect.mul_mult': '배수 ×N',
      'effect.extra_reroll': '리롤 +N',
      'effect.extra_hand': '핸드 +N',
      'effect.gold_bonus': '골드 +N',
      'effect.add_chips_per_reroll': '리롤당 칩 +N',
      'effect.add_mult_per_hands_left': '남은 핸드당 배수 +N',
      'effect.add_chips_per_gold': '골드 비례 칩 +N',
      'effect.add_mult_per_charm': '부적당 배수 +N',
      'effect.shop_discount': '상점 할인 N%',
      'effect.interest_gold': '이자 골드 +N',

      /* 부적 효과 (schema.charm_effects) */
      'charmEffect.all_plus_one': '모든 눈금 +N',
      'charmEffect.reroll_plus': '리롤 +N',
      'charmEffect.hand_plus': '핸드 +N',
      'charmEffect.flip_dice': '주사위 뒤집기',
      'charmEffect.temp_mult': '이번 핸드 배수 +N',
      'charmEffect.gold_gain': '골드 +N',
      'charmEffect.hold_dice': '주사위 고정',
      'charmEffect.set_pip': '눈금 변환',
      'charmEffect.temp_chips': '이번 핸드 칩 +N',
      'charmEffect.parity_shift': '홀수 눈금 +N',
      'charmEffect.curse_soften': '저주 약화',
      'charmEffect.curse_nullify': '저주 무효',
      'charmEffect.shop_free_reroll': '상점 무료 리롤',

      /* 등급 / 발동 */
      'rarity.common': '일반',
      'rarity.uncommon': '고급',
      'rarity.rare': '희귀',
      'rarity.legendary': '전설',
      'rarity.cursed': '저주',
      'trigger.on_score': '정산 시',
      'trigger.on_roll': '핸드 시작 시',
      'trigger.passive': '상시',

      /* 보스 저주 (boss_curses[].id) */
      'curse.minus_reroll.name': '박자 없는 종',
      'curse.minus_reroll.desc': '이 라운드에는 리롤이 1회뿐입니다.',
      'curse.tax_gold.name': '영혼세',
      'curse.tax_gold.desc': '라운드를 클리어하면 골드 3을 압수당합니다.',
      'curse.cap_six_to_three.name': '눈금 절단',
      'curse.cap_six_to_three.desc': '6 눈금은 3으로 계산됩니다 (족보 판정·조건 모두).',
      'curse.no_pair_bonus.name': '쌍둥이 사기',
      'curse.no_pair_bonus.desc': '페어 계열 족보의 기본 배수가 1 줄어듭니다(최소 1).',
      'curse.no_even.name': '짝수 금식',
      'curse.no_even.desc': '짝수 눈금 주사위는 홀드할 수 없습니다.',
      'curse.min_hand_three_kind.name': '값을 매기지 않는 자',
      'curse.min_hand_three_kind.desc': '트리플 미만의 족보로는 정산할 수 없습니다.',
      'curse.reroll_first_double.name': '한 박자 늦은 손',
      'curse.reroll_first_double.desc': '핸드마다 첫 리롤이 리롤 2회를 소모합니다.',
      'curse.odd_locked.name': '홀수의 사냥꾼',
      'curse.odd_locked.desc': '홀수 눈금 주사위는 홀드할 수 없습니다.',
      'curse.six_blind.name': '여섯을 잊은 자',
      'curse.six_blind.desc': '6 눈금은 조건 판정에서 없는 것으로 취급됩니다.',
      'curse.no_relic_conditions.name': '계약 무효',
      'curse.no_relic_conditions.desc': '이번 라운드에는 상시를 제외한 모든 유물 조건이 거짓이 됩니다.'
    },

    /* ───────────────────────────── English ───────────────────────────── */
    en: {
      /* App */
      'app.title': 'CURSED PAWN',
      'app.subtitle': 'THE SOUL PAWNSHOP',
      'app.studio': 'Frame One Studio',
      'app.version': 'Version {v}',

      /* Screen labels (1:1 with ui.* keys in js/game.js) */
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

      /* Common */
      'common.yes': 'Yes',
      'common.no': 'No',
      'common.ok': 'OK',
      'common.cancel': 'Cancel',
      'common.close': 'Close',
      'common.back': 'Back',
      'common.next': 'Next',
      'common.confirm': 'Confirm',
      'common.loading': 'Loading…',
      'common.on': 'On',
      'common.off': 'Off',
      'common.none': 'None',
      'common.level': 'Level',
      'common.night': 'Night',
      'common.round': 'Round',
      'common.score': 'Score',
      'common.target': 'Target',
      'common.gold': 'Gold',
      'common.hands': 'Hands',
      'common.rerolls': 'Rerolls',
      'common.relics': 'Relics',
      'common.charms': 'Charms',
      'common.locked': 'Locked',
      'common.unlocked': 'Unlocked',
      'common.best': 'Best',
      'common.new': 'New',
      'common.total': 'Total',
      'common.percent': '{v}%',
      'common.of': '{a} / {b}',

      /* Language */
      'lang.ko': '한국어',
      'lang.en': 'English',
      'lang.switch': 'Change language',

      /* Title */
      'title.kicker': 'A DICE ROGUELIKE DECKBUILDER',
      'title.sub': 'THE SOUL PAWNSHOP',
      'title.tag': 'Pledge your soul. Pay the debt with dice.\nSurvive five nights and the contract renews.',
      'title.start': 'Sign the Contract',
      'title.continue': 'Continue the Contract',
      'title.endless': 'Endless Contract',
      'title.ascension': 'Ascension',
      'title.achievements': 'Achievements',
      'title.codex': 'Relic Codex',
      'title.rules': 'Hands · Rulebook',
      'title.settings': 'Settings',
      'title.quit': 'Quit',
      'title.best': 'Best {score} pts · Night {night}',
      'title.noBest': 'No record yet — sign your first contract.',
      'title.runs': '{runs} runs · {wins} renewals',
      'title.endlessBest': 'Endless best: Night {night}',
      'title.quote': '“I will keep your collateral safe.”',
      'title.steamNotice': 'Steam integration enables achievements and cloud saves.',

      /* Pause menu */
      'menu.pause': 'Paused',
      'menu.resume': 'Resume',
      'menu.restart': 'New Contract',
      'menu.restartConfirm': 'Abandon the current contract and start over?',
      'menu.settings': 'Settings',
      'menu.quitToTitle': 'Quit to Title',
      'menu.abandon': 'Tear Up Contract',
      'menu.abandonConfirm': 'Giving up this run forfeits the collateral. Continue?',

      /* HUD */
      'hud.night': 'Night',
      'hud.roundSuffix': 'Round',
      'hud.score': 'Score',
      'hud.hands': 'Hands',
      'hud.rerolls': 'Rerolls',
      'hud.gold': 'Gold',
      'hud.curse': 'Curse',
      'hud.target': 'Target',
      'hud.progress': 'Progress',
      'hud.ascension': 'Ascension {level}',
      'hud.endless': 'Endless',

      'type.normal': 'Normal',
      'type.elite': 'Elite',
      'type.boss': 'Boss',

      /* Buttons */
      'btn.roll': 'Roll',
      'btn.reroll': 'Reroll',
      'btn.score': 'Settle!',
      'btn.scoreIdle': 'Settle',
      'btn.nextRound': 'Next Round',
      'btn.nextNight': 'Next Night',
      'btn.sell': 'Sell',
      'btn.buy': 'Buy',
      'btn.owned': 'Owned',
      'btn.refresh': 'Refresh Stock',
      'btn.use': 'Use',
      'btn.select': 'Select',
      'btn.retry': 'Retry',
      'btn.continueRun': 'Continue',

      /* Progress messages */
      'msg.rollFirst': 'Roll the dice to begin this hand',
      'msg.handStart': 'Hand {n} — click dice to HOLD',
      'msg.selectHand': 'Pick a hand to settle',
      'msg.noReroll': 'No rerolls left',
      'msg.focusFlip': 'Click a die to flip it (ESC to cancel)',
      'msg.focusPin': 'Click a die to pin it (ESC to cancel)',
      'msg.focusPip': 'Click a die to change its pip (ESC to cancel)',
      'msg.needHand': 'Pick a hand first',
      'msg.roundClear': 'Round cleared',
      'msg.lastHand': 'This is your last hand',
      'msg.noSettleHand': 'Curse: that hand cannot be settled',

      /* Pawnbroker */
      'dealer.title': 'Pawnbroker',
      'dealer.round': 'Roll, dear customer. I will keep your collateral safe.',
      'dealer.boss': "Tonight's guest is a difficult one. Curses cost extra.",
      'dealer.clear': 'Oh? Still useful, then. Your soul has a lovely shine.',
      'dealer.fail': 'A pity. I shall take the collateral.',
      'dealer.buy': 'A wise choice. It is yours... for now.',
      'dealer.endless': 'The contract never ends. Turn the next page of the ledger.',

      /* Shop */
      'shop.kicker': 'CONTRACT FULFILLED',
      'shop.title': 'Round Cleared',
      'shop.titleBoss': 'Night Survived',
      'shop.reward': 'Reward +{g} Gold',
      'shop.bonus': 'Relic bonus +{b}',
      'shop.tax': 'Soul tax −{t} Gold',
      'shop.interest': 'Interest +{i} Gold',
      'shop.discount': 'Discount {p}%',
      'shop.relics': 'Relics on Display',
      'shop.charms': 'Charms on Display',
      'shop.reroll': 'Refresh Stock',
      'shop.freeReroll': 'Free Refresh',
      'shop.next': 'Next Night',
      'shop.nextRound': 'Next Round',
      'shop.empty': 'The shelf is empty',
      'shop.sold': 'Sold',
      'shop.hint': 'Max 6 relics · max 3 charms',
      'shop.price': '◎ {cost}',
      'shop.priceDiscounted': '◎ {cost} (was {base})',

      /* Result */
      'result.winTitle': 'Contract Renewed',
      'result.winSub': 'You survived five nights. Your soul is still yours.',
      'result.loseTitle': 'Collateral Seized',
      'result.loseSub': 'The score fell short. The pawnshop takes your soul.',
      'result.score': 'Total Score',
      'result.night': 'Night Reached',
      'result.gold': 'Gold Held',
      'result.ascension': 'Ascension',
      'result.newBest': '★ NEW RECORD',
      'result.best': 'Best {score} pts · Night {night}',
      'result.restart': 'New Contract',
      'result.title': 'Title',
      'result.endlessTitle': 'The Contract Never Ends',
      'result.endlessSub': 'Your collateral was seized on Night {night}. The ledger awaits the next signer.',

      /* Rulebook */
      'rules.title': 'Hands · Rulebook',
      'rules.loopTitle': 'Core Loop',
      'rules.loop1': 'Roll 5 dice, then click dice you want to keep to HOLD them.',
      'rules.loop2': 'A reroll only rerolls the dice you did not hold.',
      'rules.loop3': 'Choose one hand and press [Settle] to bank its points.',
      'rules.loop4': 'Reach the target score to clear the round and shop for relics and charms.',
      'rules.loop5': 'Each night is 3 rounds (normal, elite, boss). Bosses curse the table. Survive 5 nights to win.',
      'rules.loop6': 'Ascension raises targets and shop prices; Endless continues from Night 6.',
      'rules.formulaTitle': 'Score Formula',
      'rules.formula': '(base chips + relic chips) × (base mult + relic mult + charm mult) × relic multipliers',
      'rules.formulaNote': 'Dice pips are not added to chips. Relic conditions always check all five dice.',
      'rules.handsTitle': 'Hand Table',
      'rules.curseTitle': 'Boss Curses',
      'rules.controlsTitle': 'Controls',
      'rules.keyRoll': 'Roll / Reroll',
      'rules.keyHold': 'Hold a die',
      'rules.keyScore': 'Settle the selected hand',
      'rules.keyRules': 'Open rulebook',
      'rules.keySound': 'Toggle sound',
      'rules.keyPause': 'Pause',
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
      'rules.effectScale': 'Scaling effects grow with gold, charms, hands left or reroll allowance.',
      'rules.effectShop': 'Shop effects lower prices or make a refresh free.',
      'rules.tagsTitle': 'Build Tags',
      'rules.charmTitle': 'Using Charms',
      'rules.charmNote': 'Hold up to 3 charms; clicking one triggers it instantly and consumes it.',

      /* Tutorial */
      'tutorial.title': 'The Pawnshop’s First Customer',
      'tutorial.step1Title': '1. Roll',
      'tutorial.step1': 'Press SPACE or [Roll] to roll five dice. The first roll of a hand is free.',
      'tutorial.step2Title': '2. Keep',
      'tutorial.step2': 'Click dice to HOLD them. A reroll only rerolls what you did not hold.',
      'tutorial.step3Title': '3. Settle',
      'tutorial.step3': 'Pick an available hand and press [Settle]. Pass the target to clear the round.',
      'tutorial.step4Title': '4. Buy',
      'tutorial.step4': 'Fill 6 relic slots and 3 charm slots in the shop. What you drop is your build.',
      'tutorial.step5Title': '5. Break the Curse',
      'tutorial.step5': 'The last round of each night is a boss. Its curse rewrites one rule — bend your build around it.',
      'tutorial.hintRoll': 'Start by rolling the dice.',
      'tutorial.hintHold': 'Keep matching pips to make a pair.',
      'tutorial.hintScore': 'Click a hand card to preview its score.',
      'tutorial.skip': 'Skip',
      'tutorial.done': 'Begin Contract',

      /* Codex */
      'codex.title': 'Relic Codex',
      'codex.sub': 'Relics discovered {seen} / {total}',
      'codex.relics': 'Relics',
      'codex.charms': 'Charms',
      'codex.curses': 'Boss Curses',
      'codex.ascensions': 'Ascensions',
      'codex.achievements': 'Achievements',
      'codex.locked': 'Undiscovered relic',
      'codex.lockedHint': 'Relics are recorded once they appear in the shop.',
      'codex.filterAll': 'All',
      'codex.filterRarity': 'Rarity',
      'codex.filterTag': 'Tag',
      'codex.count': '{n} entries',
      'codex.condition': 'Condition',
      'codex.effect': 'Effect',
      'codex.cost': 'Cost',
      'codex.sell': 'Sell price',

      /* Achievements */
      'ach.title': 'Achievements',
      'ach.sub': '{done} / {total} unlocked',
      'ach.unlocked': 'Unlocked',
      'ach.locked': 'Locked',
      'ach.progress': 'Progress {value} / {target}',
      'ach.toast': 'Achievement — {name}',
      'ach.steamSync': 'Synced to Steam achievements',
      'ach.steamOffline': 'Steam is offline — progress is saved locally',
      'ach.hidden': 'Hidden achievement',
      'ach.scopeRun': 'Single run',
      'ach.scopeMeta': 'Account total',

      /* Ascension */
      'ascension.title': 'Ascension',
      'ascension.sub': 'Every renewal asks for more.',
      'ascension.level': 'Ascension {level}',
      'ascension.locked': 'Ascension {level} — clear the previous level to unlock',
      'ascension.unlockHint': 'Win at Ascension {n} to unlock level {next}.',
      'ascension.target': 'Target score ×{mult}',
      'ascension.startGold': 'Starting gold {delta}',
      'ascension.shopCost': 'Shop prices {delta}',
      'ascension.rule': 'Extra rule',
      'ascension.confirm': 'Sign at Ascension {level}?',
      'ascension.current': 'Selected',
      'ascension.best': 'Best clear: Ascension {level}',
      'ascension.none': 'No extra rule',

      /* Endless */
      'endless.title': 'Endless',
      'endless.sub': 'The contract continues past five nights. The target rises 28% each night.',
      'endless.start': 'Begin Endless',
      'endless.night': 'Night {n}',
      'endless.best': 'Best night reached: {night}',
      'endless.record': 'New record — Night {night}',
      'endless.warning': 'There is no victory in Endless. How long you last is the record.',
      'endless.quit': 'End Endless Run',
      'endless.bossPool': 'Endless bosses',

      /* Settings */
      'settings.title': 'Settings',
      'settings.bgm': 'Music (BGM)',
      'settings.sfx': 'Sound effects (SFX)',
      'settings.master': 'Master Volume',
      'settings.language': 'Language',
      'settings.fullscreen': 'Fullscreen',
      'settings.skipAnim': 'Fast settlement animation',
      'settings.highContrast': 'High-contrast pips',
      'settings.reset': 'Reset Records',
      'settings.resetConfirm': 'This erases best records and achievement progress. It cannot be undone. Continue?',
      'settings.resetDone': 'Records reset',
      'settings.credits': 'Credits',
      'settings.version': 'Build {v}',

      /* Steam */
      'steam.title': 'Steam',
      'steam.sub': 'Steam integration',
      'steam.connected': 'Connected to Steam',
      'steam.offline': 'Steam is offline — progress is stored locally',
      'steam.achievements': 'Achievement sync',
      'steam.cloud': 'Cloud saves',
      'steam.overlay': 'Overlay',
      'steam.wishlist': 'Add to Wishlist',
      'steam.notice': 'Steam integration turns on only when steam_appid.txt and steamworks.js are present.',
      'steam.aiDisclosure': 'Some images and text in this game were produced with AI generation tools.',

      /* Log */
      'log.roundStart': 'Night {night} · {type} {round}R begins',
      'log.score': '{hand} settled',
      'log.clear': 'Round cleared',
      'log.relic': 'Gained {name}',
      'log.charm': 'Gained {name}',
      'log.sell': 'Sold {name}',
      'log.curse': 'Curse: {name}',
      'log.tax': 'Soul tax −3 Gold',
      'log.interest': 'Interest +{i} Gold',
      'log.achievement': 'Achievement: {name}',
      'log.ascension': 'Ascension {level} contract',
      'log.endless': 'Endless Night {n}',
      'log.curseNullified': 'Curse nullified: {name}',

      /* Toasts */
      'toast.notEnoughGold': 'Not enough gold',
      'toast.relicsFull': 'Relic slots are full (max 6)',
      'toast.charmsFull': 'Charm slots are full (max 3)',
      'toast.evenLocked': 'Curse: even dice cannot be held',
      'toast.oddLocked': 'Curse: odd dice cannot be held',
      'toast.charmUsed': '{name} triggered',
      'toast.sold': 'Sold {name} for {g} gold',
      'toast.shopReroll': 'Stock refreshed (−{c} gold)',
      'toast.bought': 'Bought {name} for {g} gold',
      'toast.diceFirst': 'Roll the dice first',
      'toast.noCharmTarget': 'No die to flip',
      'toast.soldOut': 'Sold out',
      'toast.curseNullified': 'Curse nullified — {name}',
      'toast.curseSoftened': 'Curse softened — {name}',
      'toast.pinned': 'Die pinned',
      'toast.pipSet': 'Pip changed to {v}',
      'toast.freeReroll': 'Used a free stock refresh',
      'toast.achievement': 'Achievement unlocked — {name}',
      'toast.newRecord': 'New record!',
      'toast.handLocked': 'Curse: nothing below Three of a Kind can be settled',
      'toast.firstRerollDouble': 'Curse: the first reroll costs 2',

      /* Breakdown */
      'bd.base': 'Base chips',
      'bd.baseMult': 'Base mult',
      'bd.chipsAdd': 'Relic chips',
      'bd.multAdd': 'Relic mult',
      'bd.mul': 'Multiplier',
      'bd.charmMult': 'Charm mult',
      'bd.charmChips': 'Charm chips',
      'bd.curse': 'Curse',
      'bd.total': 'Projected',
      'bd.pick': 'Roll the dice to see projected scores',
      'bd.noHand': 'Select a hand',
      'bd.unmet': 'condition unmet',
      'bd.none': 'No active effects',

      /* Errors */
      'error.dataLoad': 'Could not load data; running on built-in defaults.',
      'error.saveFail': 'Saving failed. Check your browser storage.',
      'error.unknownCondition': 'Unknown relic condition: {id}',
      'error.unknownEffect': 'Unknown relic effect: {id}',
      'error.unknownCurse': 'Unknown boss curse: {id}',
      'error.steam': 'Steam initialization failed.',
      'error.audio': 'Audio could not start. It will retry after your next click.',

      /* Conditions (1:1 with schema.conditions) */
      'cond.always': 'Always',
      'cond.even_count': '3+ even',
      'cond.odd_count': '3+ odd',
      'cond.even_count_4': '4+ even',
      'cond.odd_count_4': '4+ odd',
      'cond.even_count_5': 'All even',
      'cond.pair_or_better': 'Pair+',
      'cond.three_kind_or_better': 'Three of a kind+',
      'cond.four_kind_or_better': 'Four of a kind+',
      'cond.full_house_or_better': 'Full house+',
      'cond.yahtzee_or_better': 'Yahtzee',
      'cond.straight': 'Straight',
      'cond.large_straight': 'Large straight',
      'cond.one_present': 'A one',
      'cond.two_present': 'A two',
      'cond.three_present': 'A three',
      'cond.four_present': 'A four',
      'cond.five_present': 'A five',
      'cond.six_present': 'A six',
      'cond.six_count_2': '2+ sixes',
      'cond.last_hand': 'Last hand',
      'cond.gold_over_15': '15+ gold',
      'cond.gold_at_least_30': '30+ gold',
      'cond.sum_at_most_15': 'Dice total ≤15',
      'cond.sum_at_most_14': 'Dice total ≤14',
      'cond.sum_at_least_22': 'Dice total ≥22',
      'cond.boss_round': 'Boss round',

      /* Relic effects (schema.effect_types) */
      'effect.add_chips': '+N chips',
      'effect.add_mult': '+N mult',
      'effect.mul_mult': '×N mult',
      'effect.extra_reroll': '+N reroll',
      'effect.extra_hand': '+N hand',
      'effect.gold_bonus': '+N gold',
      'effect.add_chips_per_reroll': '+N chips per reroll',
      'effect.add_mult_per_hands_left': '+N mult per hand left',
      'effect.add_chips_per_gold': '+N chips per gold',
      'effect.add_mult_per_charm': '+N mult per charm',
      'effect.shop_discount': 'N% shop discount',
      'effect.interest_gold': '+N interest gold',

      /* Charm effects (schema.charm_effects) */
      'charmEffect.all_plus_one': 'All dice +N',
      'charmEffect.reroll_plus': 'Reroll +N',
      'charmEffect.hand_plus': 'Hand +N',
      'charmEffect.flip_dice': 'Flip a die',
      'charmEffect.temp_mult': '+N mult this hand',
      'charmEffect.gold_gain': '+N gold',
      'charmEffect.hold_dice': 'Pin a die',
      'charmEffect.set_pip': 'Set a pip',
      'charmEffect.temp_chips': '+N chips this hand',
      'charmEffect.parity_shift': 'Odd dice +N',
      'charmEffect.curse_soften': 'Soften curse',
      'charmEffect.curse_nullify': 'Nullify curse',
      'charmEffect.shop_free_reroll': 'Free shop reroll',

      /* Rarity / trigger */
      'rarity.common': 'Common',
      'rarity.uncommon': 'Uncommon',
      'rarity.rare': 'Rare',
      'rarity.legendary': 'Legendary',
      'rarity.cursed': 'Cursed',
      'trigger.on_score': 'On score',
      'trigger.on_roll': 'On hand start',
      'trigger.passive': 'Passive',

      /* Boss curses (boss_curses[].id) */
      'curse.minus_reroll.name': 'Out of Tune',
      'curse.minus_reroll.desc': 'You get only 1 reroll this round.',
      'curse.tax_gold.name': 'Soul Tax',
      'curse.tax_gold.desc': 'Clearing the round seizes 3 gold.',
      'curse.cap_six_to_three.name': 'Pip Shearing',
      'curse.cap_six_to_three.desc': 'Sixes count as 3 for hand and condition checks.',
      'curse.no_pair_bonus.name': 'Twin Swindle',
      'curse.no_pair_bonus.desc': 'Pair-family base multipliers drop by 1 (minimum 1).',
      'curse.no_even.name': 'Even Fast',
      'curse.no_even.desc': 'Even dice cannot be held.',
      'curse.min_hand_three_kind.name': 'The Appraiser',
      'curse.min_hand_three_kind.desc': 'Nothing below Three of a Kind can be settled.',
      'curse.reroll_first_double.name': 'The Late Hand',
      'curse.reroll_first_double.desc': 'Each hand, the first reroll costs 2 rerolls.',
      'curse.odd_locked.name': 'The Odd Hunter',
      'curse.odd_locked.desc': 'Odd dice cannot be held.',
      'curse.six_blind.name': 'The One Who Forgot Six',
      'curse.six_blind.desc': 'Sixes are treated as absent for condition checks.',
      'curse.no_relic_conditions.name': 'The Void Clause',
      'curse.no_relic_conditions.desc': 'Every relic condition except Always evaluates false this round.'
    }
  };

  /* ───────────────────────────── 상태/API ───────────────────────────── */

  var current = DEFAULT_LOCALE;
  var listeners = [];

  function normalizeLang(lang) {
    if (!lang) return null;
    var s = String(lang).toLowerCase().replace('_', '-');
    if (s.indexOf('ko') === 0) return 'ko';
    if (s.indexOf('en') === 0) return 'en';
    return LOCALES.indexOf(s) >= 0 ? s : null;
  }

  function keysOf(locale) {
    var dict = STRINGS[normalizeLang(locale) || DEFAULT_LOCALE];
    return dict ? Object.keys(dict) : [];
  }

  function has(key, locale) {
    var lang = normalizeLang(locale) || current;
    var dict = STRINGS[lang];
    return !!dict && Object.prototype.hasOwnProperty.call(dict, key);
  }

  function resolve(key, locale) {
    var dict = STRINGS[locale];
    if (!dict) return null;
    return Object.prototype.hasOwnProperty.call(dict, key) ? dict[key] : null;
  }

  function format(str, params) {
    if (!params) return str;
    return String(str).replace(/\{(\w+)\}/g, function (match, name) {
      return Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match;
    });
  }

  /** 문자열 조회. 현재 언어 → ko → en → key 순으로 폴백한다. */
  function t(key, params) {
    if (key == null) return '';
    var str = resolve(key, current);
    if (str == null) str = resolve(key, DEFAULT_LOCALE);
    if (str == null) str = resolve(key, 'en');
    if (str == null) {
      if (root.console && root.console.warn) root.console.warn('[CP i18n] missing key: ' + key);
      return typeof key === 'string' ? key : '';
    }
    return params ? format(str, params) : str;
  }

  function setLocale(lang) {
    var next = normalizeLang(lang);
    if (!next || next === current) return current;
    current = next;
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](current); } catch (e) { /* 구독자 오류는 언어 변경을 막지 않는다 */ }
    }
    return current;
  }

  function getLocale() { return current; }

  function subscribe(fn) {
    if (typeof fn !== 'function') return function () {};
    listeners.push(fn);
    return function () {
      var i = listeners.indexOf(fn);
      if (i >= 0) listeners.splice(i, 1);
    };
  }

  /** 기준 언어(기본 en)에 있으나 다른 언어에 없는 키 목록. */
  function missing(locale, reference) {
    var ref = normalizeLang(reference) || 'en';
    var lang = normalizeLang(locale) || (ref === 'en' ? 'ko' : 'en');
    return keysOf(ref).filter(function (k) { return !has(k, lang); });
  }

  function coverage() {
    var all = {};
    LOCALES.forEach(function (lang) { keysOf(lang).forEach(function (k) { all[k] = true; }); });
    var keys = Object.keys(all);
    var report = { totalKeys: keys.length, locales: {}, empty: {}, placeholderMismatch: [] };
    LOCALES.forEach(function (lang) {
      var dict = STRINGS[lang];
      var emptyKeys = keys.filter(function (k) { return dict[k] == null || String(dict[k]).trim() === ''; });
      report.locales[lang] = dict ? Object.keys(dict).length : 0;
      report.empty[lang] = emptyKeys;
    });
    keys.forEach(function (k) {
      var base = STRINGS.ko[k];
      var other = STRINGS.en[k];
      if (typeof base !== 'string' || typeof other !== 'string') return;
      var re = /\{(\w+)\}/g;
      var vars = function (s) {
        var out = [], m;
        while ((m = re.exec(s))) out.push(m[1]);
        return out.sort().join(',');
      };
      if (vars(base) !== vars(other)) report.placeholderMismatch.push(k);
    });
    return report;
  }

  /* ── 데이터 항목 현지화 ── */

  function isEnglish() { return current === 'en'; }

  function dataName(obj) {
    if (!obj) return '';
    var v = isEnglish() ? obj.name_en : obj.name_ko;
    return v || obj.name_ko || obj.name_en || obj.id || '';
  }

  function dataDesc(obj) {
    if (!obj) return '';
    var v = isEnglish() ? obj.desc_en : obj.desc_ko;
    return v || obj.desc_ko || obj.desc_en || '';
  }

  var idLabels = {
    cond: 'cond.',
    effect: 'effect.',
    charmEffect: 'charmEffect.',
    rarity: 'rarity.',
    trigger: 'trigger.',
    curse: 'curse.'
  };

  function label(kind, id, opts) {
    var prefix = idLabels[kind];
    if (!prefix || !id) return '';
    var key = prefix + id;
    if (has(key)) return t(key);
    if (kind === 'curse') {
      if (has(key + '.name')) return t(key + '.name');
      return String(id);
    }
    if (opts && opts.fallback != null) return opts.fallback;
    return String(id).replace(/_/g, ' ');
  }

  function condLabel(id, opts) { return label('cond', id, opts); }
  function effectLabel(id, opts) { return label('effect', id, opts); }
  function charmEffectLabel(id, opts) { return label('charmEffect', id, opts); }
  function rarityLabel(id, opts) { return label('rarity', id, opts); }
  function triggerLabel(id, opts) { return label('trigger', id, opts); }
  function curseLabel(id, which) {
    var key = 'curse.' + id + '.' + (which === 'desc' ? 'desc' : 'name');
    return has(key) ? t(key) : '';
  }

  root.CursedI18n = {
    LOCALES: LOCALES.slice(),
    DEFAULT_LOCALE: DEFAULT_LOCALE,
    STRINGS: STRINGS,
    t: t,
    setLocale: setLocale,
    getLocale: getLocale,
    subscribe: subscribe,
    has: has,
    keys: keysOf,
    missing: missing,
    coverage: coverage,
    dataName: dataName,
    dataDesc: dataDesc,
    condLabel: condLabel,
    effectLabel: effectLabel,
    charmEffectLabel: charmEffectLabel,
    rarityLabel: rarityLabel,
    triggerLabel: triggerLabel,
    curseLabel: curseLabel
  };
})(typeof window !== 'undefined' ? window : globalThis);
