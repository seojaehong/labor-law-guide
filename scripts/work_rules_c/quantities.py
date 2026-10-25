"""조문 속 수치(일·주·개월·년·시간·%)를 뽑아, 종전보다 줄어든 단위를 불이익변경 신호로 돌려준다."""
import re
from dataclasses import dataclass
from typing import Literal

from work_rules_c.articles import ArticlePair

Unit = Literal["일", "주", "개월", "년", "시간", "%"]

REF = re.compile(r"제\s*\d+\s*(?:조(?:\s*의\s*\d+)?|항|호)")
FRACTION = re.compile(r"100\s*분\s*의\s*(\d+(?:\.\d+)?)")
NUMBER = re.compile(r"(\d+(?:\.\d+)?)\s*(퍼센트|%|개월|시간|일|주|년)")


@dataclass(frozen=True)
class Quantity:
    value: float
    unit: Unit
    context: str


@dataclass(frozen=True)
class Drop:
    unit: str
    old_max: float
    new_max: float


def extract_quantities(text: str) -> list[Quantity]:
    text = REF.sub(lambda m: " " * len(m.group(0)), text)
    found: list[tuple[int, Quantity]] = []
    for m in FRACTION.finditer(text):
        found.append((m.start(), Quantity(float(m.group(1)), "%", text[max(0, m.start() - 12):m.start()])))
    text = FRACTION.sub(lambda m: " " * len(m.group(0)), text)
    for m in NUMBER.finditer(text):
        value, unit = float(m.group(1)), m.group(2)
        if unit == "퍼센트":
            unit = "%"
        if unit == "년" and value >= 1900:  # 연도는 수량이 아니다
            continue
        found.append((m.start(), Quantity(value, unit, text[max(0, m.start() - 12):m.start()])))
    return [q for _, q in sorted(found, key=lambda x: x[0])]


DAYS = {"년": 365.0, "개월": 30.0, "주": 7.0, "일": 1.0}


def _group(unit: str) -> str:
    return "기간" if unit in DAYS else unit


def _values(text: str) -> dict[str, list[tuple[float, Quantity]]]:
    """단위 무리별로 (비교값, 원래 수치) — 기간은 일수로 바꿔 비교한다."""
    out: dict[str, list[tuple[float, Quantity]]] = {}
    for q in extract_quantities(text):
        v = q.value * DAYS.get(q.unit, 1.0)
        out.setdefault(_group(q.unit), []).append((v, q))
    for vs in out.values():
        vs.sort(key=lambda x: -x[0])
    return out


def quantity_drops(pair: ArticlePair) -> list[Drop]:
    """종전 수치를 큰 것부터 개정안 수치와 하나씩 맞대 보아, 작아지거나 사라진 첫 수치를 무리마다 하나 돌려준다."""
    if pair.status != "변경":
        return []
    old, new = _values(pair.old.body), _values(pair.new.body)
    drops = []
    for group, ovs in old.items():
        nvs = new.get(group, [])
        for i, (ov, oq) in enumerate(ovs):
            nv = nvs[i][0] if i < len(nvs) else 0.0
            if nv < ov:
                factor = DAYS.get(oq.unit, 1.0)
                drops.append(Drop(oq.unit, oq.value, round(nv / factor, 2)))
                break
    return drops
