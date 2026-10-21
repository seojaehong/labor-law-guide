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


def _max_by_unit(text: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for q in extract_quantities(text):
        out[q.unit] = max(out.get(q.unit, q.value), q.value)
    return out


def quantity_drops(pair: ArticlePair) -> list[Drop]:
    if pair.status != "변경":
        return []
    old, new = _max_by_unit(pair.old.body), _max_by_unit(pair.new.body)
    return [Drop(unit, old[unit], new[unit]) for unit in old if unit in new and new[unit] < old[unit]]
