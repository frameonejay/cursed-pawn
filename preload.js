'use strict';

/* CURSED PAWN — preload bridge
   렌더러(게임 화면)는 이 브리지를 통해서만 Steam 기능을 호출한다.

   · Electron 밖(브라우저·GitHub Pages)에서는 window.cpSteam 자체가 없다.
   · Electron 안이라도 steamworks.js 초기화에 실패하면 available === false 이고,
     업적 호출은 조용히 무시된다(스토어 심사·오프라인 실행에서도 게임은 정상 동작). */
const { contextBridge, ipcRenderer } = require('electron');

const steamOn = Array.isArray(process.argv) && process.argv.indexOf('--cp-steam=1') >= 0;

function call(channel, ...args) {
  if (!steamOn) return Promise.resolve(false);
  return ipcRenderer.invoke(channel, ...args).catch(() => false);
}

contextBridge.exposeInMainWorld('cpSteam', {
  available: steamOn,
  /** Steamworks 업적 활성화 (예: 'ACH_FIRST_CONTRACT') */
  achievement(id) {
    return call('cp:achievement', String(id));
  },
  /** 구버전 이름 호환 */
  unlockAchievement(id) {
    return this.achievement(id);
  },
  /** 정수 스탯 저장/누적 (예: 'best_night') */
  stat(name, value) {
    return call('cp:stat', String(name), Number(value) || 0);
  },
  statAdd(name, delta) {
    return call('cp:stat-add', String(name), Number(delta) || 0);
  },
  /** 앱 버전 · 플랫폼 정보 */
  info() {
    return ipcRenderer.invoke('cp:info').catch(() => ({ version: '', platform: '' }));
  }
});
