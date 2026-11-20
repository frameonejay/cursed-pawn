'use strict';

/* CURSED PAWN — preload bridge
   렌더러는 이 브리지를 통해서만 Steam 기능을 호출한다.
   steamworks.js 가 없거나 Electron 밖(브라우저)에서 열리면 조용히 비활성 상태가 된다. */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cpSteam', {
  available: true,
  achievement(id) {
    return ipcRenderer.invoke('cp:achievement', id);
  },
  stat(name, value) {
    return ipcRenderer.invoke('cp:stat', name, value);
  }
});
