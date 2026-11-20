'use strict';

/* ══════════════════════════════════════════════════════════════════════════
   CURSED PAWN: 영혼 전당포 — Electron entry point
   Steam 데스크톱 빌드(1280x800, 다크 배경) + steamworks.js 연동 포인트.

   · app:// 커스텀 프로토콜로 index.html 을 로드한다. (file:// 이 아니라)
     → data/game_data.json 을 fetch 로 정상 로드할 수 있고, CSP·localStorage 도
       표준 origin(app://local)으로 동작한다.
     → index.html 을 브라우저에서 직접 열면(file://) fetch 가 막혀 내장
       fallback 데이터로 완전히 동일하게 플레이된다.
   ══════════════════════════════════════════════════════════════════════════ */

const path = require('path');
const { pathToFileURL } = require('url');
const { app, BrowserWindow, Menu, ipcMain, shell, protocol, net } = require('electron');

// 오디오 자동재생 정책: Electron(로컬 앱)에서는 첫 클릭 전에도 신디사이저를 준비.
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

/* ─────────────── Steamworks.js 연동 포인트 ───────────────
   1) `npm i steamworks.js`
   2) 프로젝트 루트(개발) 또는 실행 파일 옆(배포)에 `steam_appid.txt` 배치
   3) 아래 STEAM_ENABLED = true 로 전환 후 Steam 클라이언트를 켠 상태에서 실행
   4) 업적 예시:
        steamworks.achievement.activate('ACH_FIRST_CONTRACT');
        steamworks.achievement.activate('ACH_NIGHT_5');
   5) 렌더러(게임 화면)는 preload.js 의 contextBridge 로 노출된
      `window.cpSteam` 을 통해서만 Steam 기능을 호출한다. (nodeIntegration: false 유지)
   ───────────────────────────────────────────────────────── */
const STEAM_ENABLED = false;

let steamworks = null;

function initSteam() {
  if (!STEAM_ENABLED) {
    console.log('[steam] disabled (set STEAM_ENABLED = true to enable)');
    return;
  }
  try {
    // eslint-disable-next-line global-require
    steamworks = require('steamworks.js');
    const client = steamworks.init(); // steam_appid.txt 의 AppID 사용
    console.log('[steam] initialized:', client && client.steamId ? 'ok' : 'ok');

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
        steamworks.stats.setInt(String(name), Number(value) || 0);
        steamworks.stats.store();
        return true;
      } catch (err) {
        console.warn('[steam] stat failed:', name, err.message);
        return false;
      }
    });
  } catch (err) {
    console.warn('[steam] unavailable:', err.message);
  }
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
    title: 'CURSED PAWN: 영혼 전당포',
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      devTools: !app.isPackaged
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

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('com.frameone.cursedpawn');

  registerAppProtocol();
  initSteam();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
