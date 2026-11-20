'use strict';
/* viewport.html 의 크기 지정 스크립트 (?w=1280&h=800&v=캐시버스터) */
(function () {
  var q = new URLSearchParams(window.location.search);
  var w = Math.max(320, Math.min(1920, parseInt(q.get('w') || '1280', 10) || 1280));
  var h = Math.max(480, Math.min(1200, parseInt(q.get('h') || '800', 10) || 800));
  var f = document.getElementById('frame');
  f.width = w;
  f.height = h;
  f.style.width = w + 'px';
  f.style.height = h + 'px';
  // GitHub Pages 캐시(10분) 때문에 QA 중 낡은 빌드가 뜨지 않도록 캐시 버스터를 붙인다.
  f.src = '../../index.html?v=' + encodeURIComponent(q.get('v') || String(Date.now()));
  document.title = 'CURSED PAWN — ' + w + '×' + h;
})();
