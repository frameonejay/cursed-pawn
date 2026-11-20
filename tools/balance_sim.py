#!/usr/bin/env python3
"""CURSED PAWN 밸런스 시뮬레이터.

`data/game_data.json`의 목표/핸드/저주 수치를 그대로 읽어, "숙련 플레이어"의
각 라운드 통과율과 점수 분포를 몬테카를로로 출력한다.

정책: 매 리롤마다 5개 주사위의 32개 홀드 조합을 모두 평가해
      (남은 주사위를 무작위로 다시 굴렸을 때의 기대 점수가 최대인 조합)을 홀드한다.
      실제 사람보다 조금 낙관적이므로, 실제 통과율은 이 값보다 20~30%p 낮게 본다.

사용법:
    python3 tools/balance_sim.py                 # 라운드당 250회
    python3 tools/balance_sim.py --runs 500      # 더 정확하게
    python3 tools/balance_sim.py --csv out.csv

수정 시 주의: 이 파일은 기획 검증 도구다. 게임 런타임에는 포함되지 않는다.
"""
import argparse
import itertools
import json
import os
import random
import statistics

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "game_data.json")

PAIR_HANDS = {"one_pair", "two_pair", "three_kind", "full_house", "four_kind", "yahtzee"}

# 밤별 "기준 빌드" (칩, 배수, 곱연산). GDD §5.2의 검산과 같은 가정.
BUILDS = {
    1: (18, 0, 1.0),     # rusty_locket
    2: (18, 5, 1.0),     # + cracked_monocle, ash_ring
    3: (18, 11, 1.0),    # + blood_ledger
    4: (18, 11, 1.4),    # + gilded_grin
    5: (31, 10, 1.4),    # rare 위주로 교체한 "준수" 빌드
}
TOP_BUILD_N5 = (48, 16, 1.61)   # 6슬롯 완전 시너지 ("우수")


def load_hands(path=DATA):
    data = json.load(open(path, encoding="utf-8"))
    return {h["id"]: (h["base_chips"], h["base_mult"]) for h in data["hands"]}, data


def hand_of(dice):
    counts = {v: dice.count(v) for v in set(dice)}
    groups = sorted(counts.values(), reverse=True)
    uniq = sorted(set(dice))
    if groups[0] == 5:
        return "yahtzee"
    if groups[0] == 4:
        return "four_kind"
    if groups[0] == 3 and groups[1] == 2:
        return "full_house"
    if len(uniq) == 5 and uniq in ([1, 2, 3, 4, 5], [2, 3, 4, 5, 6]):
        return "large_straight"
    if any(set(r) <= set(uniq) for r in ([1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6])):
        return "small_straight"
    if groups[0] == 3:
        return "three_kind"
    if groups[0] == 2 and groups[1] == 2:
        return "two_pair"
    if groups[0] == 2:
        return "one_pair"
    return "high_card"


class Scorer:
    """한 라운드의 점수 규칙(유물 효과 + 보스 저주)."""

    def __init__(self, hands, chips=0, mult=0, mul=1.0, cap_six=False, pair_penalty=0, floor_pip=False):
        self.hands = hands
        self.chips = chips
        self.mult = mult
        self.mul = mul
        self.cap_six = cap_six            # cap_six_to_three: 6 -> 3
        self.pair_penalty = pair_penalty  # no_pair_bonus: 0 없음 / 1 절반 / 2 -1
        self.floor_pip = floor_pip        # no_even: 짝수 눈금은 홀드 불가(홀드는 정책 쪽에서 처리)

    def score(self, dice):
        dd = [3 if (self.cap_six and v == 6) else v for v in dice]
        hid = hand_of(dd)
        chips, mult = self.hands[hid]
        if self.pair_penalty and hid in PAIR_HANDS:
            mult = max(1, mult // 2) if self.pair_penalty == 1 else max(1, mult - 1)
        return int((chips + self.chips) * (mult + self.mult) * self.mul)


def best_keep(dice, sc, allow_even, samples, rng):
    """리롤할 때 남길 주사위 조합을 고른다 (기대 점수 최대화)."""
    best, best_ev = (), -1.0
    for r in range(6):
        for sub in itertools.combinations(range(5), r):
            if not allow_even and any(dice[i] % 2 == 0 for i in sub):
                continue
            kept = [dice[i] for i in sub]
            ev = sum(sc.score(kept + [rng.randint(1, 6) for _ in range(5 - r)])
                     for _ in range(samples)) / samples
            if ev > best_ev:
                best, best_ev = sub, ev
    return best


def play_round(sc, hands, rerolls, allow_even, samples, rng):
    total = 0
    for _ in range(hands):
        dice = [rng.randint(1, 6) for _ in range(5)]
        for _ in range(rerolls):
            keep = best_keep(dice, sc, allow_even, samples, rng)
            for i in range(5):
                if i not in keep:
                    dice[i] = rng.randint(1, 6)
        total += sc.score(dice)
    return total


def modifiers(curse):
    return {
        "cap_six": curse == "cap_six_to_three",
        "pair_penalty": 2 if curse == "no_pair_bonus" else 0,
        "allow_even": curse != "no_even",
        "reroll_delta": -1 if curse == "minus_reroll" else 0,
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--runs", type=int, default=250)
    ap.add_argument("--samples", type=int, default=12, help="홀드 조합 평가용 표본 수")
    ap.add_argument("--seed", type=int, default=31)
    ap.add_argument("--csv")
    a = ap.parse_args()

    hands, data = load_hands()
    rng = random.Random(a.seed)
    rows = []

    for night in data["nights"]:
        for rnd in night["rounds"]:
            base = BUILDS[night["night"]]
            if night["night"] == 1 and rnd["round"] == 1:
                base = (0, 0, 1.0)   # 첫 라운드는 유물 없이 시작한다
            variants = [("기준", base)]
            if night["night"] == 5 and rnd["type"] == "boss":
                variants = [("준수", base), ("우수", TOP_BUILD_N5)]

            for label, (chips, mult, mul) in variants:
                mod = modifiers(rnd["boss_curse_id"])
                sc = Scorer(hands, chips, mult, mul, mod["cap_six"], mod["pair_penalty"])
                rerolls = max(0, rnd["rerolls_per_hand"] + mod["reroll_delta"])
                scores = sorted(play_round(sc, rnd["hands_allowed"], rerolls,
                                           mod["allow_even"], a.samples, rng)
                                for _ in range(a.runs))
                target = rnd["target_score"]
                passed = sum(1 for s in scores if s >= target) / len(scores) * 100
                q = lambda p: scores[min(len(scores) - 1, int(p * len(scores)))]
                rows.append({
                    "night": night["night"], "round": rnd["round"], "type": rnd["type"],
                    "build": label, "curse": rnd["boss_curse_id"] or "-",
                    "hands": rnd["hands_allowed"], "rerolls": rerolls,
                    "target": target, "pass": passed, "mean": statistics.mean(scores),
                    "p10": q(0.10), "p50": q(0.50), "p90": q(0.90),
                })

    print(f"{'밤':>2} {'라운드':>4} {'유형':<6} {'빌드':<4} {'저주':<20} {'핸드':>4} {'목표':>7} "
          f"{'통과':>5} {'평균':>8} {'p10':>7} {'중앙':>7} {'p90':>7}")
    for r in rows:
        print(f"{r['night']:>2} {r['round']:>4} {r['type']:<6} {r['build']:<4} {r['curse']:<20} "
              f"{r['hands']:>4} {r['target']:>7,} {r['pass']:>4.0f}% {r['mean']:>8,.0f} "
              f"{r['p10']:>7,} {r['p50']:>7,} {r['p90']:>7,}")

    if a.csv:
        import csv
        with open(a.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
            w.writeheader()
            w.writerows(rows)
        print(f"\nCSV 저장: {a.csv}")


if __name__ == "__main__":
    main()
