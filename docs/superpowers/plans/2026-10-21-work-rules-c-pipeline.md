# 취업규칙 정밀 점검(C) 저비용 파이프라인 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** /취업규칙검토(C)의 에이전트 루프를 「결정적 단계 + Haiku 1차 분류 + 교체 가능한 판단 백엔드」 고정 파이프라인으로 바꿔, 건당 비용을 재고 정답지 대비 놓친 항목을 측정할 수 있게 한다.

**Architecture:** `scripts/work_rules_c/` 파이썬 패키지. 조문 분할·짝짓기·수치 비교·법령 매핑은 LLM 없이 하고(매핑은 기존 `scripts/laws/rules_impact.py` 재사용), 조문별 1차 분류는 교체 가능한 `TriageBackend`(Haiku 5.5 구조화 출력 · Jev · OpenAI Decisions 확률 질문)로, 올라온 조문만 `JudgeBackend` 로 판단한다. 결과는 표준 열 `comparison.v1` JSON + 검수용 md, 단계별 토큰·비용은 `cost.json`.

**Tech Stack:** Python 3.13, `anthropic` 0.85(`client.messages.parse(output_format=...)`), pydantic(anthropic 의존성), python-docx, pytest 9.

**Spec:** `docs/superpowers/specs/2026-10-21-work-rules-c-pipeline-design.md`

## Global Constraints

- 고객 취업규칙 원문·정답지는 레포에 넣지 않는다. 테스트 픽스처는 짧은 합성 문안 또는 `scripts/laws/standard_rules.json`(공개 표준취업규칙)에서 뽑은 문안만 쓴다.
- 사용자에게 보이는 문자열(산출 JSON 값·md)은 점검·대조·확인·정리·기준·알림 어휘만 쓴다. 「판정·자문·상담·진단」 금지. 열 이름은 `점검 결과`.
- 확률·적중률·정확도 숫자는 산출물(comparison JSON·md)에 넣지 않는다. 평가 지표는 `eval` 명령의 콘솔 출력에만.
- 1차 분류 백엔드 = `haiku`(`claude-haiku-5-5`) · `jev`(`jev-latest`) · `openai`(`gpt-6-luna`) 셋. 기본값은 정답지 실측(Task 8 Step 6) 뒤에 정한다 — 그 전까지 CLI 는 `--triage` 를 필수로 받는다. 판단 백엔드 기본값 = `AnthropicJudge(model="claude-opus-5-5")`, CLI `--judge-model` 로 바꾼다. laya 백엔드는 이 계획 범위 밖이다(재홍님 설명 = Jev 서버의 오픈소스 버전, 노션·서버 기록 미확인). 다만 Jev 류(글 없이 `choice`·`noul` 확률만 반환, 10/6 실측 조문 재선택 7/8·12라벨 분류 55%)가 들어올 자리를 미리 둔다 — `JudgeOut.confidence`(0~1, 백엔드가 안 주면 None)와 `--min-confidence`(기본 0.8). confidence 가 문턱 아래면 `result="추가 확인"` 으로 바꾼다. 글(`reason`·`proposed_text`)을 안 쓰는 백엔드는 빈 문자열을 돌려주고 검수자가 채운다.
- 단가 표(per 1M tokens, input/output/cache read): `claude-haiku-5-5` 0.10/0.50/0.01 · `claude-sonnet-5-5` 2.00/10.00/0.20 · `claude-opus-5-5` 4.00/20.00/0.20. 표에 없는 모델은 비용 0 + 경고.
- 날짜는 `datetime.date` 로 비교한다. `--asof` 문자열을 그대로 비교하지 않는다(10/4 실측 함정).
- 테스트는 API를 부르지 않는다. 클라이언트는 주입하고 테스트에서는 가짜 객체를 쓴다.
- 실행 위치는 레포 루트: 테스트 `python3 -m pytest scripts/work_rules_c/tests -q`, 실행 `python3 scripts/work_rules_c/run.py ...`.
- 패키지 안 import 는 `from work_rules_c.articles import ...` 꼴. `scripts/` 를 `sys.path` 에 넣는 곳은 두 군데뿐 — `scripts/work_rules_c/tests/conftest.py` 와 `run.py`·`eval.py` 첫머리(`sys.path.insert(0, str(Path(__file__).resolve().parents[1]))`).

## Review Focus

1. 부칙·별지의 「제1조」가 본칙 제1조를 덮어쓴다(10/21 드리븐 대조에서 실제로 났다) — 본칙만 남아야 한다. → Task 1 `test_supplementary_does_not_override_body`
2. 내용이 다른 이름 조문 안에 있다(배우자 출산휴가가 「경조사 휴가」 조 안) — 「누락」으로 보면 안 된다. → Task 3 `test_rule_found_in_differently_titled_article`
3. 법정 기준에 맞추느라 종전의 더 유리한 수치를 깎는다(드리븐 제50조 「총 3년」→「1년 이내」) — 불이익변경 신호가 떠야 하고, 늘어난 경우(10일→20일)는 뜨면 안 된다. → Task 2 `test_drop_detected` · `test_increase_not_flagged`
4. Haiku 호출이 실패·거부·스키마 오류를 낸다 — 그 조문은 「문제없음」이 아니라 위로 올라가야 한다. → Task 4 `test_api_error_escalates` · `test_refusal_escalates`
5. PDF 추출 텍스트의 쪽 표시(`- 12 -`)가 조문 본문에 섞인다 — 대조에서 「변경」으로 잡히면 안 된다. → Task 1 `test_page_markers_ignored`

---

### Task 1: 조문 분할과 신구 짝짓기

**Files:**
- Create: `scripts/work_rules_c/__init__.py`(빈 파일), `scripts/work_rules_c/articles.py`
- Test: `scripts/work_rules_c/tests/conftest.py`(`scripts/` 를 `sys.path` 앞에 넣는다), `scripts/work_rules_c/tests/test_articles.py`

**Interfaces:**
- Produces:
  - `@dataclass(frozen=True) class Article: no: str; title: str; body: str` — `no` 는 공백 없는 「제50조」「제26조의2」
  - `split_articles(text: str) -> list[Article]` — 본칙만. 「부칙」「개정 부칙」「[별지」 줄에서 멈춘다. 목차처럼 같은 번호가 두 번 나오면 뒤(본문)를 쓴다. `^-\s*\d+\s*-$` 줄은 버린다
  - `@dataclass(frozen=True) class ArticlePair: no: str; status: Literal["동일","변경","신설","삭제"]; old: Article | None; new: Article | None`
  - `pair_articles(old: list[Article], new: list[Article]) -> list[ArticlePair]` — 번호로 짝짓고 공백 제거 후 본문이 같으면 「동일」. 번호순 정렬(제26조 < 제26조의2 < 제27조)
  - `read_text(path: Path) -> str` — `.txt` `.md` 그대로, `.docx` 는 python-docx 로 문단·표(셀을 ` | ` 로 이음) 순서대로, `.hwpx` 는 zip 안 `Contents/section*.xml` 의 `<hp:t>` 텍스트를 문단(`<hp:p>`) 단위 줄로. 그 밖의 확장자는 `ValueError("지원하지 않는 형식")`

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_split_basic():
    t = "제1조(목적) 이 규칙은...\n제2조(적용) ① 근로자에게 적용한다.\n② 예외는 없다."
    arts = split_articles(t)
    assert [a.no for a in arts] == ["제1조", "제2조"]
    assert arts[1].title == "적용" and "② 예외는 없다." in arts[1].body

def test_supplementary_does_not_override_body():
    t = "제1조(목적) 본칙 목적\n부 칙\n제1조(시행일) 2026년부터 시행"
    assert split_articles(t)[0].body.startswith("본칙 목적")
    assert len(split_articles(t)) == 1

def test_toc_then_body_uses_body():
    t = "제1조(목적)\n제2조(적용)\n제1조(목적) 실제 본문\n제2조(적용) 실제 적용"
    assert split_articles(t)[0].body == "실제 본문"

def test_page_markers_ignored():
    old = split_articles("제7조(금지) 강요하지 못한다.\n- 7 -")
    new = split_articles("제7조(금지) 강요하지 못한다.")
    assert pair_articles(old, new)[0].status == "동일"

def test_pair_statuses_and_order():
    old = split_articles("제26조(육아휴직) A\n제27조(가족돌봄) B")
    new = split_articles("제26조(육아휴직) A2\n제26조의2(단기 육아휴직) C\n제27조(가족돌봄) B")
    got = [(p.no, p.status) for p in pair_articles(old, new)]
    assert got == [("제26조", "변경"), ("제26조의2", "신설"), ("제27조", "동일")]
```

- [ ] **Step 2: 실패 확인** — `python3 -m pytest scripts/work_rules_c/tests/test_articles.py -q` → `ModuleNotFoundError`/`ImportError`
- [ ] **Step 3: `articles.py` 구현** — 조 머리 정규식은 `rules_impact.ART` 와 같은 꼴 `^\s*(제\s*\d+\s*조(?:\s*의\s*\d+)?)\s*\(([^)]*)\)` 를 쓰고 번호의 공백을 지운다. 정렬 키는 번호 안 숫자 목록(`[26]` < `[26, 2]` < `[27]`)
- [ ] **Step 4: 통과 확인** — 같은 명령 → `5 passed`
- [ ] **Step 5: 커밋** — `git add scripts/work_rules_c && git commit -m "feat(work-rules-c): split and pair articles"`

---

### Task 2: 수치 추출과 하락 비교 (불이익변경 신호)

**Files:**
- Create: `scripts/work_rules_c/quantities.py`
- Test: `scripts/work_rules_c/tests/test_quantities.py`

**Interfaces:**
- Consumes: `ArticlePair` (Task 1)
- Produces:
  - `@dataclass(frozen=True) class Quantity: value: float; unit: Literal["일","주","개월","년","시간","%"]; context: str` — `context` 는 수치 앞 12자
  - `extract_quantities(text: str) -> list[Quantity]` — 「3년」「30일」「100분의 50」(→ 50 %)「90퍼센트」(→ %) 를 잡는다. 「제3조」「제1항」「1회」「2명」은 잡지 않는다
  - `@dataclass(frozen=True) class Drop: unit: str; old_max: float; new_max: float`
  - `quantity_drops(pair: ArticlePair) -> list[Drop]` — 「변경」 쌍만. 단위별 최댓값을 비교해 개정안이 작아진 단위만 돌려준다

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def _pair(old, new):
    o, n = split_articles(f"제50조(단축) {old}"), split_articles(f"제50조(단축) {new}")
    return pair_articles(o, n)[0]

def test_extract_skips_article_refs():
    q = extract_quantities("제3조제1항에 따라 연간 6일, 최초 2일은 유급")
    assert [(x.value, x.unit) for x in q] == [(6, "일"), (2, "일")]

def test_extract_percent_forms():
    q = extract_quantities("통상임금의 100분의 50 이상, 평균임금 70퍼센트")
    assert {(x.value, x.unit) for x in q} == {(50, "%"), (70, "%")}

def test_drop_detected():
    p = _pair("단축 기간은 최대 3년 이내로 한다.", "기간은 1년 이내로 하되 미사용 기간의 두 배를 가산할 수 있다.")
    assert quantity_drops(p) == [Drop(unit="년", old_max=3, new_max=1)]

def test_increase_not_flagged():
    p = _pair("배우자 출산휴가 10일", "배우자 출산전후휴가 20일")
    assert quantity_drops(p) == []
```

- [ ] **Step 2: 실패 확인** — `python3 -m pytest scripts/work_rules_c/tests/test_quantities.py -q` → ImportError
- [ ] **Step 3: `quantities.py` 구현** — 「제N조/항/호」 앞뒤 숫자는 정규식 부정 전방탐색으로 제외. 「두 배」 같은 한글 수사는 잡지 않는다(YAGNI)
- [ ] **Step 4: 통과 확인** → `4 passed`
- [ ] **Step 5: 커밋** — `git commit -m "feat(work-rules-c): quantity drop signal"`

---

### Task 3: 법령 매핑 후보 (rules_impact 재사용)

**Files:**
- Create: `scripts/work_rules_c/mapping.py`
- Test: `scripts/work_rules_c/tests/test_mapping.py`

**Interfaces:**
- Consumes: `Article` (Task 1), `scripts/laws/rules_impact.py` 의 `paragraphs(text) -> list[dict]`, `judge(rule, paras) -> dict`(`sys.path` 에 `scripts/laws` 를 넣고 import)
- Produces:
  - `@dataclass(frozen=True) class RuleHit: topic: str; law_id: str; law_article: str; effective: date; required: bool; status: Literal["반영됨","미반영","누락"]; where: str | None; stale: tuple[str, ...]; missing: tuple[str, ...]`
  - `map_rules(articles: list[Article], asof: date, since: date, rules: list[dict] | None = None) -> list[RuleHit]` — `rules` 가 None 이면 `work_rules_map.json` 의 `rules`. `since <= effective` 인 규칙만, `effective > asof` 이면 시행 예정으로 보고 그대로 포함(구분은 `effective` 로 한다). 판정은 `judge()` 결과를 옮길 뿐 새 로직을 넣지 않는다
  - `hits_by_article(hits: list[RuleHit]) -> dict[str, list[RuleHit]]` — `where` 의 「제N조(제목)」에서 번호만 뽑아 키로. `where` 가 None(누락)이면 키 `"(신설 필요)"`

- [ ] **Step 1: 실패하는 테스트 작성**

```python
RULE = {"lawId": "000130", "article": "제18조의2", "effective": "20250223", "topic": "배우자 출산휴가 20일",
        "required": True, "keywords": ["배우자 출산"], "ok": ["20일"], "stale": ["10일"], "art93": "8"}

def test_rule_found_in_differently_titled_article():
    arts = split_articles("제46조(경조사 휴가) ① 본인 결혼 5일\n② 배우자 출산휴가는 10일로 한다.")
    [h] = map_rules(arts, asof=date(2026, 10, 21), since=date(2023, 1, 1), rules=[RULE])
    assert h.status == "미반영" and h.where.startswith("제46조") and h.stale == ("10일",)

def test_missing_goes_to_new_bucket():
    hits = map_rules(split_articles("제1조(목적) 목적"), date(2026, 10, 21), date(2023, 1, 1), rules=[RULE])
    assert list(hits_by_article(hits)) == ["(신설 필요)"]

def test_since_filters_old_rules():
    assert map_rules(split_articles("제1조(목적) x"), date(2026, 10, 21), date(2025, 3, 1), rules=[RULE]) == []
```

- [ ] **Step 2: 실패 확인** → ImportError
- [ ] **Step 3: `mapping.py` 구현** — 조문을 「제N조(제목) 본문」 줄로 다시 이어 `paragraphs()` 에 넣는다. `effective` 는 `date(int(s[:4]), int(s[4:6]), int(s[6:]))`
- [ ] **Step 4: 통과 확인** → `3 passed`
- [ ] **Step 5: 커밋** — `git commit -m "feat(work-rules-c): map law rules via rules_impact"`

---

### Task 4: Haiku 1차 분류

**Files:**
- Create: `scripts/work_rules_c/triage.py`, `scripts/work_rules_c/prompts/triage_system.md`
- Test: `scripts/work_rules_c/tests/test_triage.py`

**Interfaces:**
- Consumes: `ArticlePair`, `Drop`, `RuleHit`
- Produces:
  - `class TriageOut(BaseModel): label: Literal["문제없음","확인필요","문제"]; reasons: list[str]; topics: list[str]` — 구조화 출력 스키마
  - `@dataclass class Usage: model: str; input_tokens: int = 0; output_tokens: int = 0; cache_read_input_tokens: int = 0; cache_creation_input_tokens: int = 0` + `def add(self, u) -> None`(SDK `usage` 객체 누적)
  - `@dataclass(frozen=True) class Triage: no: str; label: str; reasons: tuple[str, ...]; escalate: bool`
  - `triage_pair(client, pair: ArticlePair, drops: list[Drop], hits: list[RuleHit], usage: Usage) -> Triage`
  - 상수 `TRIAGE_MODEL = "claude-haiku-5-5"`
  - `class TriageBackend(Protocol): name: str; usage: Usage; def triage(self, pair, drops, hits) -> Triage: ...`(`runtime_checkable`)
  - `class HaikuTriage: def __init__(self, client)` — `name = "anthropic:claude-haiku-5-5"`, `triage()` 는 `triage_pair(self.client, ..., self.usage)`
  - 공통 규칙 함수 `force_escalate(drops, hits) -> bool`(하락 신호 또는 `status != "반영됨"` 매핑) — Task 4b 백엔드도 이것을 쓴다
  - 「동일」 쌍 건너뛰기도 `triage_pair` 가 아니라 `skip_same(pair, drops, hits) -> Triage | None` 로 빼서 모든 백엔드가 쓴다
- 호출 꼴(문서 확인분): `client.messages.parse(model=TRIAGE_MODEL, max_tokens=1024, output_config={"effort": "low"}, system=[{"type": "text", "text": SYSTEM, "cache_control": {"type": "ephemeral"}}], messages=[{"role": "user", "content": <조문 JSON>}], output_format=TriageOut)` → `resp.parsed_output`, `resp.usage`, `resp.stop_reason`
- 위로 올리는 규칙(`escalate=True`): `label != "문제없음"` 또는 `drops` 가 비지 않음 또는 `hits` 중 `status != "반영됨"` 이 있음 또는 호출 실패(`anthropic.APIError` 계열)·`stop_reason == "refusal"`·`parsed_output is None`. 실패 시 `label="확인필요"`, `reasons=("1차 분류 실패: <예외 클래스 이름>",)`
- 「동일」 쌍은 호출하지 않고 `Triage(no, "문제없음", (), escalate=bool(drops or 미반영 hits))` 를 바로 돌려준다
- 시스템 프롬프트(`prompts/triage_system.md`)는 고정 문자열이라 캐시된다. 날짜·고객명·조문을 넣지 않는다. 내용 = 4분류 정의(Spec 결정 4), 「확실하지 않으면 확인필요」, 출력은 스키마만

- [ ] **Step 1: 실패하는 테스트 작성** — 가짜 클라이언트 `FakeClient(parse=...)` 를 테스트 파일 안에 둔다

```python
def test_same_pair_skips_api():
    c = FakeClient(fail_if_called=True)
    t = triage_pair(c, _same_pair(), [], [], Usage(TRIAGE_MODEL))
    assert t.label == "문제없음" and not t.escalate

def test_clean_label_not_escalated():
    c = FakeClient(out=TriageOut(label="문제없음", reasons=[], topics=[]))
    assert not triage_pair(c, _changed_pair(), [], [], Usage(TRIAGE_MODEL)).escalate

def test_drop_forces_escalation_even_if_clean():
    c = FakeClient(out=TriageOut(label="문제없음", reasons=[], topics=[]))
    t = triage_pair(c, _changed_pair(), [Drop("년", 3, 1)], [], Usage(TRIAGE_MODEL))
    assert t.escalate

def test_api_error_escalates():
    c = FakeClient(raises=anthropic.APIConnectionError(request=httpx_request()))
    t = triage_pair(c, _changed_pair(), [], [], Usage(TRIAGE_MODEL))
    assert t.escalate and t.label == "확인필요" and "APIConnectionError" in t.reasons[0]

def test_refusal_escalates():
    c = FakeClient(out=None, stop_reason="refusal")
    assert triage_pair(c, _changed_pair(), [], [], Usage(TRIAGE_MODEL)).escalate

def test_usage_accumulates():
    u = Usage(TRIAGE_MODEL)
    triage_pair(FakeClient(out=TriageOut(label="문제", reasons=["x"], topics=[]), usage=(100, 20, 900)), _changed_pair(), [], [], u)
    assert (u.input_tokens, u.output_tokens, u.cache_read_input_tokens) == (100, 20, 900)

def test_system_prompt_has_no_volatile_content():
    s = (Path(triage.__file__).parent / "prompts" / "triage_system.md").read_text(encoding="utf-8")
    assert not re.search(r"20\d\d[-.]\d", s)
```

- [ ] **Step 2: 실패 확인** — `python3 -m pytest scripts/work_rules_c/tests/test_triage.py -q` → ImportError
- [ ] **Step 3: `triage.py`·시스템 프롬프트 구현** — `httpx_request()` 는 테스트 헬퍼로 `anthropic` 이 쓰는 HTTP 라이브러리의 `Request("POST", "https://x")` 를 만든다(설치된 0.85 는 `httpx`)
- [ ] **Step 4: 통과 확인** → `7 passed`
- [ ] **Step 5: 커밋** — `git commit -m "feat(work-rules-c): haiku triage with escalation"`

---

### Task 4b: 판단 모델 백엔드 (Jev · OpenAI Decisions)

**Files:**
- Create: `scripts/work_rules_c/decisions.py`
- Test: `scripts/work_rules_c/tests/test_decisions.py`

**Interfaces:**
- Consumes: `TriageBackend`, `Triage`, `Usage`, `force_escalate`, `skip_same` (Task 4)
- Produces:
  - `@dataclass(frozen=True) class DQ: name: str; kind: Literal["yesno","choice"]; instructions: str; true: str = ""; false: str = ""; choices: tuple[tuple[str, str], ...] = ()` — 백엔드 중립 질문
  - `@dataclass(frozen=True) class DA: name: str; p_yes: float | None; choice: str | None; confidence: float | None; refused: bool = False`
  - `class DecisionClient(Protocol): name: str; def ask(self, state: dict, questions: list[DQ]) -> tuple[dict[str, DA], dict]` — 두 번째 값은 `{"input_tokens": n, "output_tokens": m}`
  - `class JevClient(DecisionClient): __init__(self, api_key: str, model: str = "jev-latest", timeout: float = 10.0)` — SDK 가 없어 `urllib.request` 로 `POST https://api.typesafe.ai/v1/systemone`, 본문 `{"model", "state", "questions": {name: ...}}`. `yesno` → `{"type": "noul", "instructions", "criteria": {"true", "false"}}`, `choice` → `{"type": "choice", "instructions", "criteria": {값: 설명}}`. 응답 `answers[name]` 의 `noul` → `p_yes`, `choice`/`confidence` 그대로. `name = "jev:<model>"`
  - `class OpenAIDecisionsClient(DecisionClient): __init__(self, client, model: str = "gpt-6-luna")` — `client.decisions.create(model, input=json.dumps(state, ensure_ascii=False), questions=[...])`. `yesno` → `{"type": "predicate", "name", "instructions": f"{instructions} 예: {true} / 아니오: {false}"}`, `choice` → `{"type": "choice", "name", "instructions", "choices": [{"value", "description"}]}`. 답 `type == "refusal"` → `DA(refused=True)`, `predicate` 의 `probability` → `p_yes`. `name = "openai:<model>"`
  - `class DecisionTriage(TriageBackend): __init__(self, client: DecisionClient, yes_threshold: float = 0.3, min_confidence: float = 0.8)` — 조문마다 한 번 `ask()`. 질문 4개(이름·문구 고정):
    - `below_law` yesno — 「개정안이 관련 법령 기준보다 근로자에게 불리하거나 법이 요구하는 사항을 빠뜨렸다」
    - `worse_than_old` yesno — 「개정안이 종전 규정보다 근로조건을 낮췄다」(종전이 없으면 묻지 않는다)
    - `hard_to_run` yesno — 「규정한 절차(정족수·재심 인원·필수 심의)를 이 사업장 규모로 지키기 어렵다」
    - `kind` choice — `현행 수정 필요` · `시행 예정` · `회사 선택` · `추가 확인` · `문제없음`(가이드 권고대로 빠져나갈 보기를 둔다)
    - `state` = `{"조문": no, "종전": old.body | "", "개정안": new.body, "관련 법령 기준": [hit.topic ...], "사업장 상시 인원": meta 값 또는 ""}`
    - `escalate` = `force_escalate(...)` 또는 yesno 중 하나라도 `p_yes >= yes_threshold` 또는 `kind != "문제없음"` 또는 `confidence < min_confidence` 또는 거부·호출 실패. `label` = 올라가면 `"확인필요"`, 아니면 `"문제없음"`. `reasons` = 문턱을 넘은 질문 이름과 확률(`"worse_than_old 0.82"`) — 이 문자열은 내부 기록이라 산출물에 싣지 않는다(Task 6 은 `Triage.reasons` 를 쓰지 않는다)
  - `PRICES` 추가(Task 7 의 `cost.py`): `"jev-latest": (0.042, 0.0, 0.0)` · `"gpt-6-luna": (0.10, 0.0, 0.0)` — 두 값 모두 첫 실측 청구로 재확인한다는 주석

- [ ] **Step 1: 실패하는 테스트 작성** — 가짜 `DecisionClient` 로. 실제 HTTP 는 `JevClient._post` 를 갈아 끼워 요청 본문만 검사한다

```python
def test_jev_request_shape():
    c = JevClient(api_key="k"); sent = {}
    c._post = lambda body: (sent.update(body), {"answers": {"below_law": {"type": "noul", "noul": 0.1}}, "usage": {"input_tokens": 9, "output_tokens": 1}})[1]
    ans, usage = c.ask({"개정안": "x"}, [DQ("below_law", "yesno", "q", true="t", false="f")])
    assert sent["questions"]["below_law"] == {"type": "noul", "instructions": "q", "criteria": {"true": "t", "false": "f"}}
    assert ans["below_law"].p_yes == 0.1 and usage["input_tokens"] == 9

def test_openai_request_shape():
    fake = FakeOpenAI(answers=[{"type": "predicate", "name": "below_law", "probability": 0.7}])
    ans, _ = OpenAIDecisionsClient(fake).ask({"개정안": "x"}, [DQ("below_law", "yesno", "q", true="t", false="f")])
    assert fake.last["questions"][0]["type"] == "predicate" and ans["below_law"].p_yes == 0.7

def test_openai_refusal_escalates():
    t = DecisionTriage(FakeDecision(refuse="kind")).triage(_changed_pair(), [], [])
    assert t.escalate

def test_low_probabilities_clean_not_escalated():
    t = DecisionTriage(FakeDecision(p=0.05, kind="문제없음", confidence=0.95)).triage(_changed_pair(), [], [])
    assert not t.escalate and t.label == "문제없음"

def test_worse_than_old_over_threshold_escalates():
    t = DecisionTriage(FakeDecision(p={"worse_than_old": 0.4}, kind="문제없음", confidence=0.95)).triage(_changed_pair(), [], [])
    assert t.escalate and "worse_than_old" in t.reasons[0]

def test_low_confidence_escalates():
    assert DecisionTriage(FakeDecision(p=0.05, kind="문제없음", confidence=0.6)).triage(_changed_pair(), [], []).escalate

def test_new_article_skips_worse_than_old():
    fake = FakeDecision(p=0.05, kind="문제없음", confidence=0.95)
    DecisionTriage(fake).triage(_new_only_pair(), [], [])
    assert "worse_than_old" not in [q.name for q in fake.last_questions]

def test_http_error_escalates():
    t = DecisionTriage(FakeDecision(raises=OSError("timeout"))).triage(_changed_pair(), [], [])
    assert t.escalate and t.label == "확인필요"
```

- [ ] **Step 2: 실패 확인** — `python3 -m pytest scripts/work_rules_c/tests/test_decisions.py -q` → ImportError
- [ ] **Step 3: `decisions.py` 구현** — `OpenAIDecisionsClient` 는 SDK 객체를 주입받기만 한다(이 PC 의 openai 2.28.0 에는 `decisions` 가 없다 — 실측 전에 SDK 를 올린다. 단위 테스트는 가짜로 돈다)
- [ ] **Step 4: 통과 확인** → `8 passed`, Task 4 테스트도 통과
- [ ] **Step 5: 커밋** — `git commit -m "feat(work-rules-c): jev and openai decisions triage backends"`

---

### Task 5: 판단 백엔드 (교체 가능)

**Files:**
- Create: `scripts/work_rules_c/judge.py`, `scripts/work_rules_c/prompts/judge_system.md`
- Test: `scripts/work_rules_c/tests/test_judge.py`

**Interfaces:**
- Consumes: `ArticlePair`, `Drop`, `RuleHit`, `Triage`, `Usage`
- Produces:
  - `@dataclass(frozen=True) class JudgeInput: pair: ArticlePair; drops: tuple[Drop, ...]; hits: tuple[RuleHit, ...]; triage: Triage`
  - `class JudgeOut(BaseModel): result: Literal["현행 수정 필요","시행 예정","회사 선택","추가 확인"]; disadvantage: Literal["해당","해당 없음","확인 필요"]; reason: str; basis: str; ops_note: str; proposed_text: str; confidence: float | None = None`
  - `apply_threshold(out: JudgeOut, min_confidence: float) -> JudgeOut` — `confidence` 가 None 이 아니고 `min_confidence` 미만이면 `result="추가 확인"` 인 사본. 테스트 `test_low_confidence_downgrades`(0.5, 문턱 0.8 → 「추가 확인」)·`test_none_confidence_untouched`
  - `class JudgeBackend(Protocol): name: str; usage: Usage; def judge(self, item: JudgeInput) -> JudgeOut: ...`
  - `class AnthropicJudge: def __init__(self, client, model: str = "claude-opus-5-5", effort: str = "high")` — `client.messages.parse(..., output_config={"effort": effort}, system=[캐시 블록], output_format=JudgeOut)`. Opus/Sonnet 5.5 는 `thinking` 을 보내지 않는다(기본 adaptive). 실패·거부·`parsed_output is None` 이면 `JudgeOut(result="추가 확인", disadvantage="확인 필요", reason="판단 실패: <예외>", basis="", ops_note="", proposed_text="")`
- 시스템 프롬프트: 4분류·불이익변경 기준(종전보다 근로조건이 낮아지면 「해당」, 법정 기준 맞춤이라도 종전이 더 유리했으면 「해당」), 운영 가능성(정족수·재심 인원·필수 심의) 메모, 어휘 제한(Global Constraints)

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_protocol_satisfied():
    j = AnthropicJudge(FakeClient(out=_ok_out()))
    assert isinstance(j, JudgeBackend) and j.name == "anthropic:claude-opus-5-5"

def test_model_override_used():
    c = FakeClient(out=_ok_out())
    AnthropicJudge(c, model="claude-sonnet-5-5").judge(_input())
    assert c.last_kwargs["model"] == "claude-sonnet-5-5" and "thinking" not in c.last_kwargs

def test_failure_returns_needs_check():
    out = AnthropicJudge(FakeClient(raises=RuntimeError("x"))).judge(_input())
    assert (out.result, out.disadvantage) == ("추가 확인", "확인 필요")
```

- [ ] **Step 2: 실패 확인** → ImportError
- [ ] **Step 3: `judge.py`·프롬프트 구현** — `JudgeBackend` 는 `typing.runtime_checkable` Protocol. `FakeClient` 는 Task 4 테스트의 것을 `tests/fakes.py` 로 옮겨 같이 쓴다
- [ ] **Step 4: 통과 확인** → `5 passed`(위 3개 + `apply_threshold` 2개), Task 4 테스트도 여전히 통과
- [ ] **Step 5: 커밋** — `git commit -m "feat(work-rules-c): pluggable judge backend"`

---

### Task 6: 대조표 산출 (comparison.v1)

**Files:**
- Create: `scripts/work_rules_c/report.py`
- Test: `scripts/work_rules_c/tests/test_report.py`

**Interfaces:**
- Consumes: `ArticlePair`, `Drop`, `RuleHit`, `Triage`, `JudgeOut`
- Produces:
  - `build_rows(pairs: list[ArticlePair], drops: dict[str, list[Drop]], hits: dict[str, list[RuleHit]], triages: dict[str, Triage], judged: dict[str, JudgeOut]) -> list[dict]` — 「동일」이면서 올라가지 않은 조문은 빼고, `(신설 필요)` 규칙은 조문 칸 「신설 필요」 행으로 붙인다. 행 키(정확히 이 이름): `조문` `현행` `개정안` `개정 사유` `근거·시행일` `불이익변경` `점검 결과` `운영 메모` `제안 문안`
    - `근거·시행일` = `"{law_article} ({effective:%Y.%m.%d.} 시행)"` 를 `; ` 로 이음
    - 판단이 없는 행의 `점검 결과` 는 `"추가 확인"`, `불이익변경` 은 하락 신호가 있으면 `"확인 필요"` 아니면 `"해당 없음"`
  - `write_outputs(rows: list[dict], meta: dict, out_dir: Path) -> tuple[Path, Path]` — `comparison.json`(`{"schema": "comparison.v1", "meta": meta, "rows": rows}`, `ensure_ascii=False`, indent 1)과 `comparison.md`(행마다 `### 조문` + 열별 줄). `meta` 키 = `사업장` `작성일` `점검 기간` `기준 자료`

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_row_keys_exact():
    rows = build_rows([_changed_pair()], {}, {}, {"제50조": _triage(escalate=True)}, {"제50조": _judge_out()})
    assert list(rows[0]) == ["조문","현행","개정안","개정 사유","근거·시행일","불이익변경","점검 결과","운영 메모","제안 문안"]

def test_unjudged_drop_marks_check_needed():
    rows = build_rows([_changed_pair()], {"제50조": [Drop("년", 3, 1)]}, {}, {"제50조": _triage(escalate=True)}, {})
    assert rows[0]["점검 결과"] == "추가 확인" and rows[0]["불이익변경"] == "확인 필요"

def test_new_required_row_appended():
    rows = build_rows([], {}, {"(신설 필요)": [_hit(status="누락")]}, {}, {})
    assert rows[0]["조문"] == "신설 필요"

def test_outputs_have_no_forbidden_words(tmp_path):
    j, m = write_outputs(build_rows([_changed_pair()], {}, {}, {}, {}), _meta(), tmp_path)
    text = j.read_text(encoding="utf-8") + m.read_text(encoding="utf-8")
    assert not re.search(r"판정|자문|상담|진단|확률|정확도", text)
```

- [ ] **Step 2: 실패 확인** → ImportError
- [ ] **Step 3: `report.py` 구현**
- [ ] **Step 4: 통과 확인** → `4 passed`
- [ ] **Step 5: 커밋** — `git commit -m "feat(work-rules-c): comparison.v1 output"`

---

### Task 7: 실행 CLI와 비용 기록

**Files:**
- Create: `scripts/work_rules_c/run.py`, `scripts/work_rules_c/cost.py`
- Test: `scripts/work_rules_c/tests/test_run.py`, `scripts/work_rules_c/tests/test_cost.py`

**Interfaces:**
- Consumes: Task 1~6 전부
- Produces:
  - `cost.PRICES: dict[str, tuple[float, float, float]]` — Global Constraints 단가 표 그대로
  - `cost.usd(u: Usage) -> float` — `(input*in + output*out + cache_read*cr + cache_creation*in*1.25) / 1e6`. 모르는 모델이면 0.0 + `warnings.warn`
  - `run.pipeline(new_text: str, old_text: str | None, asof: date, since: date, triage: TriageBackend, judge: JudgeBackend, meta: dict, rules: list[dict] | None = None) -> tuple[list[dict], dict]` — `rules` 는 `map_rules` 로 그대로 넘긴다(테스트는 `rules=[]` 로 매핑 파일 영향을 끊는다) — 두 번째 값은 `{"triage": {...usage, "usd": x}, "judge": {...}, "total_usd": y, "articles": n, "escalated": k}`. `old_text` 가 None 이면 새 문서 조문을 전부 「신설」 쌍으로 만든다
  - CLI: `python3 scripts/work_rules_c/run.py --rules <file> [--old <file>] --asof 2026-10-21 --since 2023-01-01 --out <dir> --triage haiku|jev|openai [--judge-model claude-opus-5-5] [--min-confidence 0.8] [--site 사업장명]`(판단 결과마다 `apply_threshold` 를 거친다). `--triage jev` 는 환경변수 `TYPESAFE_API_KEY`, `openai` 는 `OPENAI_API_KEY` 를 읽고 없으면 종료 코드 2(키 값은 출력하지 않는다) → `<out>/comparison.json` `<out>/comparison.md` `<out>/cost.json`. `--asof`·`--since` 는 `date.fromisoformat` 로만 받고 실패하면 종료 코드 2

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_usd_haiku():
    u = Usage("claude-haiku-5-5", input_tokens=1_000_000, output_tokens=1_000_000, cache_read_input_tokens=1_000_000)
    assert cost.usd(u) == pytest.approx(0.10 + 0.50 + 0.01)

def test_unknown_model_warns_zero():
    with pytest.warns(UserWarning):
        assert cost.usd(Usage("laya")) == 0.0

def test_pipeline_only_escalated_reach_judge():
    judge = RecordingJudge()
    rows, c = pipeline(NEW, OLD, date(2026,10,21), date(2023,1,1), HaikuTriage(FakeClient(out=_clean())), judge, _meta(), rules=[])
    assert judge.seen == ["제50조"]          # 수치 하락이 있는 조문만
    assert c["escalated"] == 1 and c["articles"] == 3

def test_bad_asof_exits_2(tmp_path):
    r = subprocess.run([sys.executable, RUN, "--rules", str(_tmp_rules(tmp_path)), "--asof", "2026/10/21",
                        "--since", "2023-01-01", "--out", str(tmp_path)], capture_output=True)
    assert r.returncode == 2
```

(`NEW`·`OLD` 는 테스트 파일 안의 합성 문안 3조 — 제7조 동일, 제46조 10일→20일, 제50조 3년→1년.)

- [ ] **Step 2: 실패 확인** → ImportError
- [ ] **Step 3: `cost.py`·`run.py` 구현** — CLI 의 실제 클라이언트는 `anthropic.Anthropic()`(자격은 환경에서). `sys.stdout.reconfigure(encoding="utf-8")`
- [ ] **Step 4: 통과 확인** — `python3 -m pytest scripts/work_rules_c/tests -q` → 전체 통과
- [ ] **Step 5: 커밋** — `git commit -m "feat(work-rules-c): run CLI and cost accounting"`

---

### Task 8: 정답지 대조 평가

**Files:**
- Create: `scripts/work_rules_c/eval.py`
- Test: `scripts/work_rules_c/tests/test_eval.py`

**Interfaces:**
- Consumes: `comparison.json`(Task 6 형식)
- Produces:
  - 정답지 형식(로컬 전용 파일, 레포에 안 넣음): `{"case": "드리븐_261021", "items": [{"조문": "제50조", "불이익변경": "해당"}, {"조문": "제26조", "점검 결과": "현행 수정 필요"}, ...]}`
  - `evaluate(pred: dict, gold: dict) -> dict` — `{"case", "gold_items", "found", "missed": [조문...], "disadvantage_missed": [조문...]}`. 정답 항목은 같은 조문 행이 있고, 그 항목에 적힌 키의 값이 같으면 찾은 것으로 친다
  - CLI: `python3 scripts/work_rules_c/eval.py --pred <comparison.json> --gold <gold.json>` → 위 dict 를 콘솔에 JSON 으로. 놓친 항목이 있으면 종료 코드 1

- [ ] **Step 1: 실패하는 테스트 작성**

```python
def test_found_and_missed():
    pred = {"rows": [{"조문": "제50조", "불이익변경": "해당", "점검 결과": "회사 선택"}]}
    gold = {"case": "t", "items": [{"조문": "제50조", "불이익변경": "해당"}, {"조문": "제26조", "점검 결과": "현행 수정 필요"}]}
    r = evaluate(pred, gold)
    assert (r["found"], r["missed"]) == (1, ["제26조"])

def test_disadvantage_missed_listed():
    pred = {"rows": [{"조문": "제50조", "불이익변경": "해당 없음"}]}
    gold = {"case": "t", "items": [{"조문": "제50조", "불이익변경": "해당"}]}
    assert evaluate(pred, gold)["disadvantage_missed"] == ["제50조"]
```

- [ ] **Step 2: 실패 확인** → ImportError
- [ ] **Step 3: `eval.py` 구현**
- [ ] **Step 4: 통과 확인** → `2 passed`
- [ ] **Step 5: 커밋** — `git commit -m "feat(work-rules-c): gold comparison eval"`
- [ ] **Step 6: 실측(커밋 안 함)** — 정답지 3건으로 `--triage haiku` · `jev` · `openai` 세 번씩 `run.py` → `eval.py` 를 돌린다(API 비용 발생 — 실행 전 재홍님 승인). Jev 는 키가 있는 서버1에서, 또는 재홍님이 로컬 `~/.claude/.env` 에 키를 직접 넣은 뒤 로컬에서 돌린다(키를 채팅·노션·로그로 옮기지 않는다). 고객 원문을 서버1로 보내는 것은 루트 CLAUDE.md 금지선 밖이지만 판단 모델 공급자(TypeSafe·OpenAI)로는 나간다 — 실측 전에 재홍님께 한 줄 확인. 결과 표(사례 · 백엔드 · 놓친 항목 · 불이익변경 놓침 · 올라간 조문 수 · triage USD · judge USD · 합계 · 응답시간 중위)를 노션 지식위키 「드리븐 … 조문 대조표」 페이지 아래에 붙인다. 비교 기준 = 10/5 Opus C 건당 $3.3~4.5
