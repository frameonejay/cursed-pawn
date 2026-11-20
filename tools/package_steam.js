'use strict';

/* CURSED PAWN — Steam depot 폴더 준비 도구.

   `npm run dist:steam` (electron-builder --dir) 뒤에 실행되어
   dist/win-unpacked 를 dist/steam 으로 복사하고, Steam 업로드에 필요한
   파일(steam_appid.txt · depot 안내)을 채워 넣는다.

   사용법:
     node tools/package_steam.js               # dist/win-unpacked → dist/steam
     CP_APPID=1234560 node tools/package_steam.js
*/
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'dist', 'win-unpacked');
const OUT = path.join(ROOT, 'dist', 'steam');
const APP_ID = process.env.CP_APPID || '480'; // 480 = Spacewar (테스트용 AppID)

function copyDir(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const s = path.join(from, entry.name);
    const d = path.join(to, entry.name);
    if (entry.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}

function main() {
  if (!fs.existsSync(SRC)) {
    console.error('[steam] dist/win-unpacked 가 없습니다. 먼저 `npm run dist:dir` 를 실행하세요.');
    process.exitCode = 1;
    return;
  }
  fs.rmSync(OUT, { recursive: true, force: true });
  copyDir(SRC, OUT);

  fs.writeFileSync(path.join(OUT, 'steam_appid.txt'), APP_ID + '\n', 'utf8');
  fs.writeFileSync(path.join(OUT, 'STEAM_DEPOT.txt'), [
    'CURSED PAWN — Steam depot staging folder',
    '',
    '1) Steamworks 파트너 사이트에서 새 App 을 만들고 AppID 를 받습니다.',
    '2) 이 폴더의 steam_appid.txt 를 실제 AppID 로 바꿉니다. (테스트는 480 = Spacewar)',
    '3) SteamPipe: Content Builder 로 이 폴더 전체를 depot 에 업로드합니다.',
    '4) 업적 API 이름을 파트너 사이트에 등록합니다 (ACH_<업적ID 대문자>):',
    '   ACH_FIRST_CONTRACT, ACH_YAHTZEE_ROLL, ACH_HAND_5000, ACH_HAND_20000,',
    '   ACH_ASCENSION_3, ACH_ASCENSION_5, ACH_RELIC_30, ACH_NO_REROLL_BOSS,',
    '   ACH_ZERO_GOLD_WIN, ACH_ENDLESS_8, ACH_ENDLESS_12, ACH_BOSS_HANDS_LEFT,',
    '   ACH_CURSE_NULLIFIED, ACH_LEGENDARY_PAIR, ACH_TOTAL_100K',
    '5) 실행 옵션: -windowed / -fullscreen (Electron 이 무시해도 게임은 1280x800 으로 뜹니다)',
    ''
  ].join('\n'), 'utf8');

  const size = (function du(p) {
    let total = 0;
    for (const entry of fs.readdirSync(p, { withFileTypes: true })) {
      const q = path.join(p, entry.name);
      total += entry.isDirectory() ? du(q) : fs.statSync(q).size;
    }
    return total;
  })(OUT);

  console.log('[steam] depot 준비 완료:', path.relative(ROOT, OUT), `(${(size / 1024 / 1024).toFixed(1)} MB)`);
  console.log('[steam] AppID:', APP_ID, '— 실제 AppID 로 교체하세요.');
}

main();
