'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   CURSED PAWN: 영혼 전당포 — Electron entry point (Steam build)

   · app:// 커스텀 프로토콜로 index.html 을 로드한다. (file:// 이 아니라)
     → data/game_data.json 을 fetch 로 정상 로드하고, CSP·localStorage 도
       표준 origin(app://local)에서 동작한다.
   · 창 크기 1280×800(최소 1080×680), F11 전체화면, 개발 빌드에서만 F12.
   · Steamworks.js: steam_appid.txt 가 있거나 CP_STEAM=1 이면 자동으로 켜진다.
   ══════════════════════════════════════════════════════════════════════════ */

const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Menu, ipcMain, shell, protocol, net } = require('electron');

// 오디오 자동재생 정책: 로컬 앱에서는 첫 클릭 전에도 신디사이저를 준비한다.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

const APP_ID = 'com.frameone.cursedpawn';
const APP_TITLE = 'CURSED PAWN: 영혼 전당포';

/* ─────────────── Steamworks.js 연동 ───────────────
   1) `npm i steamworks.js`
   2) 프로젝트 루트(개발) 또는 실행 파일 옆(배포)에 steam_appid.txt 배치
      (또는 환경변수 CP_STEAM=1)
   3) Steam 클라이언트를 켠 상태에서 실행 → 아래 초기화가 자동으로 켜진다
   4) 업적 API 이름은 렌더러가 'ACH_<업적ID 대문자>' 로 보낸다
      (예: first_contract → ACH_FIRST_CONTRACT). Steamworks 파트너 사이트에도
      같은 API 이름으로 업적을 등록해야 한다.
   ──────────────────────────────────────────────── */
function steamWanted() {
  if (process.env.CP_STEAM === '1') return true;
  const candidates = [
    path.join(__dirname, 'steam_appid.txt'),
    path.join(path.dirname(app.getPath('exe')), 'steam_appid.txt')
  ];
  return candidates.some(p => { try { return fs.existsSync(p); } catch (e) { return false; } });
}

let steamworks = null;
let steamReady = false;

function initSteam() {
  if (!steamWanted()) {
    console.log('[steam] disabled (steam_appid.txt 없음 / CP_STEAM!=1)');
    return false;
  }
  try {
    // eslint-disable-next-line global-require
    steamworks = require('steamworks.js');
    steamworks.init(); // steam_appid.txt 의 AppID 사용
    steamReady = true;
    console.log('[steam] initialized');

    ipcMain.handle('cp:achievement', (_event, apiName) => {
      try {
        return steamworks.achievement.activate(String(apiName));
      } catch (err) {
        console.warn('[steam] achievement failed:', apiName, err.message);
        return false;
      }
    });

    ipcMain.handle('cp:stat', (_event, name, value) => {
      try {
        steamworks.stats.setInt(String(name), Math.round(Number(value) || 0));
        steamworks.stats.store();
        return true;
      } catch (err) {
        console.warn('[steam] stat failed:', name, err.message);
        return false;
      }
    });

    ipcMain.handle('cp:stat-add', (_event, name, delta) => {
      try {
        const current = steamworks.stats.getInt(String(name)) || 0;
        steamworks.stats.setInt(String(name), current + Math.round(Number(delta) || 0));
        steamworks.stats.store();
        return true;
      } catch (err) {
        console.warn('[steam] stat-add failed:', name, err.message);
        return false;
      }
    });
  } catch (err) {
    console.warn('[steam] unavailable:', err.message);
    steamReady = false;
  }
  return steamReady;
}

/* ─────────────── app:// 프로토콜 (game_data.json fetch 지원) ─────────────── */

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav'
};

function registerAppProtocol() {
  const root = path.resolve(__dirname);

  protocol.handle('app', async (request) => {
    let rel = '/';
    try {
      rel = decodeURIComponent(new URL(request.url).pathname || '/');
    } catch (err) {
      return new Response('Bad request', { status: 400 });
    }
    if (rel === '/' || rel === '') rel = '/index.html';

    const target = path.normalize(path.join(root, rel));
    // 디렉터리 탈출 방지
    if (target !== root && !target.startsWith(root + path.sep)) {
      return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/plain' } });
    }

    const response = await net.fetch(pathToFileURL(target).toString());
    // Chromium 은 CSS/JS 에 올바른 MIME 을 요구한다 — 확장자로 명시한다.
    const mime = MIME_TYPES[path.extname(target).toLowerCase()];
    if (!mime) return response;

    const headers = new Headers(response.headers);
    headers.set('content-type', mime);
    return new Response(response.body, { status: response.status, headers });
  });
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1080,
    minHeight: 680,
    backgroundColor: '#0a0705',
    title: APP_TITLE,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      devTools: !app.isPackaged,
      additionalArguments: steamReady ? ['--cp-steam=1'] : []
    }
  });

  Menu.setApplicationMenu(null);
  mainWindow.loadURL('app://local/index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  // 외부 링크는 기본 브라우저로 (스팀 상점 페이지 등)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // F11 전체화면 / F12 개발자도구 (패키징 빌드에서는 비활성)
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      mainWindow.setFullScreen(!mainWindow.isFullScreen());
      event.preventDefault();
    }
    if (input.key === 'F12' && !app.isPackaged) {
      mainWindow.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  mainWindow.webContents.on('did-fail-load', (_e, code, desc, url) => {
    console.error('[window] did-fail-load', code, desc, url);
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// 한 번에 하나의 인스턴스만 (Steam 오버레이·클라우드 저장 충돌 방지)
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    if (process.platform === 'win32') app.setAppUserModelId(APP_ID);

    registerAppProtocol();
    initSteam();
    createWindow();

    ipcMain.handle('cp:info', () => ({
      version: app.getVersion(),
      platform: process.platform,
      steam: steamReady
    }));

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
