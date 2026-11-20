#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CURSED PAWN — FALLBACK_DATA 동기화 도구.

`js/game.js` 안의 `const FALLBACK_DATA = {...};` 를 `data/game_data.json` 과
완전히 동일한 스냅샷으로 다시 쓴다. (file:// 로 열거나 JSON fetch 가 막힐 때
신규 콘텐츠까지 동일하게 플레이되도록)

사용법:
    python3 tools/build_fallback.py            # 동기화 후 결과 출력
    python3 tools/build_fallback.py --check    # 동기화 필요 여부만 확인 (CI 용, exit 1)

수정 시 주의: game.js 의 다른 부분은 건드리지 않는다.
"""
from __future__ import annotations

import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
DATA_PATH = os.path.join(ROOT, "data", "game_data.json")
GAME_PATH = os.path.join(ROOT, "js", "game.js")

PATTERN = re.compile(r"const FALLBACK_DATA = \{.*?\};\n", re.S)


def inline(data: dict) -> str:
    return "const FALLBACK_DATA = " + json.dumps(data, ensure_ascii=False, separators=(",", ":")) + ";\n"


def main() -> int:
    check_only = "--check" in sys.argv
    data = json.load(open(DATA_PATH, encoding="utf-8"))
    game = open(GAME_PATH, encoding="utf-8").read()

    match = PATTERN.search(game)
    if not match:
        print("FAIL: game.js 에서 FALLBACK_DATA 선언을 찾지 못했습니다.")
        return 2

    new_decl = inline(data)
    current = match.group(0)
    same = current.strip() == new_decl.strip()

    if check_only:
        print(("OK: FALLBACK_DATA 가 game_data.json 과 동일합니다."
               if same else "DIFF: FALLBACK_DATA 가 낡았습니다. `python3 tools/build_fallback.py` 를 실행하세요."))
        return 0 if same else 1

    if not same:
        open(GAME_PATH, "w", encoding="utf-8").write(game[:match.start()] + new_decl + game[match.end():])

    counts = data.get("meta", {}).get("content_counts", {})
    print("FALLBACK_DATA 동기화 " + ("(변경 없음)" if same else "완료"))
    print("  유물 %d · 부적 %d · 보스 저주 %d · 승천 %d · 업적 %d · 라운드 %d" % (
        len(data.get("relics", [])), len(data.get("charms", [])),
        len(data.get("boss_curses", [])), len(data.get("ascensions", [])),
        len(data.get("achievements", [])),
        sum(len(n.get("rounds", [])) for n in data.get("nights", []))))
    print("  버전 %s · content_counts %s" % (data.get("meta", {}).get("version"), counts))
    print("  크기 %.1f KB" % (len(new_decl.encode("utf-8")) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
