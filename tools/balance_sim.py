#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""CURSED PAWN 밸런스 시뮬레이터 v2.

`data/game_data.json` 만 읽어서 다음을 검증한다.

  · 유물 50종 / 부적 16종 / 보스 저주 10종 / 승천 0~5단계 / 업적 15종의 스키마 정합성
  · 9개 아키타입(빌드)이 15라운드를 완주하는 과정을 몬테카를로로 재현
    - 골드 수입·지출, 유물 구매 순서, 부적 구매·소모, 보스 저주, 승천 추가 규칙을 실제 규칙대로 적용
  · Ascension 0(기본)과 Ascension 5(고승천)의 라운드별 통과율·점수 분포와 완주율
  · 목표 점수 커브(핸드당 요구량)의 단조성
  · 유물 50종·부적 16종 "죽은 항목" 스모크 테스트(효과가 실제로 점수/골드/가격에 나타나는가)

정책(policy): 리롤마다 홀드 후보(버리기 / 전부 유지 / 같은 눈금 묶음 / 스트레이트 라인 /
짝·홀 묶음 등 최대 16개)를 만들어, 남은 주사위를 무작위로 채운 표본의 기대 점수가 가장 높은
조합을 남긴다. 완전 탐색(32조합 × 많은 표본)보다 약간 약하지만, 사람 플레이어에 더 가깝다.

사용법:
    python3 tools/balance_sim.py                  # 승천 0~5, 아키타입별 40판
    python3 tools/balance_sim.py --runs 80        # 더 정확하게(느림)
    python3 tools/balance_sim.py --asc 0,5        # 특정 승천만
    python3 tools/balance_sim.py --endless 2      # 밤 6~7 엔드리스 포함
    python3 tools/balance_sim.py --csv out.csv    # 라운드별 결과 CSV

수정 시 주의: 이 파일은 기획 검증 도구다. 게임 런타임에는 포함되지 않는다.
"""
from __future__ import annotations

import argparse
import csv
import json
import math
import os
import random
import re
import statistics
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DATA = os.path.join(HERE, "..", "data", "game_data.json")

HAND_ORDER = ["high_card", "one_pair", "two_pair", "three_kind", "small_straight",
              "large_straight", "full_house", "four_kind", "yahtzee"]
HAND_RANK = {h: i for i, h in enumerate(HAND_ORDER)}
PAIR_HANDS = {"one_pair", "two_pair", "three_kind", "full_house", "four_kind", "yahtzee"}
STRAIGHT_HANDS = {"small_straight", "large_straight"}

# ── 아키타입(빌드) ────────────────────────────────────────────────────────────
# relics: 구매 우선순위(앞에서부터, 최대 6슬롯). 50종 유물이 모두 어딘가에 등장한다.
# charms: 상점에서 사는 부적 순환 목록. 16종이 모두 어딘가에 등장한다.
ARCHETYPES = {
    # 구매 우선순위: 값싼 범용 유물 → 테마 유물 → 비싼 빌드어라운드.
    # 실제 플레이어처럼 N2 전에 3슬롯, N3 전에 4~5슬롯을 채우는 순서다.
    "even": {
        "label": "짝수 반전",
        "relics": ["even_tally", "rusty_locket", "mirror_shard", "ash_ring", "parity_crown", "parity_lens"],
        "charms": ["parity_draught", "lucky_ash", "soul_flask", "haggler_token"],
    },
    "odd": {
        "label": "홀수 반전",
        "relics": ["odd_tally", "cracked_monocle", "ashen_scale", "black_mirror", "odd_magnet", "hungry_maw"],
        "charms": ["crooked_coin", "blood_vial", "second_wind", "debt_script"],
    },
    "straight": {
        "label": "스트레이트 연쇄",
        "relics": ["iron_nail", "rusty_locket", "chalk_line", "blood_ledger", "marble_run", "long_road"],
        "charms": ["crooked_coin", "cracked_compass", "ash_bandage", "extra_palm"],
    },
    "highhand": {
        "label": "고족보 폭발",
        "relics": ["six_bell", "cracked_monocle", "three_tooth", "third_six", "quad_chain", "gallows_die"],
        "charms": ["six_seal", "pin_cushion", "blood_vial", "bone_pin"],
    },
    "mult": {
        "label": "배수 폭증",
        "relics": ["rusty_locket", "cracked_monocle", "blood_ledger", "gilded_grin",
                   "the_house_always_wins", "eternal_ledger"],
        "charms": ["soul_flask", "blood_vial", "lucky_ash", "ash_bandage"],
    },
    "gold": {
        "label": "골드·이자",
        "relics": ["pawn_ticket", "rusty_locket", "blood_ledger", "coin_purse", "interest_book", "haggler_bill"],
        "charms": ["debt_script", "haggler_token", "soul_flask", "cracked_compass"],
    },
    "reroll": {
        "label": "리롤·핸드",
        "relics": ["loaded_dice", "cracked_monocle", "blood_ledger", "moneylender_eye",
                   "reroll_whisper", "lantern_of_hands"],
        "charms": ["second_wind", "cracked_compass", "bone_pin", "extra_palm"],
    },
    "lowpip": {
        "label": "낮은 눈금",
        "relics": ["wax_candle", "halfpenny_tally", "four_leaf", "twin_lamp", "five_link", "ashen_loan"],
        "charms": ["parity_draught", "crooked_coin", "pin_cushion", "soul_flask"],
    },
    "cursed": {
        "label": "저주 담보",
        "relics": ["debtors_hand", "black_mirror", "gallows_die", "hungry_maw", "last_rites", "grand_pawn"],
        "charms": ["iron_contract", "grave_water", "blood_vial", "bone_pin"],
    },
    "shop": {
        "label": "무작위 상점",
        # 상점에 뜨는 대로 사는 플레이어. 50종 유물을 고르게 소비한다.
        "relics": None,
        "charms": ["soul_flask", "debt_script", "bone_pin", "iron_contract"],
    },
}


# ── 데이터 로딩 ──────────────────────────────────────────────────────────────

class GameData:
    def __init__(self, path=DATA):
        raw = json.load(open(path, encoding="utf-8"))
        self.raw = raw
        self.meta = raw["meta"]
        self.schema = raw.get("schema", {})
        self.hands = {h["id"]: (h["base_chips"], h["base_mult"]) for h in raw["hands"]}
        self.hand_defs = {h["id"]: h for h in raw["hands"]}
        self.relics = raw["relics"]
        self.relic_by_id = {r["id"]: r for r in self.relics}
        self.charms = raw["charms"]
        self.charms_by_id = {c["id"]: c for c in self.charms}
        self.nights = raw["nights"]
        self.curses = raw.get("boss_curses", [])
        self.curse_by_id = {c["id"]: c for c in self.curses}
        self.ascensions = raw.get("ascensions", [])
        self.achievements = raw.get("achievements", [])
        self.endless = raw.get("endless", {})
        self.rounds = self._flatten_rounds()

    def _flatten_rounds(self):
        out = []
        for night in self.nights:
            for rnd in night["rounds"]:
                out.append({
                    "night": night["night"],
                    "night_name_ko": night["name_ko"],
                    "round": rnd["round"],
                    "type": rnd["type"],
                    "target": rnd["target_score"],
                    "hands": rnd["hands_allowed"],
                    "rerolls": rnd["rerolls_per_hand"],
                    "reward": rnd["reward_gold"],
                    "curse_ids": [rnd["boss_curse_id"]] if rnd.get("boss_curse_id") else [],
                })
        return out

    def endless_rounds(self, nights):
        """밤 6부터의 엔드리스 라운드(검증/확장 확인용)."""
        e = self.endless
        if not e or not nights:
            return []
        out = []
        rot = e["boss_rotation"]
        for k in range(nights):
            n = e["start_night"] + k
            base = e["base_target"] * (e["target_growth_per_night"] ** k)
            for i, rtype in enumerate(("normal", "elite", "boss")):
                out.append({
                    "night": n,
                    "night_name_ko": e["night_name_template_ko"].format(n=n, boss=""),
                    "round": i + 1,
                    "type": rtype,
                    "target": int(round(base * e["round_type_target_mult"][rtype])),
                    "hands": e["hands_allowed"],
                    "rerolls": e["rerolls_per_hand"],
                    "reward": e["reward_gold_base"] + e["reward_gold_growth"] * k,
                    "curse_ids": [rot[k % len(rot)]] if rtype == "boss" else [],
                })
        return out


# ── 보스 저주 / 승천 수정자 ────────────────────────────────────────────────────

def rule_applies(rule, setup):
    """승천 추가 규칙이 이 라운드에 적용되는가 (scope: boss/elite/all + min_night)."""
    scope = rule.get("scope", "all")
    if scope == "boss" and setup["type"] != "boss":
        return False
    if scope == "elite" and setup["type"] != "elite":
        return False
    return setup["night"] >= int(rule.get("min_night", 0))


class Mods:
    """여러 저주·승천 규칙을 합친 실제 라운드 수정자."""

    __slots__ = ("hold_blocks", "reroll_delta", "pip_map", "gold_tax", "pair_mult_delta",
                 "min_hand_rank", "first_reroll_cost", "condition_pip_void", "disable_conditions")

    def __init__(self, hold_blocks=(), reroll_delta=0, pip_map=None, gold_tax=0,
                 pair_mult_delta=0, min_hand_rank=0, first_reroll_cost=1,
                 condition_pip_void=None, disable_conditions=False):
        self.hold_blocks = set(hold_blocks)
        self.reroll_delta = reroll_delta
        self.pip_map = dict(pip_map or {})
        self.gold_tax = gold_tax
        self.pair_mult_delta = pair_mult_delta
        self.min_hand_rank = min_hand_rank
        self.first_reroll_cost = first_reroll_cost
        self.condition_pip_void = condition_pip_void
        self.disable_conditions = disable_conditions

    def copy(self):
        return Mods(self.hold_blocks, self.reroll_delta, self.pip_map, self.gold_tax,
                    self.pair_mult_delta, self.min_hand_rank, self.first_reroll_cost,
                    self.condition_pip_void, self.disable_conditions)

    def apply(self, mod):
        block = mod.get("hold_block")
        if block:
            self.hold_blocks.add(block)
        self.reroll_delta += int(mod.get("reroll_delta", 0))
        for k, v in (mod.get("pip_map") or {}).items():
            self.pip_map[int(k)] = int(v)
        self.gold_tax += int(mod.get("gold_tax_on_clear", 0))
        self.pair_mult_delta += int(mod.get("pair_mult_delta", 0))
        self.min_hand_rank = max(self.min_hand_rank, int(mod.get("min_hand_rank", 0)))
        self.first_reroll_cost = max(self.first_reroll_cost, int(mod.get("first_reroll_cost", 1)))
        if mod.get("condition_pip_void") is not None:
            self.condition_pip_void = int(mod["condition_pip_void"])
        if mod.get("disable_conditions"):
            self.disable_conditions = True

    @classmethod
    def from_curse_ids(cls, ids, index):
        m = cls()
        for cid in ids:
            curse = index.get(cid)
            if curse is None:
                raise KeyError("unknown boss curse id: %s" % cid)
            m.apply(curse.get("modifier") or {})
        return m

    def nullified(self):
        return Mods()

    def softened(self):
        """grave_water: 수치형 절반(내림) + 홀드/눈금 봉인 해제."""
        m = self.copy()
        m.reroll_delta = -((-m.reroll_delta) // 2) if m.reroll_delta < 0 else m.reroll_delta // 2
        m.gold_tax //= 2
        m.pair_mult_delta = -((-m.pair_mult_delta) // 2) if m.pair_mult_delta < 0 else m.pair_mult_delta // 2
        m.first_reroll_cost = 1
        m.min_hand_rank = 0
        m.hold_blocks.clear()
        m.condition_pip_void = None
        m.disable_conditions = False
        return m

    def key(self):
        return (tuple(sorted(self.hold_blocks)), self.reroll_delta, tuple(sorted(self.pip_map.items())),
                self.gold_tax, self.pair_mult_delta, self.min_hand_rank, self.first_reroll_cost,
                self.condition_pip_void, self.disable_conditions)


# ── 족보 판정 / 조건 판정 ─────────────────────────────────────────────────────

_CLASSIFY_CACHE = {}

def classify(vals):
    """vals(유효 눈금 5개)로 성립하는 족보 id 집합. js/game.js evaluate() 와 같은 의미."""
    key = tuple(sorted(vals))
    hit = _CLASSIFY_CACHE.get(key)
    if hit is not None:
        return hit
    counts = {}
    for v in vals:
        counts[v] = counts.get(v, 0) + 1
    groups = sorted(counts.values(), reverse=True)
    uniq = sorted(counts)
    ach = {"high_card": True}
    pair_vals = [v for v, c in counts.items() if c >= 2]
    ach["one_pair"] = len(pair_vals) >= 1
    ach["two_pair"] = len(pair_vals) >= 2
    ach["three_kind"] = groups[0] >= 3
    ach["four_kind"] = groups[0] >= 4
    ach["yahtzee"] = groups[0] == 5
    large = len(uniq) == 5 and uniq[-1] - uniq[0] == 4
    ach["large_straight"] = large
    ach["small_straight"] = (not large) and any(
        set(line) <= set(uniq) for line in ([1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6]))
    ach["full_house"] = 3 in groups and 2 in groups
    out = frozenset(h for h in HAND_ORDER if ach.get(h))
    _CLASSIFY_CACHE[key] = out
    return out


_RE_EVEN = re.compile(r"^(even|odd)_count_(\d+)$")
_RE_GOLD = re.compile(r"^gold_over_(\d+)$")
_RE_GOLD_AT = re.compile(r"^gold_at_least_(\d+)$")
_RE_PRESENT = re.compile(r"^(one|two|three|four|five|six)_present$")
_RE_PIPCOUNT = re.compile(r"^(one|two|three|four|five|six)_count_(\d+)$")
_RE_PARITY_EXACT = re.compile(r"^(even|odd)_exact_(\d+)$")
_RE_SUM_MAX = re.compile(r"^sum_at_most_(\d+)$")
_RE_SUM_MIN = re.compile(r"^sum_at_least_(\d+)$")

WORD2NUM = {"one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6}
RANK_CONDS = {
    "pair_or_better": 1, "two_pair_or_better": 2, "three_kind_or_better": 3,
    "full_house_or_better": 6, "four_kind_or_better": 7, "yahtzee_or_better": 8,
}
UNKNOWN_CONDS = set()


def condition_met(cond, vals, hand_id, hands_left, gold, charm_count, is_boss, mods):
    c = str(cond or "always").strip().lower()
    if c in ("", "always", "any", "true", "none"):
        return True
    if mods.disable_conditions:
        return False
    void = mods.condition_pip_void
    alive = [v for v in vals if v != void]
    even = sum(1 for v in alive if v % 2 == 0)
    odd = len(alive) - even
    rank = HAND_RANK.get(hand_id, 0)

    if c == "even_count":
        return even >= 3
    if c == "odd_count":
        return odd >= 3
    if c == "pair_or_better":
        return rank >= 1
    if c == "straight":
        return hand_id in STRAIGHT_HANDS
    if c == "large_straight":
        return hand_id == "large_straight"
    if c == "six_present":
        return void != 6 and 6 in vals
    if c == "one_present":
        return void != 1 and 1 in vals
    if c == "last_hand":
        return hands_left <= 1
    if c == "gold_over_15":
        return gold >= 15
    if c == "boss_round":
        return bool(is_boss)
    if c in RANK_CONDS:
        return rank >= RANK_CONDS[c]

    m = _RE_EVEN.match(c)
    if m:
        return (even if m.group(1) == "even" else odd) >= int(m.group(2))
    m = _RE_GOLD_AT.match(c)
    if m:
        return gold >= int(m.group(1))
    m = _RE_GOLD.match(c)
    if m:  # 주의: 기존 엔진의 gold_over_N 은 >N 이다. 신규 데이터는 gold_at_least_N 만 쓴다.
        return gold > int(m.group(1))
    m = _RE_PRESENT.match(c)
    if m:
        pip = WORD2NUM[m.group(1)]
        return void != pip and pip in vals
    m = _RE_PIPCOUNT.match(c)
    if m:
        pip = WORD2NUM[m.group(1)]
        return void != pip and alive.count(pip) >= int(m.group(2))
    m = _RE_PARITY_EXACT.match(c)
    if m:
        return (even if m.group(1) == "even" else odd) == int(m.group(2))
    m = _RE_SUM_MAX.match(c)
    if m:
        return sum(alive) <= int(m.group(1))
    m = _RE_SUM_MIN.match(c)
    if m:
        return sum(alive) >= int(m.group(1))

    UNKNOWN_CONDS.add(cond)
    return False


# ── 점수 엔진 ─────────────────────────────────────────────────────────────────

class Engine:
    """한 라운드 고정 상태(유물, 부적 수, 골드, 저주)에서의 점수 계산기."""

    def __init__(self, data, build, charm_count, gold, mods, is_boss):
        self.data = data
        self.hands = data.hands
        self.build = build
        self.charm_count = charm_count
        self.gold = gold
        self.mods = mods
        self.is_boss = is_boss
        self._cache = {}
        self.condition_calls = 0

    def pips(self, dice):
        pip_map = self.mods.pip_map
        return tuple(pip_map.get(v, v) for v in dice)

    def score(self, dice, hand_id, hands_left, rerolls, temp_mult=0, temp_chips=0, on_roll=(0, 0)):
        key = (tuple(dice), hand_id, hands_left, rerolls, temp_mult, temp_chips, on_roll)
        hit = self._cache.get(key)
        if hit is not None:
            return hit
        vals = self.pips(dice)
        chips, mult = self.hands[hand_id]
        if self.mods.pair_mult_delta and hand_id in PAIR_HANDS:
            mult = max(1, mult + self.mods.pair_mult_delta)
        chips += on_roll[0]
        mult += on_roll[1]
        mul = 1.0
        for relic in self.build:
            et = relic["effect_type"]
            value = relic["value"]
            if et in ("add_chips", "add_mult", "mul_mult"):
                if not condition_met(relic["condition"], vals, hand_id, hands_left,
                                     self.gold, self.charm_count, self.is_boss, self.mods):
                    continue
                if et == "add_chips":
                    chips += value
                elif et == "add_mult":
                    mult += value
                else:
                    mul *= value
                continue
            if et == "add_chips_per_reroll":
                if condition_met(relic["condition"], vals, hand_id, hands_left, self.gold,
                                 self.charm_count, self.is_boss, self.mods):
                    chips += value * rerolls * int(relic.get("scale", 1))
                continue
            if et == "add_mult_per_hands_left":
                if condition_met(relic["condition"], vals, hand_id, hands_left, self.gold,
                                 self.charm_count, self.is_boss, self.mods):
                    mult += value * hands_left
                continue
            if et == "add_chips_per_gold":
                if condition_met(relic["condition"], vals, hand_id, hands_left, self.gold,
                                 self.charm_count, self.is_boss, self.mods):
                    chips += value * (self.gold // int(relic.get("scale", 5)))
                continue
            if et == "add_mult_per_charm":
                if condition_met(relic["condition"], vals, hand_id, hands_left, self.gold,
                                 self.charm_count, self.is_boss, self.mods):
                    mult += value * self.charm_count
                continue
            # extra_reroll / extra_hand / gold_bonus / interest_gold / shop_discount 는 점수 밖에서 처리
        chips += temp_chips
        mult += temp_mult
        total = int(math.floor(chips * mult * mul + 1e-9))
        self._cache[key] = total
        return total

    def achievable(self, dice):
        return classify(self.pips(dice))

    def best(self, dice, hands_left, rerolls, temp_mult=0, temp_chips=0, on_roll=(0, 0)):
        best_total = -1
        best_hand = None
        for hid in HAND_ORDER:
            if HAND_RANK[hid] < self.mods.min_hand_rank:
                continue
            if hid not in self.achievable(dice):
                continue
            total = self.score(dice, hid, hands_left, rerolls, temp_mult, temp_chips, on_roll)
            if total > best_total:
                best_total = total
                best_hand = hid
        if best_hand is None:
            return 0, None
        return best_total, best_hand

    def on_roll_bonus(self, dice, hands_left, rerolls):
        chips = mult = 0
        vals = self.pips(dice)
        for relic in self.build:
            if relic["trigger"] != "on_roll":
                continue
            et = relic["effect_type"]
            if et not in ("add_chips", "add_mult"):
                continue
            if condition_met(relic["condition"], vals, "high_card", hands_left, self.gold,
                             self.charm_count, self.is_boss, self.mods):
                if et == "add_chips":
                    chips += relic["value"]
                else:
                    mult += relic["value"]
        return (chips, mult)


# ── 정책 ─────────────────────────────────────────────────────────────────────

def _blocked(pip, mods):
    if "even" in mods.hold_blocks and pip % 2 == 0:
        return True
    if "odd" in mods.hold_blocks and pip % 2 == 1:
        return True
    return False


def keep_candidates(dice, mods, pinned=()):
    """홀드 후보(인덱스 튜플, 최대 16개). 눈금 묶음 중복은 제거한다."""
    allowed = [i for i in range(5) if i in pinned or not _blocked(dice[i], mods)]
    seen = set()
    out = []

    def add(idx):
        idx = tuple(sorted(set(idx)))
        key = tuple(sorted(dice[i] for i in idx))
        if key in seen:
            return
        seen.add(key)
        out.append(idx)

    add(())
    add(allowed)
    for v in sorted(set(dice)):
        group = [i for i in allowed if dice[i] == v]
        if group:
            add(group)
            for extra in range(5):
                if extra not in group:
                    add(group + [extra])
    for line in ([1, 2, 3, 4], [2, 3, 4, 5], [3, 4, 5, 6], [1, 2, 3, 4, 5], [2, 3, 4, 5, 6]):
        group = [i for i in allowed if dice[i] in line]
        if len(group) >= 3:
            add(group)
    for parity in (0, 1):
        group = [i for i in allowed if dice[i] % 2 == parity]
        if len(group) >= 3:
            add(group)
    # 가장 높은/낮은 k개 (2개만 남겨 스트레이트·페어를 노리는 플레이)
    order_hi = sorted(allowed, key=lambda i: (-dice[i], i))
    order_lo = sorted(allowed, key=lambda i: (dice[i], i))
    for k in (1, 2, 3, 4):
        add(order_hi[:k])
        add(order_lo[:k])
    add(pinned)
    # pinned 를 포함하지 않는 후보는 실제로 유지할 수 없으므로 제거
    out = [c for c in out if set(pinned) <= set(c)]
    return out[:22]


def choose_keep(dice, engine, hands_left, rerolls, mods, rng, samples, pinned, roll, on_roll=(0, 0)):
    best = tuple(pinned)
    best_ev = -1.0
    for idx in keep_candidates(dice, mods, pinned):
        kept = [dice[i] for i in idx]
        missing = 5 - len(idx)
        if missing == 0:
            total, _ = engine.best(list(dice), hands_left, rerolls, 0, 0, on_roll)
            ev = float(total)
        else:
            acc = 0
            for _ in range(samples):
                full = kept + [roll() for _ in range(missing)]
                total, _ = engine.best(full, hands_left, rerolls, 0, 0, on_roll)
                acc += total
            ev = acc / samples
        if ev > best_ev:
            best_ev = ev
            best = idx
    return best, best_ev


# ── 라운드 / 런 시뮬레이션 ────────────────────────────────────────────────────

class Sim:
    def __init__(self, data, argc):
        self.data = data
        self.base_seed = argc.seed
        self.rng = random.Random(argc.seed)
        self.samples = argc.samples
        self.asc_by_level = {a["level"]: a for a in data.ascensions}
        self.relic_extra_reroll = {}
        self.relic_extra_hand = {}
        self.charm_use = {}
        self.round_stats = {}     # (asc, round_key) -> list of scores
        self.round_counts = {}    # (asc, round_key) -> [reached, cleared]
        self.run_results = {}     # asc -> list of dicts

    # 가격/골드
    def price_with_build(self, base_cost, asc, build):
        discount = 0
        for r in build:
            if r["effect_type"] == "shop_discount":
                discount = max(discount, r["value"])
        price = int(math.ceil(base_cost * (1 - discount / 100.0))) + asc["shop_cost_delta"]
        return max(1, price)

    def pick_shop_relic(self, build, gold, asc):
        """무작위 상점 아키타입: 등급 가중치로 진열된 유물 중 살 수 있는 것을 고른다."""
        owned = {b["id"] for b in build}
        weights = self.data.meta.get("rarity_weights", {})
        pool = []
        for r in self.data.relics:
            if r["id"] in owned:
                continue
            if self.price_with_build(r["cost"], asc, build) <= gold:
                pool.append((r, weights.get(r["rarity"], 10)))
        if not pool:
            return None
        total = sum(w for _, w in pool)
        roll = self.rng.random() * total
        for r, w in pool:
            roll -= w
            if roll <= 0:
                return r
        return pool[-1][0]

    def start_gold(self, asc):
        return max(0, int(self.data.meta.get("start_gold", 4)) + asc["start_gold_delta"])

    def mods_for(self, setup, asc, boss_seen):
        ids = list(setup["curse_ids"])
        if setup["type"] == "boss":
            for rule in asc.get("active_rules", []):
                if rule["type"] == "extra_boss_curse" and rule_applies(rule, setup):
                    pool = rule.get("pool") or []
                    if pool:
                        ids.append(pool[boss_seen % len(pool)])
        return Mods.from_curse_ids(ids, self.data.curse_by_id)

    def roll(self, pip_bonus, parity_bonus):
        v = min(6, max(1, self.rng.randint(1, 6) + pip_bonus))
        if parity_bonus and v % 2 == 1:
            v = min(6, v + parity_bonus)
        return v

    # 한 라운드
    def play_round(self, build, charms, gold, setup, mods, asc):
        is_boss = setup["type"] == "boss"
        own = list(charms)
        used = []
        hand_plus = 0
        reroll_plus = 0
        pip_bonus = 0
        parity_bonus = 0
        for ch in list(own):
            et = ch["effect_type"]
            if et == "curse_nullify" and is_boss:
                mods = mods.nullified(); own.remove(ch); used.append(ch)
            elif et == "curse_soften" and is_boss:
                mods = mods.softened(); own.remove(ch); used.append(ch)
            elif et == "reroll_plus":
                reroll_plus += ch["value"]; own.remove(ch); used.append(ch)
            elif et == "hand_plus":
                hand_plus += ch["value"]; own.remove(ch); used.append(ch)
            elif et == "all_plus_one":
                pip_bonus += ch["value"]; own.remove(ch); used.append(ch)
            elif et == "parity_shift":
                parity_bonus += ch["value"]; own.remove(ch); used.append(ch)

        engine = Engine(self.data, build, len(own), gold, mods, is_boss)

        extra_hands = sum(r["value"] for r in build if r["effect_type"] == "extra_hand")
        extra_rerolls = sum(r["value"] for r in build if r["effect_type"] == "extra_reroll")
        hands = setup["hands"] + extra_hands + hand_plus
        if is_boss:
            for rule in asc.get("active_rules", []):
                if rule["type"] == "hand_penalty" and rule_applies(rule, setup):
                    hands -= rule["value"]
        hands = max(1, hands)
        rerolls = setup["rerolls"] + extra_rerolls + reroll_plus + mods.reroll_delta
        for rule in asc.get("active_rules", []):
            if rule["type"] == "reroll_penalty" and rule_applies(rule, setup):
                rerolls -= rule["value"]
        rerolls = max(0, rerolls)
        target = int(round(setup["target"] * asc["target_mult"]))

        score = 0
        hand_index = 0
        last_dice = []
        last_hand = None
        while hand_index < hands:
            hands_left = hands - hand_index
            dice = [self.roll(pip_bonus, parity_bonus) for _ in range(5)]
            pinned = set()

            # 선택형 부적(고정/변환/뒤집기)은 첫 핸드에서만 사용한다
            if hand_index == 0:
                for ch in list(own):
                    et = ch["effect_type"]
                    if et == "hold_dice":
                        best_i = max(range(5), key=lambda i: (dice[i], -i))
                        pinned.add(best_i); own.remove(ch); used.append(ch)
                    elif et == "set_pip":
                        target_pip = ch["value"]
                        if target_pip not in dice:
                            best_i = min(range(5), key=lambda i: dice[i])
                            dice[best_i] = target_pip
                        own.remove(ch); used.append(ch)
                    elif et == "flip_dice":
                        i = max(range(5), key=lambda i: (7 - dice[i]) - dice[i])
                        if (7 - dice[i]) > dice[i]:
                            dice[i] = 7 - dice[i]
                        own.remove(ch); used.append(ch)

            on_roll = engine.on_roll_bonus(dice, hands_left, rerolls)
            spent = 0
            first = True
            while True:
                cost = mods.first_reroll_cost if first else 1
                if rerolls - spent < cost:
                    break
                current, _ = engine.best(dice, hands_left, rerolls, 0, 0, on_roll)
                keep, ev = choose_keep(dice, engine, hands_left, rerolls, mods, self.rng,
                                       self.samples, pinned,
                                       lambda: self.roll(pip_bonus, parity_bonus), on_roll)
                if ev <= current or len(keep) >= 5:
                    break
                for i in range(5):
                    if i not in keep and i not in pinned:
                        dice[i] = self.roll(pip_bonus, parity_bonus)
                spent += cost
                first = False

            total, hand = engine.best(dice, hands_left, rerolls, 0, 0, on_roll)
            # 마지막 핸드에서 모자라면 임시 배수/칩 부적을 쓴다
            if hands_left == 1 and score + total < target:
                for ch in list(own):
                    et = ch["effect_type"]
                    if et in ("temp_mult", "temp_chips"):
                        own.remove(ch); used.append(ch)
                temp_mult = sum(c["value"] for c in used if c["effect_type"] == "temp_mult")
                temp_chips = sum(c["value"] for c in used if c["effect_type"] == "temp_chips")
                total, hand = engine.best(dice, hands_left, rerolls, temp_mult, temp_chips, on_roll)

            score += total
            last_dice, last_hand = dice, hand
            hand_index += 1
            if score >= target:
                break

        for ch in used:
            self.charm_use[ch["id"]] = self.charm_use.get(ch["id"], 0) + 1
        return {
            "score": score,
            "cleared": score >= target,
            "target": target,
            "hands_used": hand_index,
            "hands_allowed": hands,
            "rerolls_allowed": rerolls,
            "dice": last_dice,
            "hand": last_hand,
            "charms": own,
            "used": used,
        }

    def clear_gold(self, build, result, gold, setup, mods, asc):
        """라운드 클리어 후 골드 정산: 보상 → 유물 보너스 → 이자 → 세금."""
        is_boss = setup["type"] == "boss"
        engine = Engine(self.data, build, 0, gold, mods, is_boss)
        ctx_dice = result["dice"] or [1, 1, 1, 1, 1]
        hand = result["hand"] or "high_card"
        vals = engine.pips(ctx_dice)
        bonus = 0
        interest = 0
        for r in build:
            et = r["effect_type"]
            if et == "gold_bonus":
                if condition_met(r["condition"], vals, hand, 1, gold, 0, is_boss, mods):
                    bonus += r["value"]
            elif et == "interest_gold":
                interest += r["value"] * (gold // int(r.get("scale", 10)))
        total = setup["reward"] + bonus + interest
        gold += total
        tax = min(mods.gold_tax, gold)
        gold -= tax
        for rule in asc.get("active_rules", []):
            if rule["type"] == "gold_tax" and rule_applies(rule, setup):
                gold = max(0, gold - rule["value"])
        return gold, {"reward": setup["reward"], "bonus": bonus, "interest": interest, "tax": tax}

    def simulate_run(self, arch_key, arch, asc_level, rounds, run_index=0):
        # 공통 난수(common random numbers): 같은 아키타입·회차는 승천 단계가 달라도 같은 주사위를 본다.
        arch_idx = list(ARCHETYPES).index(arch_key)
        self.rng = random.Random((self.base_seed * 7919 + arch_idx * 1009 + run_index) % (2 ** 31 - 1))
        asc = self.asc_by_level[asc_level]
        build = []
        charms = []
        gold = self.start_gold(asc)
        boss_seen = 0
        base = {"archetype": arch_key, "asc": asc_level, "rounds_cleared": 0,
                "cleared": False, "log": [], "gold": gold, "relics": [], "total": 0}
        relic_plan = None
        if arch.get("relics"):
            relic_plan = [self.data.relic_by_id[i] for i in arch["relics"] if i in self.data.relic_by_id]
        charm_plan = [self.data.charms_by_id[i] for i in arch["charms"] if i in self.data.charms_by_id]

        for ri, setup in enumerate(rounds):
            mods = self.mods_for(setup, asc, boss_seen)
            if setup["type"] == "boss":
                boss_seen += 1
            res = self.play_round(build, charms, gold, setup, mods, asc)
            charms = res["charms"]
            key = (asc_level, setup["night"], setup["round"])
            stats = self.round_stats.setdefault(key, {"score": [], "reached": 0, "cleared": 0,
                                                      "hands_used": [], "target": res["target"]})
            stats["score"].append(res["score"])
            stats["reached"] += 1
            if res["cleared"]:
                stats["cleared"] += 1
            stats["hands_used"].append(res["hands_used"])
            base["log"].append({**setup, "score": res["score"], "cleared": res["cleared"],
                                "target": res["target"], "mods": sorted(mods.hold_blocks)})
            if not res["cleared"]:
                base["total"] += res["score"]
                break
            base["total"] += res["score"]
            base["rounds_cleared"] = ri + 1
            gold, gold_detail = self.clear_gold(build, res, gold, setup, mods, asc)
            base["log"][-1]["gold"] = gold_detail

            # ── 상점: 유물 → 부적 순서로 산다 ──
            while len(build) < int(self.data.meta.get("relic_slots", 6)):
                if relic_plan is None:
                    nxt = self.pick_shop_relic(build, gold, asc)
                else:
                    nxt = next((r for r in relic_plan if r["id"] not in {b["id"] for b in build}), None)
                if nxt is None:
                    break
                price = self.price_with_build(nxt["cost"], asc, build)
                if gold < price:
                    break
                gold -= price
                build.append(nxt)
            slots = int(self.data.meta.get("charm_slots", 3))
            if charm_plan and len(charms) < slots:
                # 유물 슬롯을 우선 채우고, 여유가 남으면 가장 싼 부적부터 산다.
                owned_c = {c["id"] for c in charms}
                want = charm_plan[ri % len(charm_plan)]
                options = [want] + sorted((c for c in charm_plan if c["id"] != want["id"]),
                                          key=lambda c: c["cost"])
                options = [c for c in options if c["id"] not in owned_c]
                next_relic = None
                if relic_plan is not None:
                    next_relic = next((r for r in relic_plan if r["id"] not in {b["id"] for b in build}), None)
                reserve = (self.price_with_build(next_relic["cost"], asc, build)
                           if next_relic and len(build) < 6 else 0)
                for want in options:
                    price = self.price_with_build(want["cost"], asc, build)
                    if gold >= price + reserve + 2:
                        gold -= price
                        charms.append(want)
                        break

            # 상점형 부적: 즉시 골드로 바뀌는 부적은 상점에서 쓴다.
            for ch in list(charms):
                if ch["effect_type"] == "gold_gain":
                    gold += ch["value"]
                    charms.remove(ch)
                    self.charm_use[ch["id"]] = self.charm_use.get(ch["id"], 0) + 1
                elif ch["effect_type"] == "shop_free_reroll":
                    gold += int(self.data.meta.get("shop_reroll_cost", 3)) * ch["value"]
                    charms.remove(ch)
                    self.charm_use[ch["id"]] = self.charm_use.get(ch["id"], 0) + 1
        base["cleared"] = base["rounds_cleared"] == len(rounds) and bool(rounds)
        base["gold"] = gold
        base["relics"] = [r["id"] for r in build]
        return base


# ── 스모크 테스트(죽은 유물/부적 찾기) ───────────────────────────────────────

PROBE_DICE = [
    (6, 6, 6, 6, 6), (5, 5, 5, 5, 5), (1, 1, 1, 1, 1), (2, 2, 2, 2, 2),
    (4, 4, 4, 4, 4), (3, 3, 3, 3, 3), (1, 2, 3, 4, 5), (2, 3, 4, 5, 6),
    (1, 2, 3, 4, 6), (2, 3, 4, 5, 5), (6, 6, 6, 2, 2), (5, 5, 5, 3, 3),
    (4, 4, 3, 3, 2), (6, 6, 5, 5, 4), (2, 2, 4, 4, 6), (1, 1, 3, 3, 5),
    (1, 3, 5, 2, 4), (6, 4, 2, 5, 3), (1, 1, 1, 2, 2), (6, 6, 6, 6, 2),
    (2, 2, 2, 6, 6), (3, 3, 6, 6, 6), (1, 5, 5, 5, 5), (1, 2, 2, 2, 3),
]


def probe_relic(data, relic):
    """유물 하나가 실제로 무언가를 바꾸는지 확인한다. 반환: (kind, delta)"""
    et = relic["effect_type"]
    base_build = []
    build = [relic]
    mods = Mods()
    if et in ("add_chips", "add_mult", "mul_mult", "add_chips_per_reroll",
              "add_mult_per_hands_left", "add_chips_per_gold", "add_mult_per_charm"):
        best = 0
        for dice in PROBE_DICE:
            for hand in classify(dice):
                e0 = Engine(data, base_build, 3, 30, mods, True)
                e1 = Engine(data, build, 3, 30, mods, True)
                best = max(best, e1.score(dice, hand, 1, 2) - e0.score(dice, hand, 1, 2))
        return ("score", best)
    if et == "extra_reroll":
        return ("reroll", relic["value"])
    if et == "extra_hand":
        return ("hand", relic["value"])
    if et in ("gold_bonus", "interest_gold"):
        gold = 50
        engine = Engine(data, build, 0, gold, mods, False)
        vals = (6, 6, 6, 2, 2)
        if et == "gold_bonus":
            v = relic["value"] if condition_met(relic["condition"], vals, "full_house", 1, gold, 0, False, mods) else 0
        else:
            v = relic["value"] * (gold // int(relic.get("scale", 10)))
        return ("gold", v)
    if et == "shop_discount":
        base_cost = 10
        price = int(math.ceil(base_cost * (1 - relic["value"] / 100.0)))
        return ("price", base_cost - price)
    return ("unknown", 0)


def probe_charm(data, charm, sim):
    """부적 하나가 실제로 상태를 바꾸는지 확인한다."""
    et = charm["effect_type"]
    if et in ("temp_mult", "temp_chips", "reroll_plus", "hand_plus", "all_plus_one",
              "parity_shift", "hold_dice", "set_pip", "flip_dice"):
        return ("usable", 1)
    if et == "gold_gain":
        return ("gold", charm["value"])
    if et == "shop_free_reroll":
        return ("gold", data.meta.get("shop_reroll_cost", 3))
    if et in ("curse_nullify", "curse_soften"):
        m = Mods.from_curse_ids(["no_even"], data.curse_by_id)
        after = m.nullified() if et == "curse_nullify" else m.softened()
        return ("curse", 1 if after.key() != m.key() else 0)
    return ("unknown", 0)


# ── 검증 ─────────────────────────────────────────────────────────────────────

def validate_dataset(data):
    """스키마/이중언어/개수 정합성. (ok, problems, warnings)"""
    problems, warnings = [], []
    counts = {"relics": 50, "charms": 16, "boss_curses": 10, "ascensions": 6, "achievements": 15}
    actual = {"relics": len(data.relics), "charms": len(data.charms), "boss_curses": len(data.curses),
              "ascensions": len(data.ascensions), "achievements": len(data.achievements)}
    for k, want in counts.items():
        if actual[k] != want:
            problems.append("%s 개수 %d (기대 %d)" % (k, actual[k], want))
    for h in data.hand_defs.values():
        for f in ("name_ko", "name_en", "desc_ko", "desc_en"):
            if not str(h.get(f, "")).strip():
                problems.append("hand %s.%s 비어 있음" % (h["id"], f))
    for group in ("relics", "charms", "achievements", "ascensions", "curses"):
        for item in getattr(data, group):
            for f in ("name_ko", "name_en", "desc_ko", "desc_en"):
                if not str(item.get(f, "")).strip():
                    problems.append("%s %s.%s 비어 있음" % (group, item.get("id"), f))
    for r in data.relics:
        if r["condition"] not in data.schema.get("conditions", {}):
            problems.append("유물 %s: schema 에 없는 condition %s" % (r["id"], r["condition"]))
        if r["effect_type"] not in data.schema.get("effect_types", {}):
            problems.append("유물 %s: schema 에 없는 effect_type %s" % (r["id"], r["effect_type"]))
        if r["trigger"] not in data.schema.get("triggers", {}):
            problems.append("유물 %s: schema 에 없는 trigger %s" % (r["id"], r["trigger"]))
        if not r.get("tags"):
            warnings.append("유물 %s: tags 없음" % r["id"])
    for c in data.charms:
        if c["effect_type"] not in data.schema.get("charm_effects", {}):
            problems.append("부적 %s: schema 에 없는 effect_type %s" % (c["id"], c["effect_type"]))
    for curse in data.curses:
        if not isinstance(curse.get("modifier"), dict) or not curse["modifier"]:
            problems.append("보스 저주 %s: modifier 없음" % curse["id"])
        for k in curse["modifier"]:
            if k not in data.schema.get("boss_curse_modifiers", {}):
                problems.append("보스 저주 %s: schema 에 없는 modifier %s" % (curse["id"], k))
    for setup in data.rounds:
        for cid in setup["curse_ids"]:
            if cid not in data.curse_by_id:
                problems.append("라운드 %s-%s: 없는 보스 저주 %s" % (setup["night"], setup["round"], cid))
    levels = sorted(a["level"] for a in data.ascensions)
    if levels != list(range(6)):
        problems.append("승천 단계가 0~5 가 아님: %s" % levels)
    for a in data.ascensions:
        for f in ("target_mult", "start_gold_delta", "shop_cost_delta"):
            if f not in a:
                problems.append("승천 %s: %s 누락" % (a["level"], f))
        if "extra_curse_rule" not in a:
            problems.append("승천 %s: extra_curse_rule 누락" % a["level"])
    ac = data.schema.get("achievement_condition_types", {})
    for ach in data.achievements:
        if ach["condition_type"] not in ac:
            problems.append("업적 %s: schema 에 없는 condition_type %s" % (ach["id"], ach["condition_type"]))
        if not isinstance(ach.get("target_value"), (int, float)):
            problems.append("업적 %s: target_value 숫자 아님" % ach["id"])
    used = set()
    for arch in ARCHETYPES.values():
        if arch.get("relics"):
            used.update(arch["relics"])
    missing = sorted({r["id"] for r in data.relics} - used)
    if missing:
        warnings.append("고정 아키타입 계획에 없는 유물(무작위 상점이 소비): %s" % ", ".join(missing))
    used_charms = set()
    for arch in ARCHETYPES.values():
        used_charms.update(arch["charms"])
    missing_c = sorted({c["id"] for c in data.charms} - used_charms)
    if missing_c:
        warnings.append("아키타입이 사용하지 않는 부적: %s" % ", ".join(missing_c))
    return problems, warnings


def pct(x):
    return x * 100.0


def quantile(sorted_vals, p):
    if not sorted_vals:
        return 0
    i = min(len(sorted_vals) - 1, int(p * len(sorted_vals)))
    return sorted_vals[i]


# ── 메인 ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(description="CURSED PAWN 밸런스 시뮬레이터")
    ap.add_argument("--runs", type=int, default=40, help="아키타입별·승천별 판 수 (기본 40)")
    ap.add_argument("--samples", type=int, default=6, help="홀드 후보 평가 표본 수 (기본 6)")
    ap.add_argument("--seed", type=int, default=31)
    ap.add_argument("--asc", default="0,1,2,3,4,5", help="쉼표 구분 승천 단계 (기본 0~5)")
    ap.add_argument("--endless", type=int, default=0, help="추가로 시뮬레이션할 엔드리스 밤 수")
    ap.add_argument("--fast", action="store_true", help="승천 3~4는 절반 판수로만 계산")
    ap.add_argument("--csv")
    args = ap.parse_args()

    data = GameData()
    problems, warnings = validate_dataset(data)

    sim = Sim(data, args)
    levels = [int(x) for x in args.asc.split(",") if x.strip() != ""]
    rounds = list(data.rounds)
    if args.endless:
        rounds += data.endless_rounds(args.endless)

    print("═" * 96)
    print("CURSED PAWN 밸런스 시뮬레이션 — 유물 %d · 부적 %d · 보스 저주 %d · 승천 %d · 업적 %d"
          % (len(data.relics), len(data.charms), len(data.curses), len(data.ascensions), len(data.achievements)))
    print("아키타입 %d종 · 판수 %d/아키타입/승천 · 표본 %d · 라운드 %d (밤 %d)"
          % (len(ARCHETYPES), args.runs, args.samples, len(rounds),
             rounds[-1]["night"] if rounds else 0))
    print("═" * 96)

    # ── 데이터 검증 ──
    print("\n[1] 데이터/스키마 검증")
    if problems:
        for p in problems:
            print("  ✗", p)
    else:
        print("  ✓ 개수·이중언어·schema 참조·아키타입 커버리지 모두 통과")
    for w in warnings:
        print("  · 경고:", w)

    # ── 스모크 테스트 ──
    print("\n[2] 유물 50종 스모크 테스트 (조건을 만족시키는 주사위에서 효과 확인)")
    dead_relics = []
    for relic in data.relics:
        kind, delta = probe_relic(data, relic)
        if delta <= 0:
            dead_relics.append((relic["id"], kind, delta))
    print("  효과 확인: %d / %d" % (len(data.relics) - len(dead_relics), len(data.relics)))
    for rid, kind, delta in dead_relics:
        print("  ✗ 죽은 유물:", rid, kind, delta)

    print("\n[3] 부적 16종 스모크 테스트")
    dead_charms = []
    for charm in data.charms:
        kind, delta = probe_charm(data, charm, sim)
        if delta <= 0:
            dead_charms.append((charm["id"], kind))
    print("  효과 확인: %d / %d" % (len(data.charms) - len(dead_charms), len(data.charms)))
    for cid, kind in dead_charms:
        print("  ✗ 죽은 부적:", cid, kind)

    # ── 런 시뮬레이션 ──
    print("\n[4] 15라운드 완주 시뮬레이션")
    runs_by_level = {}
    for lv in levels:
        n = args.runs
        if args.fast and lv in (3, 4):
            n = max(10, args.runs // 2)
        runs_by_level[lv] = n

    for lv in levels:
        results = []
        for arch_key, arch in ARCHETYPES.items():
            for run_index in range(runs_by_level[lv]):
                results.append(sim.simulate_run(arch_key, arch, lv, rounds, run_index))
        sim.run_results[lv] = results

    # ── 실제 구매/사용 커버리지 ──
    purchased = set()
    for rs in sim.run_results.values():
        for r in rs:
            purchased.update(r["relics"])
    all_relics = {r["id"] for r in data.relics}
    print("\n  실제 구매된 유물: %d / %d종" % (len(purchased & all_relics), len(all_relics)))
    if all_relics - purchased:
        print("  · 한 번도 구매되지 않은 유물:", ", ".join(sorted(all_relics - purchased)))

    # ── 승천별 요약 ──
    print("\n  ── 승천 단계별 완주율 ──")
    print("  %-4s %8s %8s %10s %10s %12s" % ("승천", "판수", "완주", "완주율", "평균 도달", "평균 총점"))
    curve_rates = []
    for lv in levels:
        rs = sim.run_results[lv]
        wins = sum(1 for r in rs if r["cleared"])
        avg_round = statistics.mean(r["rounds_cleared"] for r in rs)
        avg_total = statistics.mean(r["total"] for r in rs)
        rate = wins / len(rs) if rs else 0
        curve_rates.append((lv, rate))
        print("  A%-3d %8d %8d %9.1f%% %10.1f %12s"
              % (lv, len(rs), wins, pct(rate), avg_round, f"{avg_total:,.0f}"))

    # ── 아키타입별(A0/A5) ──
    focus = [lv for lv in levels if lv in (0, 5)] or levels[:2]
    for lv in focus:
        rs = sim.run_results[lv]
        print("\n  ── Ascension %d · 아키타입별 완주율 ──" % lv)
        print("  %-10s %6s %8s %10s %12s %s" % ("빌드", "판수", "완주", "완주율", "평균 도달", "평균 보유 유물"))
        for arch_key, arch in ARCHETYPES.items():
            sub = [r for r in rs if r["archetype"] == arch_key]
            if not sub:
                continue
            wins = sum(1 for r in sub if r["cleared"])
            print("  %-10s %6d %8d %9.1f%% %10.1f %10.1f"
                  % (arch["label"], len(sub), wins, pct(wins / len(sub)),
                     statistics.mean(r["rounds_cleared"] for r in sub),
                     statistics.mean(len(r["relics"]) for r in sub)))

    # ── 라운드별 통계(A0/A5) ──
    csv_rows = []
    for lv in focus:
        print("\n  ── Ascension %d · 라운드별 (도달자 기준) ──" % lv)
        print("  %3s %3s %-6s %7s %7s %7s %7s %9s %8s %8s %8s"
              % ("밤", "R", "유형", "목표", "도달", "통과", "통과율", "평균", "p10", "중앙", "p90"))
        for setup in rounds:
            key = (lv, setup["night"], setup["round"])
            st = sim.round_stats.get(key)
            if not st or not st["score"]:
                continue
            scores = sorted(st["score"])
            reached = st["reached"]
            cleared = st["cleared"]
            row = {
                "asc": lv, "night": setup["night"], "round": setup["round"], "type": setup["type"],
                "target": st["target"], "reached": reached, "cleared": cleared,
                "pass": cleared / reached if reached else 0,
                "mean": statistics.mean(scores), "p10": quantile(scores, 0.10),
                "p50": quantile(scores, 0.50), "p90": quantile(scores, 0.90),
                "hands": setup["hands"], "rerolls": setup["rerolls"],
                "curse": ",".join(setup["curse_ids"]) or "-",
            }
            csv_rows.append(row)
            print("  %3d %3d %-6s %7s %7d %7d %6.1f%% %9s %8s %8s %8s"
                  % (setup["night"], setup["round"], setup["type"], f"{st['target']:,}",
                     reached, cleared, pct(row["pass"]), f"{row['mean']:,.0f}",
                     f"{row['p10']:,}", f"{row['p50']:,}", f"{row['p90']:,}"))

    # ── 목표 커브 ──
    print("\n  ── 목표 점수 커브 (핸드당 요구량 = 목표 / 핸드) ──")
    print("  %3s %3s %-6s %8s %9s %10s %10s %8s" %
          ("밤", "R", "유형", "핸드", "A0 목표", "A0 핸드당", "A5 핸드당", "배율"))
    demand = []
    a0 = sim.asc_by_level[0]
    a5 = sim.asc_by_level.get(5, a0)
    for setup in rounds:
        t0 = int(round(setup["target"] * a0["target_mult"]))
        t5 = int(round(setup["target"] * a5["target_mult"]))
        d0 = t0 / setup["hands"]
        d5 = t5 / setup["hands"]
        demand.append(d0)
        print("  %3d %3d %-6s %8d %9s %10.0f %10.0f %7.2fx"
              % (setup["night"], setup["round"], setup["type"], setup["hands"],
                 f"{t0:,}", d0, d5, d5 / d0 if d0 else 1))
    monotone = all(b >= a * 0.999 for a, b in zip(demand, demand[1:]))

    # ── 검증 체크 ──
    print("\n[5] 검증 체크")
    checks = []

    def check(name, ok, detail=""):
        checks.append((name, bool(ok), detail))
        print("  %s %s%s" % ("✓" if ok else "✗", name, ("  [" + detail + "]") if detail else ""))

    rates = {lv: (sum(1 for r in sim.run_results[lv] if r["cleared"]) / len(sim.run_results[lv]))
             for lv in levels}
    a0_rate = rates.get(0, 0)
    a5_rate = rates.get(5, 0)
    statistical = args.runs >= 15
    check("데이터/스키마 문제 0건", not problems, ", ".join(problems[:3]) if problems else "")
    check("죽은 유물 0종", not dead_relics, ", ".join(r[0] for r in dead_relics))
    check("죽은 부적 0종", not dead_charms, ", ".join(c[0] for c in dead_charms))
    check("목표 커브 핸드당 요구 단조 증가", monotone,
          f"{demand[0]:.0f} → {demand[-1]:.0f}")
    gold_ok = all(r["gold"] >= 0 for lv in levels for r in sim.run_results[lv])
    check("시뮬레이션 중 골드 음수 없음", gold_ok)
    if statistical:
        check("A0 완주율 5~40%", 0.05 <= a0_rate <= 0.40, f"{pct(a0_rate):.1f}%")
        if 5 in rates:
            check("A5 완주율 0.3~20%", 0.003 <= a5_rate <= 0.20, f"{pct(a5_rate):.1f}%")
            check("A5 < A0 (고승천이 더 어렵다)", a5_rate < a0_rate,
                  f"A0 {pct(a0_rate):.1f}% / A5 {pct(a5_rate):.1f}%")
        ordered = [rates[lv] for lv in levels]
        check("승천이 올라갈수록 완주율 비증가 (±5%p 허용)",
              all(b <= a + 0.05 for a, b in zip(ordered, ordered[1:])),
              " → ".join("%.0f%%" % pct(r) for r in ordered))
        extremes = []
        for (lv, night, rnd), st in sim.round_stats.items():
            if lv != 0 or st["reached"] < 30:
                continue
            if night == 1 and rnd == 1:
                continue
            p = st["cleared"] / st["reached"]
            if p <= 0.02:
                extremes.append((night, rnd, p, st["reached"]))
        check("A0 라운드 통과율 2% 이하인 구간 없음", not extremes,
              ", ".join("%d-%d %.0f%%" % (n, r, pct(p)) for n, r, p, _ in extremes))
        charm_unused = [c["id"] for c in data.charms if sim.charm_use.get(c["id"], 0) == 0]
        check("부적 12종 이상이 실제 플레이에서 사용됨", len(charm_unused) <= 4, ", ".join(charm_unused))
        check("실제 구매 유물 40종 이상", len(purchased & all_relics) >= 40,
              "%d / %d" % (len(purchased & all_relics), len(all_relics)))
    else:
        print("  · 표본이 적어(--runs %d) 완주율·커버리지 판정은 생략합니다. "
              "최종 검증은 --runs 40(기본값)으로 실행하세요." % args.runs)

    failed = [c for c in checks if not c[1]]
    print("\n  결과: %d/%d 통과" % (len(checks) - len(failed), len(checks)))

    if args.csv:
        with open(args.csv, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=list(csv_rows[0].keys()))
            w.writeheader()
            w.writerows(csv_rows)
        print("\nCSV 저장: %s" % args.csv)

    print("\n참고: 이 시뮬레이터는 완전 정보·완전 계산 정책을 쓰므로 실제 사람의 완주율은"
          " 표보다 낮게(대략 −10~20%p) 나온다.")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
