# yellowenvelope.kr 디자인 정본

> 이 문서가 이 레포의 디자인 정본이다. 기존 `DESIGN_GUIDE.md`(492줄)는 **대체됨**. 두 문서를 병합하지 마라.
> 최종 확인: 2026-08-01 / 대상: Next.js 16.1.6 + React 19 + Tailwind v4 + shadcn(new-york)

---

## 0. 이 문서를 읽는 법

### 0.1 우선순위

| 순위 | 근거 | 비고 |
|---|---|---|
| 1 | `src/app/globals.css` | **실토큰 정본.** 값이 문서와 다르면 코드가 맞다 |
| 2 | 이 문서 (DESIGN.md) | 규칙·판단·신규 지정값의 정본 |
| 3 | 실제 화면 코드 | 현행일 뿐 규범이 아니다. 이 문서와 어긋나면 화면이 틀린 것 |
| — | `DESIGN_GUIDE.md` | **참조 금지.** 아래 어긋남 목록 참고 |

### 0.2 `DESIGN_GUIDE.md`가 현행과 어긋나는 지점 (병합 금지 근거)

| 가이드 기술 | 실제 |
|---|---|
| `--color-danger` / `--color-success` / `--color-warning` (가이드 114-116행) | globals.css에 **없음**. 각 페이지가 생 hex로 하드코딩 |
| `--ease-standard` (가이드 364행) | 없음. 실재는 `--ease-expo-out` |
| `--text-hero: clamp(2.5rem, …)` | 실제 `clamp(1.75rem, 1rem + 4vw, 5rem)` (globals.css:91) |
| §5 콘텐츠 블록 5종(ArticleBlock/DefinitionBlock/CaseBlock/NoteBlock/CriteriaBlock) | 구현체 없음 |
| §9 `detectBlockType` 자동 감지 | 구현체 없음 |
| §4 3패널 문서 레이아웃 | `.docs-layout` CSS만 존재, 실사용 1곳 |

### 0.3 표기 규칙

- `(신규)` = 이 문서에서 **처음 정한 값**. 조사 시점 코드/문서 어디에도 없었다.
- 마커가 없는 수치는 전부 `globals.css` 또는 실제 화면 코드에 실재하는 값이다.
- 전체 신규값은 **부록 A**에 일람으로 모아 두었다.

---

## 1. 이 사이트가 무엇처럼 보여야 하는가

yellowenvelope.kr은 로그인 없이 검색으로 도착한 사람이 자기 상황에 해당하는 법 조항 하나를 찾아 읽고 나가는 곳이다. 그러므로 화면의 기본 상태는 **읽을 수 있는 문서**여야 하고, 인터페이스는 그 문서를 방해하지 않는 만큼만 존재한다. 흰 표면 위에 1px 경계선으로 문단을 나누고, 파랑은 "여기를 누르면 다음 문서로 간다"는 신호로만 쓰며, 노랑은 이 사이트가 노란봉투법을 다루는 곳이라는 표시를 도구 화면에서만 남긴다. 방문자는 대개 임금체불·해고·괴롭힘 같은 상태에서 오므로 화면은 다급하지 않게 굴어야 한다 — 경고색으로 겁을 주거나, 애니메이션으로 시선을 끌거나, 확정적으로 말하지 않는다. 시각적 성취의 기준은 "예쁘다"가 아니라 **긴 한국어 본문을 3분간 읽어도 눈이 안 아픈가**, 그리고 **이 정보가 법적으로 신뢰할 만해 보이는가** 두 가지다.

---

## 2. 다른 시스템에서 무엇을 가져오고 무엇을 버리는가

이 레포는 사내 SaaS 두 개(Korea HRMS 「장부(Ledger)」, SafeClaw 산업안전 문서팩)와 디자인 어휘를 공유할 이유가 있는지 검토했다. 결론은 **원칙은 가져오고 어휘는 버린다**이다. 근거는 하나 — 그쪽은 로그인 SaaS(반복 사용자, 데이터 밀도, 브랜딩 통제)이고 여기는 공개 정보 사이트(1회성 SEO 방문자, 긴 산문, 공적 주제)다.

### 2.1 가져오는 것

| 항목 | 출처 | 가져오는 이유 |
|---|---|---|
| 웨이트 래더 400/500/600/700 고정, **300 이하 금지** | HRMS | 제품 무관 — 한글 자형이 300에서 무너진다 |
| 한글 음수 트래킹 상한 **-0.01 ~ -0.02em** | HRMS | 한글 자소가 붙기 시작하는 지점. 이 레포 body(-0.01em)가 이미 준수 |
| 본문 line-height **1.6 이상**(한글 보정), `word-break: keep-all` | HRMS | 이 레포 body가 1.65로 이미 독립 도달. 상호 확인됨 |
| mono는 **라틴·숫자 전용**, 한글 렌더 금지 | HRMS | 한글 글리프 부재 → faux-bold |
| 그림자는 위계가 아니라 "떠 있는 것"에만 | HRMS | 이 레포 그림자 난맥(FAB 하드코딩, /tools 토큰 0건)을 정리할 유일한 판단 기준 |
| 헤어라인 = "잉크 선"이 아니라 **한 단계 낮은 서피스 톤** | HRMS | 단, HRMS의 **웜 그레이는 버린다**(§2.2). 이 레포는 Toss 쿨 그레이 램프 |
| **Charter 형식**(허용/금지를 배치 위치로 규정) | HRMS Pastel Charter | §3.4 노랑 규칙의 골격으로 그대로 이식 |
| 마이크로카피 규율: 단정 금지, 구현 어휘 노출 금지, 상태는 운영 언어로 | SafeClaw | 법률 정보 사이트에 **더 강하게** 적용된다(§8) |
| 24px 초과 타이포는 전용 CSS 클래스로 (Tailwind 유틸 폴백 함정) | HRMS | 이 레포도 Tailwind v4 + 프리셋 조합이라 동일 위험 |

### 2.2 버리는 것 — 근거 포함

| 버리는 것 | 출처 | 버리는 근거 |
|---|---|---|
| 결산선(Settlement Rule), `ledger-navy`, 전역 `tabular-nums` | HRMS | 이 사이트에 **정렬해야 할 금액 열이 없다.** 확정/미확정 상태 구분도 없다. → tnum은 **`/tools/holiday-pay` 계산 결과 숫자에만** 국한 채택(§6.7) |
| 파스텔 6블록 + radius 24px + pill CTA(내러티브 서피스) | HRMS | 온보딩·대시보드 히어로의 어휘다. 20개 FAQ 카드와 긴 가이드 문서에는 "내러티브 서피스"라 부를 화면이 없다 |
| **다크-우선(B안), 니어블랙 #08090A** | HRMS | 비로그인 SEO 방문자는 라이트로 도착한다. 라이트가 정본, 다크는 정직한 보조(§7) |
| 화이트라벨 슬롯 `--t-accent` / `--t-block-1~5` | HRMS | 테넌트가 없다. 색은 전부 코어 소유 |
| 웜 팔레트 정렬(잉크 #171513, 헤어라인 #e8e5e1) | HRMS | 이 레포는 Toss 쿨 그레이(#191f28 / #e5e8eb)로 1,365곳이 물려 있다. 온도를 바꾸면 전면 재작업이고 얻는 것이 없다 |
| **해저드 옐로 #ffd400** | SafeClaw | ★이 과제의 함정. 이름만 같은 노랑이지 **의미가 정반대**다 — SafeClaw 노랑은 "현장 위험 신호", 여기 노랑은 "노란봉투 = 연대·정체성"이다. 가져오면 사이트 자체의 경고 semantic(§3.3 warn)과 충돌한다. 명시적 기각 |
| 전 토큰 radius 4px + 섀도 전면 제거 | SafeClaw | "현장 계기판" 미감. 긴 산문을 읽히는 화면과 맞지 않는다 |
| 히어로 weight 800 / letter-spacing -0.045em / LH 0.98 | SafeClaw | 한글 자소 붕괴. §4 웨이트 래더 위반 |
| 스티키 320px 좌패널 + 워크플로 스테퍼 | SafeClaw | 작업 흐름 제품의 레이아웃. 여기는 문서 열람이다 |

---

## 3. 색

### 3.1 원시 램프 (globals.css 실재, 변경 금지)

| 램프 | 값 |
|---|---|
| grey-50 → 900 | `#f9fafb` `#f2f4f6` `#e5e8eb` `#d1d6db` `#b0b8c1` `#8b95a1` `#6b7684` `#4e5968` `#333d4b` `#191f28` |
| blue-50 → 700 | `#e8f3ff` `#c9e2ff` `#90c2ff` `#64a8ff` `#4593fc` `#3182f6` `#1b64da` `#1957c2` |

다크(`.dark`)에서 grey 램프는 통째로 반전된다(grey-900 = `#f2f4f6`). blue 램프는 `--blue-50`만 `rgba(49,130,246,0.12)`로 바뀌고 나머지 7단계는 그대로다.

### 3.2 역할 토큰 — 표면·잉크·경계

| 역할 | 토큰 | 라이트 | 다크 | 쓰는 곳 |
|---|---|---|---|---|
| 페이지 바탕 | `--color-bg-primary` | `#f9fafb` (grey-50) | `#0f1117` | `<body>`. 카드 배경으로 쓰지 않는다 |
| 카드·표면 | `--color-bg-surface` | `#ffffff` | `#191f28` | 카드, 표, 사이드바, 입력 필드 |
| 부양 표면 | `--color-bg-elevated` | `#ffffff` | `#1e2530` | 드롭다운, 팝오버, 모달 |
| 본문·제목 | `--color-text-primary` | `#191f28` (grey-900) | `#f2f4f6` | h1~h4, 본문 |
| 보조 텍스트 | `--color-text-secondary` | `#6b7684` (grey-600) | `#b0b8c1` | 설명문, 메타, 비활성 네비 |
| 3차 텍스트 | `--color-text-tertiary` | `#b0b8c1` (grey-400) | `#6b7684` | 캡션, 날짜, 플레이스홀더 |
| 경계선 | `--color-border` | `#e5e8eb` (grey-200) | `#2a3140` | 카드 윤곽, 구분선, 입력 보더 |
| 약한 경계 | `--color-border-subtle` | `rgba(0,0,0,.06)` | `rgba(255,255,255,.06)` | 표 행 구분. **현재 참조 0회** — 표 규격(§6.5)에서 살린다 |

원칙: 카드는 **배경색이 아니라 표면(흰색) + 1px 경계선**으로 구분한다. 배경색으로 블록을 나누지 않는다.

### 3.3 역할 토큰 — 인터랙션·의미색

| 역할 | 토큰 | 라이트 | 다크 | 쓰는 곳 |
|---|---|---|---|---|
| 인터랙션 액센트 | `--color-accent` | `#3182f6` (blue-500) | `#4593fc` (blue-400) **(신규)** | 링크, 주 CTA 배경, 활성 네비, 포커스 링 |
| 액센트 hover | `--color-accent-hover` | `#1b64da` (blue-600) | `#64a8ff` (blue-300) **(신규)** | 위 요소의 hover |
| 액센트 연한 배경 | `--color-accent-light` | `#e8f3ff` (blue-50) | `rgba(49,130,246,.12)` | 활성 네비 배경, 인용 블록 배경 |
| 성공 전경(솔리드·아이콘) | `--color-success` **(신규 토큰)** | `#059669` | `#34d399` **(신규)** | 체크 아이콘, 배너 좌측선, 흰 텍스트를 얹는 솔리드 배경 |
| 성공 잉크(틴트 위 텍스트) | `--color-success-ink` **(신규 토큰)** | `#15803d` | `#6ee7b7` **(신규)** | 성공 배지·배너의 **텍스트** |
| 성공 배경 | `--color-success-bg` **(신규 토큰)** | `#dcfce7` | `rgba(5,150,105,.16)` **(신규)** | 성공 배지·배너 배경 |
| 성공 경계 | `--color-success-border` **(신규 토큰)** | `#a7f3d0` **(신규)** | `rgba(52,211,153,.32)` **(신규)** | 성공 배너 보더 |
| 주의 전경(솔리드·아이콘) | `--color-warn` **(신규 토큰)** | `#b45309` | `#fbbf24` **(신규)** | 주의 아이콘, 배너 좌측선 |
| 주의 잉크 | `--color-warn-ink` **(신규 토큰)** | `#92400e` | `#fcd34d` **(신규)** | 주의 배지·배너 텍스트 |
| 주의 배경 | `--color-warn-bg` **(신규 토큰)** | `#fef3c7` | `rgba(180,83,9,.18)` **(신규)** | 주의 배너 배경 |
| 주의 경계 | `--color-warn-border` **(신규 토큰)** | `#fde68a` | `rgba(251,191,36,.32)` **(신규)** | 주의 배너 보더 |
| 위험 전경(솔리드·아이콘) | `--color-danger` **(신규 토큰)** | `#dc2626` | `#f87171` **(신규)** | 위반 아이콘, 배너 좌측선, 흰 텍스트를 얹는 솔리드 배경 |
| 위험 잉크 | `--color-danger-ink` **(신규 토큰)** | `#b91c1c` | `#fca5a5` **(신규)** | 위반 배지·배너 **텍스트** |
| 위험 배경 | `--color-danger-bg` **(신규 토큰)** | `#fee2e2` | `rgba(220,38,38,.18)` **(신규)** | 위반 배지 배경 |
| 위험 경계 | `--color-danger-border` **(신규 토큰)** | `#fecaca` **(신규)** | `rgba(248,113,113,.32)` **(신규)** | 위반 배너 보더 |
| 정보 전경 | `--color-info` **(신규 토큰)** | `#1b64da` (blue-600) | `#64a8ff` (blue-300) | 참고 배너 좌측선·아이콘 |
| 정보 잉크 | `--color-info-ink` **(신규 토큰)** | `#1957c2` (blue-700) | `#90c2ff` (blue-200) | 참고 배지·배너 텍스트 |
| 정보 배경 | `--color-info-bg` **(신규 토큰)** | `#e8f3ff` (blue-50) | `rgba(49,130,246,.16)` **(신규)** | 참고 배너 배경 |

라이트 hex 대부분은 현행 코드에 이미 흩어져 있는 값을 승격시킨 것이다(`/guide`의 `#059669`×18, `#166534`, `#fef3c7`, `#92400e`, `#dc2626` 등, `ContractCheckClient.tsx:29-34`의 `#b91c1c`·`#15803d`·`#dcfce7`·`#fee2e2`).

**★ 전경/잉크를 나누는 이유 — 대비.** 연한 틴트 배경 위에 `--color-*` 전경색을 그대로 얹으면 AA에 미달한다(`#059669` on `#ecfdf5` ≈ 3.6:1, `#dc2626` on `#fee2e2` ≈ 4.0:1). 배지 텍스트는 11~12px이라 더 불리하다. 그래서 **솔리드/아이콘용 색(`--color-*`)과 틴트 위 텍스트용 색(`--color-*-ink`)을 분리**한다. 같은 문제를 HRMS도 겪었고(`--k-accent-solid` #5e6ad2는 4.05:1이라 텍스트로 못 써서 `--k-accent-link` #828fff를 따로 뒀다) 같은 해법을 쓴다. `ContractCheckClient.tsx:29-34`가 이미 AA를 통과하는 페어를 쓰고 있으므로, 이 분리는 신규 규범이 아니라 **현행 정답의 토큰화**다.

**의미색 규율(HRMS에서 이식):** 의미색은 **글리프·배지·배너 보더**로만 말한다. 카드 배경 전체를 성공색으로 칠하지 않는다. 배너 배경은 예외적으로 허용하되 §6.6 규격을 따른다.

### 3.4 노랑 헌장 (Yellow Charter)

**판단 근거.** 파랑은 제거할 수 없다 — `var(--color-accent)` 참조 215회, `/tools`를 뺀 전 화면의 링크·CTA가 여기 물려 있다. 노랑도 제거할 수 없다 — 사이트 이름이 노란봉투법이고 `/tools` 전체가 노랑으로 돌아간다. 따라서 이 사이트는 **역할이 분리된 2액센트 체계**이고, 노랑은 지금까지 토큰 없이 방치되었을 뿐 버그가 아니다. 아래로 고정한다.

| | 파랑 `--color-accent` | 노랑 `--color-brand-*` |
|---|---|---|
| 역할 | 인터랙션 신호("누르면 이동한다") | 브랜드 정체성 + 도구 화면 표면 |
| **허용** | 본문 링크, 포커스 링, 주 CTA(정보 화면), 활성 네비, 인용 블록 좌측선 | `/tools` 카드 hover 보더, 도구 CTA 배경, 아이콘 칩 배경, 선택 상태 보더/배경, 브랜드 마크 |
| **금지** | `/tools` 도구 CTA 배경 | **흰 배경 위 텍스트 색**, 링크 색, 포커스 링, 본문 강조, 의미색(경고) 대용 |

**하드 제약 — 대비.** `#facc15`(brand-400)는 흰 배경 위 텍스트로 대비 미달이다. 규칙으로 고정한다:

> **노랑은 표면 색이다. 노랑 표면 위 잉크는 항상 어두운 중성색(`#191f28` 또는 `--color-text-primary`)이다. 노랑을 텍스트 색으로 쓸 때는 brand-700(`#a16207`) 이하 명도만 쓴다.**

현행 코드는 이미 이를 지키고 있다 — `bg-yellow-400 text-slate-900`(표면 + 어두운 잉크), `text-yellow-700`(명도 통과). 이 규칙은 새 규범이 아니라 관행의 성문화다.

**노랑 램프** (신규 토큰. 값은 Tailwind yellow 스케일 — 현행 코드가 이미 이 값들을 직타로 쓰고 있어 매핑이 1:1이다)

| 토큰 | 값 | 현행 코드의 출처 |
|---|---|---|
| `--brand-50` | `#fefce8` | `HomeClient.tsx` 아이콘 칩 배경 |
| `--brand-100` | `#fef9c3` | 기존 `--yellow-100` 승계 (globals.css:94) |
| `--brand-200` | `#fef08a` **(신규)** | — |
| `--brand-300` | `#fde047` | `tools/page.tsx:85` `bg-yellow-300` |
| `--brand-400` | `#facc15` | `tools/holiday-pay` 생 hex, `bg-yellow-400` |
| `--brand-500` | `#eab308` **(신규)** | — |
| `--brand-600` | `#ca8a04` | `HomeClient.tsx` 아이콘 전경 |
| `--brand-700` | `#a16207` | `text-yellow-700` (`tools/page.tsx:95` 등) |
| `--brand-800` | `#854d0e` | `ContractCheckClient.tsx:189` |

**노랑 역할 토큰**

| 역할 | 토큰 | 라이트 | 다크 | 쓰는 곳 |
|---|---|---|---|---|
| 브랜드 표면(강) | `--color-brand-solid` **(신규)** | `#facc15` | `#facc15` (동일) | 도구 주 CTA 배경. 위 잉크는 항상 `#191f28` |
| 브랜드 표면(약) | `--color-brand-surface` **(신규)** | `#fef9c3` | `rgba(250,204,21,.16)` **(신규)** | 아이콘 칩, 선택 카드 배경 |
| 브랜드 경계 | `--color-brand-border` **(신규)** | `#facc15` | `rgba(250,204,21,.45)` **(신규)** | 카드 hover 보더, 선택 상태 보더 |
| 브랜드 잉크 | `--color-brand-ink` **(신규)** | `#854d0e` | `#fde047` **(신규)** | 노랑 문맥의 텍스트(연한 노랑 배경 위) |

기존 `--yellow-100`은 `--brand-100`으로 이름을 바꾸고, 다크값 `#422006`은 폐기한다(새 다크 규칙은 알파 오버레이).

### 3.5 폐기 대상 토큰

| 토큰 | 처분 | 이유 |
|---|---|---|
| `--chart-1` ~ `--chart-5` | 재정의 필요 | blue-500/400/300/600/700 단색 5단계라 범주형 데이터에서 인접 계열이 구분 안 된다. `/stats`가 recharts 자체 색을 쓰는 것이 그 증거. 범주형 팔레트 지정은 **별건**으로 남긴다 |
| `--transition-slow` (500ms) | 삭제 | 참조 0회 |
| `--color-border-subtle` | **유지·활성화** | 참조 0회지만 §6.5 표 행 구분에서 쓴다 |
| `--destructive` `#dc2626` | **존치, 용도 한정** | shadcn / `decisions-ui` 레이어 전용. **신규 화면은 `--color-danger*`만 쓴다.** 세 번째 위험색 토큰을 만들지 말 것 |
| `@font-face "Pretendard Variable Fallback"` (globals.css:5-9) | 삭제 | 그 패밀리명을 참조하는 선언이 하나도 없다 |
| `src/components/ui/*` (5개) | 삭제 | 임포트 0회. `decisions-ui`와 중복된 죽은 레이어 |

---

## 4. 타이포

### 4.1 폰트 스택

```
"Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont, system-ui,
Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo", "Noto Sans KR",
"Malgun Gothic", sans-serif
```

Pretendard Variable v1.3.9를 jsDelivr에서 preconnect + preload + stylesheet로 로드한다(`layout.tsx:68-78`). `next/font`는 쓰지 않는다.

> ★ **현행 버그.** `globals.css:14`의 `--font-sans`는 스택 **선두에 `var(--font-pretendard)`**를 두는데, 이 변수는 레포 어디에도 정의돼 있지 않다(`next/font` 미사용). 정의되지 않은 `var()`가 폴백 없이 목록 선두에 오면 `--font-sans` 선언 전체가 무효가 되어 Tailwind preflight 폴백(`ui-sans-serif, system-ui`)으로 떨어진다. **수정 = `globals.css:14`에서 `var(--font-pretendard), ` 제거.** (§9 P0)

한글 본문은 **단일 폰트 패밀리**로 간다. mono는 코드 블록·라틴 라벨에만 쓰고 한글을 mono로 렌더하지 않는다.

### 4.2 스케일

크기는 전부 `clamp()` 유동 스케일이다(globals.css:85-91). weight·line-height·letter-spacing은 이 문서에서 처음 규정한다.

| 용도 | 토큰 | px (최소→최대) | weight | line-height | letter-spacing |
|---|---|---|---|---|---|
| 페이지 히어로 h1 | `--text-hero` | 28 → 80 | 700 **(신규)** | 1.15 **(신규)** | -0.02em **(신규)** |
| 섹션 제목 h2 | `--text-2xl` | 24 → 32 | 700 **(신규)** | 1.3 **(신규)** | -0.02em **(신규)** |
| 하위 제목 h3 | `--text-xl` | 20 → 24 | 600 **(신규)** | 1.4 **(신규)** | -0.015em **(신규)** |
| 카드 제목 h4 | `--text-lg` | 18 → 20 | 600 **(신규)** | 1.45 **(신규)** | -0.01em **(신규)** |
| 본문 | `--text-base` | 15 → 17 | 400 | **1.65** | **-0.01em** |
| 보조·설명 | `--text-sm` | 13 → 14 | 400 (라벨은 500) **(신규)** | 1.6 **(신규)** | -0.01em **(신규)** |
| 캡션·배지 | `--text-xs` | 11 → 12 | 500 **(신규)** | 1.5 **(신규)** | 0 **(신규)** |

본문 `1.65` / `-0.01em`은 `body`에 이미 걸려 있는 실측값이다.

### 4.3 규율

| 규칙 | 내용 |
|---|---|
| 웨이트 래더 | **400 / 500 / 600 / 700만.** 사이값 금지, 300 이하 전면 금지(한글 자형 붕괴), 800 이상 금지 |
| 강조 | 굵게보다 **크게**. 위계가 모자라면 weight를 올리지 말고 스케일을 한 단계 올린다 |
| 트래킹 상한 | 음수 트래킹은 **-0.02em까지**. 그 이상 조이면 한글 자소가 붙는다. 양수 트래킹은 라틴 대문자 라벨(`tracking-wide`)에만 |
| 행간 하한 | 본문은 **1.6 미만 금지**. 밀집 표만 1.5까지 허용 |
| 줄바꿈 | `word-break: keep-all` + `overflow-wrap: break-word` (body 전역, 유지) |
| 본문 최대폭 | `38em`(한글 약 40자/줄). `.content-body`·`.blog-content`가 이미 적용 |
| 제목 크기 지정 | h1~h4는 **인라인 `var(--text-*)`로 통일**. Tailwind `text-2xl` 등으로 우회 금지 — 현재 `/faq`만 우회 중이라 같은 h1이 페이지마다 다른 크기다 |
| 제목 색 | **`var(--color-text-primary)` 하나로 통일.** 현재 `var(--grey-900)` / `var(--color-text-primary)` / `#0f172a` / `#f2f4f6` 4가지로 갈려 있고, 생 hex 2종은 다크에서 반전되지 않는다 |
| 24px 초과 | Tailwind 유틸에 의존하지 말 것. 프리셋이 `text-3xl` 이상을 생성하지 않으면 16px로 폴백한다(HRMS 실측 사례). 히어로는 인라인 `var(--text-hero)` 또는 전용 클래스로 |

---

## 5. 간격 · 반경 · 그림자

### 5.1 간격

4px 베이스(`--spacing: .25rem`, Tailwind v4 기본). 별도 토큰을 만들지 않고 Tailwind 스케일을 쓴다.

| 용도 | 값 | 상태 |
|---|---|---|
| 인접 요소 | 8px (`gap-2`) | 현행 |
| 그룹 내부 | 12~16px (`gap-3` / `gap-4`) | 현행 |
| 카드 간 | 16px (`gap-4`) | 현행 |
| 카드 내부 패딩 | **20px 모바일 / 24px 데스크톱 (`p-5 sm:p-6`)** | **(신규 통일)** — 현재 p-4/p-5/p-6/p-7 4종 혼재 |
| 섹션 상하 | 40px (`py-10`) | 현행(6개 페이지 공통) |
| 히어로 상하 | 56 / 80 / 128px (`py-14 sm:py-20 md:py-32`) | 현행(홈 전용) |
| 터치 타깃 하한 | **44 × 44px** | **(신규)** — HRMS/apple 규율 이식 |

### 5.2 콘텐츠 최대폭 — 3단으로 통일 (신규)

현재 8종(`1400 / 1200 / 1100 / 820 / 760 / 700 / 3xl / xl / none`)으로 갈려 페이지를 옮길 때마다 좌우 여백이 튄다. 아래 3개만 쓴다.

| 폭 | 용도 |
|---|---|
| `max-w-[1400px]` | 셸(네비·푸터) — **현행 유지** |
| `max-w-[1100px]` | 목록·그리드 화면(홈, /faq, /search, /tools 인덱스) **(신규 통일)** |
| `max-w-[820px]` | 읽는 화면(가이드 본문, 도구 폼, 블로그 글) **(신규 통일)** |

### 5.3 반경

| 단계 | 값 | 용도 |
|---|---|---|
| `--radius-sm` | 6px (`calc(--radius * 0.6)`) | 배지, 칩, 작은 태그 |
| `--radius-md` | 8px (`calc(--radius * 0.8)`) | 버튼, 입력 필드, 세그먼트 |
| `--radius` (lg) | 10px | 표, 배너, 중간 크기 요소 |
| `--radius-xl` | 14px (`calc(--radius * 1.4)`) | **카드 기본** |
| `rounded-full` | 999px | FAB, 필터 칩, 아바타 |

**카드 반경은 `rounded-xl`(14px) 단일로 통일한다 (신규 결정).** 현재 `rounded-lg`(10) / `xl`(14) / `2xl`(16)이 뒤섞여 있다. `2xl`을 버리고 `xl`을 택한 이유는 `--radius-xl`이 토큰 파생값이고 `2xl`(1rem)은 토큰 체계 밖 Tailwind 기본값이기 때문이다.

**하드코딩 반경 정리 (신규):** `.nav-cta` / `.nav-link`의 `border-radius: 8px`는 `var(--radius-md)`로, `.glass-panel`의 16px·`.glass-elevated`의 20px·`.nav-dropdown`의 14px는 각각 `var(--radius-xl)`로 치환한다. 현재 네비 CTA(8px)와 본문 CTA(10px)의 모서리가 다르다.

**보더 굵기 (신규):** 카드 보더는 **1px 단일**. 현재 `/tools` 계열만 `border-2`를 쓰는데, 선택 상태 표현은 굵기가 아니라 **색(`--color-brand-border`) + 배경(`--color-brand-surface`)**으로 한다.

### 5.4 그림자

| 토큰 | 값 (라이트) | 용도 |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgba(0,0,0,.05), 0 0 0 1px rgba(0,0,0,.03)` | 카드 기본 |
| `--shadow-md` | `0 4px 6px -1px rgba(0,0,0,.07), 0 2px 4px -1px rgba(0,0,0,.04), 0 0 0 1px rgba(0,0,0,.03)` | 카드 hover |
| `--shadow-lg` | `0 10px 15px -3px rgba(0,0,0,.08), …` | 드롭다운, FAB, 팝오버 |
| `--shadow-xl` | `0 20px 40px -8px rgba(0,0,0,.1), 0 8px 16px -4px rgba(0,0,0,.06)` | 모달만 |

다크는 알파를 `.3` ~ `.5` 대역으로 상향한 값이 이미 `.dark` 블록에 정의돼 있다.

**규율 (신규):**
1. 그림자는 위계가 아니라 **"떠 있는 것"**의 표시다. 버튼·배지·표 행에 그림자를 주지 않는다.
2. 카드 hover는 `--shadow-md` + `translateY(-2px)`. 현행 `.feature-card:hover`의 `--shadow-xl` + `translateY(-4px)`는 과하다 — xl은 모달 전용으로 내린다.
3. **하드코딩 그림자 금지.** 우하단 FAB의 `box-shadow: 0 4px 16px rgba(0,0,0,0.15)`(7페이지 전부)는 `var(--shadow-lg)`로 치환한다.
4. `/tools` 계열은 현재 인라인 토큰 그림자 0건이다. 카드에 `--shadow-sm`을 붙여 다른 화면과 맞춘다.

### 5.5 모션

| 토큰 | 값 | 용도 |
|---|---|---|
| `--transition-fast` | 150ms | 색·배경 전환, hover |
| `--transition-normal` | 300ms | 이동·크기 변화, 아코디언 |
| `--ease-expo-out` | `cubic-bezier(.16, 1, .3, 1)` | 위 둘의 기본 이징 |

버튼 hover의 `scale-105`는 **`translateY(-1px)`로 대체한다 (신규)** — 텍스트가 흐려지고 44px 타깃 경계가 흔들린다. `prefers-reduced-motion: reduce`에서 이동·스케일 애니메이션을 끈다 **(신규)**.

---

## 6. 컴포넌트 규격

모든 규격은 라이트/다크 양쪽을 **토큰으로** 지정한다. 토큰을 거치면 다크는 자동으로 따라온다 — 생 hex를 쓰는 순간 다크가 깨진다.

### 6.1 카드

| 속성 | 값 |
|---|---|
| 배경 | `var(--color-bg-surface)` — 라이트 `#ffffff` / 다크 `#191f28` |
| 보더 | `1px solid var(--color-border)` — 라이트 `#e5e8eb` / 다크 `#2a3140` |
| 반경 | `var(--radius-xl)` 14px |
| 패딩 | `p-5 sm:p-6` (20 / 24px) |
| 그림자 | `var(--shadow-sm)` |
| hover(클릭 가능한 카드만) | `var(--shadow-md)` + `translateY(-2px)`, `--transition-normal` |

클릭 불가능한 카드에는 hover 효과를 주지 않는다.

### 6.2 버튼

주 행동 버튼이 현재 4가지 규격으로 갈려 있다(홈 `px-6 py-3` / `/faq` `px-4 py-2` / `/tools` `bg-slate-900` + `bg-yellow-400` / 네비 `6px 16px`). 아래 4종으로 통일한다 **(신규 통일)**.

| 변형 | 배경 | 텍스트 | 보더 | 크기 |
|---|---|---|---|---|
| **primary** (정보 화면 주 행동) | `var(--color-accent)` / 다크 `#4593fc` | `#ffffff` | 없음 | `--radius-md` 8px, `px-5 py-2.5`, min-height 44px, 15px/600 |
| **brand** (도구 화면 주 행동) | `var(--color-brand-solid)` `#facc15` (라·다 동일) | `#191f28` **고정** | 없음 | primary와 동일 |
| **secondary** | `var(--color-bg-surface)` | `var(--color-text-primary)` | `1px solid var(--color-border)` | primary와 동일. hover 시 배경 `var(--grey-100)` |
| **ghost** (네비·아이콘) | 투명 | `var(--color-text-secondary)` | 없음 | `--radius-md`, `p-2`, hover 배경 `var(--grey-100)` |

- **brand 버튼의 잉크는 다크에서도 `#191f28`이다.** 노랑 표면 위 잉크는 항상 어두운 중성색(§3.4).
- hover: 배경 1단계 변화 + `translateY(-1px)`까지. 그림자·스케일 금지.
- disabled: `opacity: .5`, 커서 `not-allowed`.
- focus-visible: `outline: 2px solid var(--color-accent); outline-offset: 2px` (전역 규칙 상속).

### 6.3 폼 입력

| 속성 | 라이트 | 다크 |
|---|---|---|
| 배경 | `var(--color-bg-surface)` `#ffffff` | `#191f28` |
| 텍스트 | `var(--color-text-primary)` | `#f2f4f6` |
| 플레이스홀더 | `var(--color-text-tertiary)` | `#6b7684` |
| 보더 | `1px solid var(--color-border)` | `#2a3140` |
| 반경 | `var(--radius-md)` 8px | 동일 |
| 크기 | `px-3 py-2.5`, min-height 44px, 15px/400 | 동일 |
| focus | `outline: 2px solid var(--color-accent); outline-offset: 2px` (전역) | 동일 |

- **입력 포커스 색은 파랑이다.** 현행 `/tools`의 `focus:border-yellow-400 focus:ring-yellow-200`(`ContractCheckClient.tsx:114`)은 §3.4가 금지하는 "노랑을 포커스 링에" 위반이다. 파랑으로 되돌린다.
- 라벨: `--text-sm` / 500 / `var(--color-text-secondary)`, 입력과 6px 간격.
- 필수 표시: 라벨 뒤 `*`를 `var(--color-danger)`로. 색만으로 구분하지 않고 `aria-required`를 함께 준다.
- 다크에서 `input/select/textarea`는 배경을 명시적으로 지정한다. 지정하지 않으면 브라우저 기본 흰 배경 위에 밝은 잉크가 얹혀 읽을 수 없게 된다(HRMS 실앱 QA 사례).

### 6.4 배지

배지 텍스트는 **항상 `-ink` 토큰**을 쓴다(§3.3). 전경색(`--color-danger` 등)을 틴트 위 텍스트로 쓰면 AA에 미달한다.

| 변형 | 배경 | 텍스트 | 보더 |
|---|---|---|---|
| 중립 | `var(--grey-100)` | `var(--grey-700)` `#4e5968` **(신규 — `--color-text-secondary`는 11px에서 대비 부족)** | 없음 |
| 정보 | `var(--color-info-bg)` | `var(--color-info-ink)` | 없음 |
| 성공 | `var(--color-success-bg)` | `var(--color-success-ink)` | 없음 |
| 주의 | `var(--color-warn-bg)` | `var(--color-warn-ink)` | 없음 |
| 위험 | `var(--color-danger-bg)` | `var(--color-danger-ink)` | 없음 |
| 브랜드(NEW 등) | `var(--color-brand-solid)` | `#191f28` 고정 | 없음 |

공통: `--radius-sm` 6px(칩 형태는 `rounded-full`), `px-2 py-0.5`, `--text-xs` / 500, 그림자 없음.

`ContractCheckClient.tsx:29-34`의 `STATUS_STYLE` 4색은 위 위험/주의/성공/중립에 1:1로 매핑되며, **그 파일의 hex 페어(`#fee2e2/#b91c1c`, `#dcfce7/#15803d`, `#e2e8f0/#475569`)가 곧 이 표의 근거다.** 토큰화는 값을 바꾸는 작업이 아니라 이름을 붙이는 작업이다 — 색을 `#dc2626`·`#059669`로 "정리"하면 대비가 후퇴한다.

### 6.5 표

| 속성 | 값 |
|---|---|
| 컨테이너 | 카드 규격(§6.1) + `overflow-x: auto` |
| 헤더 | `--text-xs` / 500 / `var(--color-text-secondary)`, 배경 `var(--grey-50)` 라이트 / `#1e2530` 다크 **(신규)** |
| 행 구분 | `1px solid var(--color-border-subtle)` — 참조 0회였던 토큰을 여기서 살린다 |
| 셀 패딩 | `px-4 py-3` **(신규)** |
| 행 line-height | 1.5 **(신규, 밀집 예외)** |
| 행 hover | 배경 `var(--grey-50)` / 다크 `#1e2530`. 이동·그림자 없음 |
| 숫자 열 | 우측 정렬 + `font-variant-numeric: tabular-nums` **(신규, HRMS에서 국소 채택)** |
| 합계 행 | 상단 `1px solid var(--color-border)`, weight 600 |

`tabular-nums`는 **숫자 열이 실제로 정렬되는 표와 `/tools/holiday-pay` 계산 결과에만** 적용한다. 전역 적용은 하지 않는다(§2.2).

### 6.6 알림 배너

| 변형 | 배경 | 좌측선 4px | 본문 텍스트 | 제목 텍스트 | 쓰는 곳 |
|---|---|---|---|---|---|
| 참고 | `var(--color-info-bg)` | `var(--color-info)` | `var(--color-text-primary)` | `var(--color-info-ink)` | 조문 인용, 부연 설명 |
| 주의 | `var(--color-warn-bg)` | `var(--color-warn)` | `var(--color-text-primary)` | `var(--color-warn-ink)` | 예외 조건, 사업장 규모 단서 |
| 위험 | `var(--color-danger-bg)` | `var(--color-danger)` | `var(--color-text-primary)` | `var(--color-danger-ink)` | 법 위반 판정, 기한 임박 |
| 성공 | `var(--color-success-bg)` | `var(--color-success)` | `var(--color-text-primary)` | `var(--color-success-ink)` | 요건 충족 |

공통: `border-left: 4px solid`, `--radius` 10px, `p-5`, 그림자 없음. `/guide`의 콜아웃 3종이 이 규격으로 수렴한다.

배너 본문은 잉크 토큰이 아니라 `--color-text-primary`로 쓴다 — 긴 문장을 의미색으로 칠하면 읽기 부담이 커지고, 색은 좌측선과 제목이 이미 전달한다.

**다크에서 배너 배경은 반드시 알파 틴트다.** 라이트 파스텔(`#ecfdf5` 등)을 그대로 두면 어두운 페이지에 밝은 블록이 남고 그 위 텍스트가 뒤집혀 읽을 수 없다 — 현재 `/guide`에서 실제로 이 상태다.

### 6.7 유지되는 기존 컴포넌트

| 컴포넌트 | 규격 | 비고 |
|---|---|---|
| 스티키 glass 네비 | `.glass-nav` — blur(16px) saturate(180%), 높이 56px, `max-w-[1400px]` | **Glass는 크롬에만.** 본문은 솔리드. `.glass-panel`·`.glass-elevated`는 사용처 0 → 삭제 후보 |
| 상담 FAB | `rounded-full`, `px-4 py-3`, 배경 `var(--color-accent)`, 텍스트 흰색 | 그림자를 `var(--shadow-lg)`로 교체(§5.4) |
| 필터 칩 | `rounded-full`, `px-3 py-1.5`, `--text-xs`, 보더 `var(--color-border)`, 선택 시 배경 `var(--color-accent)` + 흰 텍스트 | 현행 유지 |
| 아코디언(FAQ) | 카드 규격 + 트리거 `button` 전폭, `--transition-normal` | 현행 유지 |
| `decisions-ui/*` | shadcn 유틸 레이어. `/sanction`·`/search`·`/stats`·`/decisions`·`/harassment`에서만 | §9 P1의 죽은 유틸 2건을 고쳐야 정상 렌더된다 |

---

## 7. 다크모드

### 7.1 현재 상태 진단

다크가 **두 축으로 갈라져 서로를 모른다.**

| 축 | 기전 | 상태 |
|---|---|---|
| CSS 변수 | `ThemeToggle.tsx:14,20`이 `documentElement.classList.toggle('dark')` → `.dark {}` 블록의 토큰 재정의 | **작동한다** (하이드레이션 이후) |
| Tailwind `dark:` 유틸 78개 | globals.css에 `@custom-variant dark` 선언이 없어 Tailwind v4 기본대로 `@media (prefers-color-scheme: dark)`로 컴파일 | **OS 설정에만 반응.** 토글과 무관 |

결과:

- OS 라이트 + 토글로 다크 켬 → 변수만 반전, `dark:` 유틸 78개는 라이트 그대로 (반쪽 반전)
- OS 다크 + 토글로 라이트 켬 → 변수는 라이트, `dark:` 유틸은 계속 다크 (정반대 파손)
- SSR HTML에는 `.dark`가 없고 `layout.tsx`에 pre-hydration 스크립트도 없다 → 다크 사용자에게 **흰 화면 플래시(FOUC)**

### 7.2 규칙

1. **다크의 유일한 활성화 축은 `.dark` 클래스다.** globals.css에 `@custom-variant dark (&:is(.dark *));`를 선언해 `dark:` 유틸을 같은 축에 합류시킨다. (§9 P0)
2. **우선순위:** `localStorage.theme` > `prefers-color-scheme`. `ThemeToggle.tsx`가 이미 이 순서로 구현돼 있다.
3. **FOUC 차단:** `layout.tsx` `<head>`에 pre-hydration 인라인 스크립트로 `.dark`를 선반영한다. (§9 P0)
4. **라이트가 정본이다.** 비로그인 SEO 방문자는 라이트로 도착한다. 다크는 정직한 보조 — 라이트에 있는 화면은 다크에서도 전부 읽혀야 하지만, 다크를 위해 라이트를 바꾸지 않는다.
5. **다크 대응의 유일한 방법은 토큰이다.** 색을 인라인 `var(--color-*)`로 넣으면 다크가 자동으로 따라온다. 생 hex와 Tailwind 팔레트 유틸(`text-slate-700`, `bg-slate-50`)은 다크에서 반전되지 않는다 — 현재 팔레트 유틸 211회 / hex 리터럴 245개가 잠재 파손이다.
6. **연한 배경 + 어두운 잉크 조합은 다크에서 반드시 알파 틴트로 바꾼다.** 파스텔 배경을 그대로 두면 어두운 페이지 위에 밝은 블록이 남고 그 위 텍스트가 반전되어 읽을 수 없다.
7. **어두운 배경을 하드코딩한 블록을 만들지 않는다.** `HomeClient.tsx:367-378`의 CTA 밴드(`#191f28` 배경)는 다크 페이지 배경(`#0f1117`)과 거의 같은 톤이라 블록 경계가 사라진다. 이런 "다크 밴드" 연출은 `var(--grey-900)`을 쓰거나 아예 카드로 바꾼다.
8. `<meta name="theme-color">`는 라이트/다크 두 값을 `media` 속성으로 나눠 준다. 현행 `#1d4ed8`(`layout.tsx:65`)은 팔레트 어디에도 없는 제3의 파랑이다.

### 7.3 다크에서 확인해야 할 화면 (수정 후 필수 점검)

`/` 하단 CTA 밴드 · `/` 기능 카드 아이콘 칩 10쌍 · `/guide` 콜아웃 3종과 `#059669` 계열 · `/tools` 전 화면(slate 팔레트) · `/tools/contract-check` 판정 배지 4색 · `/tools/holiday-pay` 결과 패널 · `/sanction`(죽은 유틸 영향) · `lib/category-colors.ts` 5개 카테고리 칩.

---

## 8. 마이크로카피

### 8.1 기본 레지스터

- **합니다체로 통일한다.** 해요체(`~해요`, `~할게요`)·음슴체 금지. 현행이 이미 합니다체다.
- 한 문장에 한 가지만 담는다. 두 가지가 되면 문장을 나눈다.
- 마침표를 찍는다. 느낌표·물결표(`~`)·이모지는 제품 크롬에 쓰지 않는다.
- 구현 어휘를 화면에 노출하지 않는다: `fallback`, `mock`, `API`, `파싱`, `쿼리`, `null`.
- 마케팅 최상급 금지: `최고의`, `완벽한`, `혁신적인`, `단 한 번의 클릭으로`.

### 8.2 법률 정보 사이트 고유 규칙 — 단정 금지 + 확인 경로

이 사이트의 문장은 사람의 법적 판단에 영향을 준다. 계산기와 점검 도구는 **참고 자료이지 판정이 아니다.**

| 규칙 | 나쁨 | 좋음 |
|---|---|---|
| 단정 대신 조건 명시 | `가산수당을 받을 수 있습니다.` | `5인 이상 사업장이라면 가산수당 대상입니다. 5인 미만은 의무가 없습니다.` |
| 결론에 확인 경로를 붙인다 | `이 계약서는 위법입니다.` | `근로기준법 제17조 필수 명시사항이 빠져 있습니다. 사업장에 수정 요청을 하거나 관할 노동청에 문의하시기 바랍니다.` |
| 인증·보증 어휘 금지 | `법적으로 검증된 계산 결과` | `공개된 법령·행정해석에 따라 계산한 결과` |
| 도구의 한계를 먼저 말한다 | (없음) | `실제 판단은 근로계약서 전문과 사업장 사정에 따라 달라집니다.` |

현행 코드에 이 레지스터의 좋은 실물 예시가 있다. 새 문장은 이 톤에 맞춘다:

> `근거 법령이 다릅니다. 관공서 공휴일(빨간날)은 근로기준법 제55조·시행령 제30조 — 5인 이상 사업장만 유급휴일입니다. 노동절(5/1)은 「노동절 제정에 관한 법률」 — 5인 미만 사업장 포함 모든 사업장 유급휴일입니다.`
> — `src/app/tools/holiday-pay` FAQ 데이터

### 8.3 번역투 제거

한국어 UI에서 자주 나오는 영어 직역 패턴을 걷어낸다. 아래 "나쁨"은 **일반 예시이며 이 레포에서 인용한 문장이 아니다.**

| 패턴 | 나쁨 (예시, 레포 인용 아님) | 좋음 |
|---|---|---|
| 주어 없는 수동태 | `입력 내용은 브라우저를 떠나지 않습니다.` | `입력하신 내용은 저장되지 않습니다.` |
| 사물 주어 | `이 도구는 당신을 도와줍니다.` | `이 도구로 필수 항목을 점검할 수 있습니다.` |
| `~하는 것이 가능합니다` | `계산하는 것이 가능합니다.` | `계산할 수 있습니다.` |
| `~에 대해` 남용 | `해고에 대해 알아보기` | `해고 요건 보기` |
| `귀하` | `귀하의 근로시간을 입력하세요` | `근로시간을 입력해 주세요` |
| 영어식 시제 | `저장되었습니다` (완료 강조 불필요할 때) | `저장했습니다` |
| 명령형 | `클릭하세요` | `눌러 주세요` / `선택해 주세요` |

레포 현행 문장 중 이 규칙을 이미 충족하는 예:

> `입력하신 내용은 저장되지 않습니다. 이 화면에서 계산에만 쓰이고, 창을 닫으면 사라집니다.`
> — `src/app/tools/contract-check/ContractCheckClient.tsx:316`

### 8.4 상태 문구 표준 (신규)

| 상황 | 문구 |
|---|---|
| 빈 상태 | `아직 결과가 없습니다. 조건을 입력하고 계산을 눌러 주세요.` |
| 진행 중 | `계산 중입니다.` (`...` 대신 마침표) |
| 오류 | `계산에 실패했습니다. 잠시 후 다시 시도해 주세요.` |
| 검색 결과 없음 | `검색어와 일치하는 문서가 없습니다. 다른 낱말로 찾아보시기 바랍니다.` |
| 면책 | `참고용 계산 결과입니다. 실제 지급액은 근로계약과 사업장 사정에 따라 달라집니다.` |

### 8.5 라벨 규칙

- 버튼 라벨은 **동사구**로: `계산하기`, `계약서 점검하기`, `상담 신청`. `확인`·`제출` 같은 무맥락 라벨 금지.
- 네비·메뉴는 **명사구**로: `노동법 데이터베이스`, `판정례 검색`, `자주 묻는 질문`.
- 법령명은 정식 명칭 + 낫표: `「근로기준법」 제56조`. 약칭 사용 시 첫 등장에서 한 번 풀어 쓴다.
- 숫자에 단위를 붙일 때 숫자와 단위 사이를 띄우지 않는다: `13,000원`, `40시간`, `5인`.

---

## 9. 마이그레이션 — 무엇부터 고치는가

이 절은 **명세**다. 실행은 별도 작업으로 한다.

### P0 — 전역 파손 (다른 모든 수정의 전제)

| # | 파일 | 조치 |
|---|---|---|
| P0-1 | `src/app/globals.css:14` | `--font-sans` 스택 선두의 `var(--font-pretendard), ` 삭제. 정의되지 않은 변수가 선언 전체를 무효화해 Pretendard와 한국어 폴백이 모두 적용되지 않는다 |
| P0-2 | `src/app/globals.css` (상단) | `@custom-variant dark (&:is(.dark *));` 선언 추가. `dark:` 유틸 78개(15개 파일)를 `.dark` 클래스 축에 합류시킨다 |
| P0-3 | `src/app/layout.tsx` `<head>` | pre-hydration 인라인 스크립트 추가 — `localStorage.theme` > `prefers-color-scheme` 순으로 `.dark`를 SSR 직후 선반영. 다크 사용자 FOUC 제거 |

### P1 — 죽은 유틸 (조용히 스타일이 빠지는 지점)

| # | 파일 | 조치 |
|---|---|---|
| P1-1 | `src/app/sanction/page.tsx:209,270,292,318,332,471` | `--color-accent-shadcn`(globals.css:27) 때문에 `@theme`에 `accent` 색 키가 없어 **`bg-accent` 유틸이 생성되지 않는다**(배경이 아예 안 칠해짐). **결정: 이름은 그대로 두고 호출부를 옮긴다.** `@theme`에 `--color-accent: var(--accent)`를 추가하면 `:root`의 브랜드 `--color-accent`(#3182f6)를 shadcn의 blue-50으로 덮어써 **인라인 `var(--color-accent)` 215곳이 전부 창백해진다** — 브랜드 이름이 우선한다. 따라서 `bg-accent` → `bg-muted`(= `--secondary`/`--muted` = `--grey-100`, shadcn `accent`의 "muted hover 표면" 의미와 일치, `@theme:25`에서 이미 생성됨), `hover:bg-accent/60` → `hover:bg-muted/60`로 교체. `text-accent-foreground`(8회)는 정상 생성되므로 그대로 둔다 |
| P1-1b | `src/components/ui/button.tsx:16,20` | 위와 동일 증상이나 이 파일은 임포트 0회 → P5-7에서 파일째 삭제하므로 별도 수정 불요 |
| P1-2 | `src/app/globals.css:11-42` | `@theme inline`에 `--color-border`가 없어 **`border-border` 유틸이 생성되지 않는다**(border-color가 currentColor로 떨어짐). 영향처: `src/components/decisions-ui/badge.tsx:18`, `src/components/decisions-ui/button.tsx:15`, `src/app/sanction/page.tsx:381,390,433,440,446,502`. `border-border/50` 같은 알파 변형도 같은 원인으로 죽는다 |

### P2 — 노랑 토큰화 (§3.4)

| # | 파일 | 조치 |
|---|---|---|
| P2-1 | `src/app/globals.css` | `--brand-50 ~ 800` 램프 + `--color-brand-solid/surface/border/ink` 역할 토큰 신설. 기존 `--yellow-100` → `--brand-100`으로 흡수, 다크값 `#422006` 폐기 |
| P2-2 | `src/app/tools/page.tsx:71,74,85-87,95` + hex `79,92,115` | `border-slate-200 hover:border-yellow-400` → 토큰, `bg-yellow-100 text-yellow-700` → `--color-brand-surface` / `--color-brand-ink`, `#0f172a`·`#475569`·`#94a3b8` → 텍스트 토큰 |
| P2-3 | `src/app/tools/contract-check/ContractCheckClient.tsx` | `:55(#facc15)`, `:114(focus:border-yellow-400 focus:ring-yellow-200 → 파랑 포커스로 되돌림)`, `:185,215`, `:189(#854d0e)`, `:223`, `:514,574`, `:760,800,809(bg-yellow-400)` 토큰화 |
| P2-4 | `src/app/tools/holiday-pay` | 선택 카드의 생 hex `#facc15` / `rgba(250,204,21,0.12)` → `--color-brand-border` / `--color-brand-surface` |

### P3 — 의미색 토큰 신설 (§3.3)

| # | 파일 | 조치 |
|---|---|---|
| P3-1 | `src/app/globals.css` | `--color-success/warn/danger/info` + `-ink` + `-bg` + `-border` 15종 신설, `.dark` 알파 틴트 대응 (§3.3) |
| P3-2 | `src/app/guide/**` | 하드코딩 `#059669`×18, `#ecfdf5`×13, `#166534`×4, `#fef3c7`, `#fde68a`, `#d97706`, `#92400e`, `#ef4444`, `#f0fdf4`, `#bbf7d0`, `#16a34a` → 의미색 토큰. 콜아웃 3종을 §6.6 배너 규격으로 수렴 |
| P3-3 | `src/app/tools/contract-check/ContractCheckClient.tsx:29-34` | `STATUS_STYLE` hex 8개 → 배지 토큰 4변형으로 **이름만** 교체. 이 페어들은 이미 AA를 통과하므로 **값을 바꾸지 않는다** — `#b91c1c`→`--color-danger-ink`, `#15803d`→`--color-success-ink`, `#475569`→중립 잉크. `#dc2626`·`#059669`로 "정리"하면 대비가 후퇴한다(§6.4) |
| P3-4 | `src/lib/category-colors.ts:1-8` | 5개 카테고리 hex → 토큰. 현재 다크에서 라이트 파스텔이 그대로 남는다 |

### P4 — 다크에서 실제로 깨지는 화면

| # | 파일 | 조치 |
|---|---|---|
| P4-1 | `src/app/HomeClient.tsx:367-378` | 하단 CTA 밴드 하드코딩(`#191f28` / `#f2f4f6` / `rgba(242,244,246,0.7)`) → 토큰. 다크에서 페이지 배경과 톤이 겹쳐 블록 경계가 사라진다 |
| P4-2 | `src/app/HomeClient.tsx:65-124` | 기능 카드 의미색 10쌍(`#8b5cf6/#f5f3ff`, `#dc2626/#fef2f2`, `#059669/#ecfdf5`, `#0ea5e9/#f0f9ff`, `#0284c7/#e0f2fe`, `#16a34a/#f0fdf4`, `#ca8a04/#fefce8` 등) → 다크 알파 틴트 대응 |
| P4-3 | `src/app/tools/**` 전반 | slate 팔레트 유틸(`border-slate-200`, `bg-slate-50`, `text-slate-700` 등)을 토큰으로. `slate-200`(#e2e8f0)은 `--color-border`(#e5e8eb)와 실색이 달라 경계선 톤이 페이지마다 어긋난다 |

### P5 — 일관성 정리

| # | 대상 | 조치 |
|---|---|---|
| P5-1 | 전 페이지 | 콘텐츠 최대폭 8종 → 3종(1400 / 1100 / 820)으로 통일 (§5.2) |
| P5-2 | 전 페이지 | 카드 반경 `lg/xl/2xl` 혼재 → `rounded-xl` 단일, 보더 `border-2` → 1px (§5.3) |
| P5-3 | 전 페이지 | 주 버튼 4규격 → §6.2의 4변형으로 통일 |
| P5-4 | 전 페이지 | h1 크기 지정 3방식·제목 색 4종 → §4.3 규율로 통일 |
| P5-5 | FAB(7페이지 공통) + `.feature-card:hover` | 하드코딩 그림자 제거, `--shadow-lg` / `--shadow-md`로 교체 (§5.4) |
| P5-6 | `src/app/globals.css:412-545` | `.nav-cta`·`.nav-link`의 `border-radius: 8px` → `var(--radius-md)`, `.nav-dropdown` 14px → `var(--radius-xl)` |
| P5-7 | `src/components/ui/*` (5개) | 삭제. 임포트 0회, `decisions-ui`와 중복 |
| P5-8 | `src/app/globals.css:5-9` | 참조 없는 `@font-face "Pretendard Variable Fallback"` 삭제 |
| P5-9 | `src/app/globals.css` | 죽은 토큰 정리: `--transition-slow`(참조 0), `--shadow-lg` 미사용 해소, `.glass-panel`·`.glass-elevated`·`.content-block`(사용처 0) |

### P6 — 마감

| # | 파일 | 조치 |
|---|---|---|
| P6-1 | `src/app/layout.tsx:65` | `<meta name="theme-color" content="#1d4ed8">` → 라이트 `#3182f6`(또는 `#ffffff`) / 다크 `#0f1117`를 `media` 속성으로 분리. 현재 값은 팔레트에 없는 제3의 파랑이다 |
| P6-2 | `src/app/globals.css:125-129` | `--chart-1~5` 단색 블루 5단계 → 범주형 대비가 있는 팔레트로 재지정(별건 과제) |
| P6-3 | `DESIGN_GUIDE.md` | 이 문서로 대체되었음을 최상단에 명시하거나 삭제 |

---

## 부록 A. 이 문서에서 새로 정한 값 일람

### A.1 신규 색 토큰

| 토큰 | 라이트 | 다크 |
|---|---|---|
| `--color-accent` (다크값만 신규) | (기존 `#3182f6`) | `#4593fc` |
| `--color-accent-hover` (다크값만 신규) | (기존 `#1b64da`) | `#64a8ff` |
| `--color-success` / `-ink` / `-bg` / `-border` | `#059669` / `#15803d` / `#dcfce7` / `#a7f3d0` | `#34d399` / `#6ee7b7` / `rgba(5,150,105,.16)` / `rgba(52,211,153,.32)` |
| `--color-warn` / `-ink` / `-bg` / `-border` | `#b45309` / `#92400e` / `#fef3c7` / `#fde68a` | `#fbbf24` / `#fcd34d` / `rgba(180,83,9,.18)` / `rgba(251,191,36,.32)` |
| `--color-danger` / `-ink` / `-bg` / `-border` | `#dc2626` / `#b91c1c` / `#fee2e2` / `#fecaca` | `#f87171` / `#fca5a5` / `rgba(220,38,38,.18)` / `rgba(248,113,113,.32)` |
| `--color-info` / `-ink` / `-bg` | `#1b64da` / `#1957c2` / `#e8f3ff` | `#64a8ff` / `#90c2ff` / `rgba(49,130,246,.16)` |
| 중립 배지 잉크 | `--grey-700` `#4e5968` 사용 지정 | 다크는 램프 반전으로 자동 대응 |
| `--brand-50~800` | `#fefce8` `#fef9c3` `#fef08a` `#fde047` `#facc15` `#eab308` `#ca8a04` `#a16207` `#854d0e` | 램프는 동일 |
| `--color-brand-solid` | `#facc15` | `#facc15` (동일) |
| `--color-brand-surface` | `#fef9c3` | `rgba(250,204,21,.16)` |
| `--color-brand-border` | `#facc15` | `rgba(250,204,21,.45)` |
| `--color-brand-ink` | `#854d0e` | `#fde047` |

(`#fef08a`, `#eab308`, `#a7f3d0`, `#fecaca`, `#34d399`, `#6ee7b7`, `#fbbf24`, `#fcd34d`, `#f87171`, `#fca5a5`는 Tailwind 팔레트에서 가져온 값이며 이 레포에 선례가 없다. 나머지 라이트 hex는 현행 코드에 흩어져 있던 값의 승격이며, 특히 `-ink` 3종(`#15803d`·`#b91c1c`·`#92400e`)과 `#dcfce7`·`#fee2e2`는 `ContractCheckClient.tsx:29-34`가 이미 쓰고 있는 AA 통과 페어다.)

### A.2 신규 타이포 규정

| 항목 | 값 |
|---|---|
| hero | 700 / LH 1.15 / LS -0.02em |
| 2xl (h2) | 700 / LH 1.3 / LS -0.02em |
| xl (h3) | 600 / LH 1.4 / LS -0.015em |
| lg (h4) | 600 / LH 1.45 / LS -0.01em |
| sm | 400(라벨 500) / LH 1.6 / LS -0.01em |
| xs | 500 / LH 1.5 / LS 0 |
| 트래킹 상한 | -0.02em |
| 웨이트 래더 | 400 / 500 / 600 / 700만 |

### A.3 신규 레이아웃·모션 결정

| 항목 | 값 |
|---|---|
| 카드 패딩 | `p-5 sm:p-6` (20 / 24px) |
| 터치 타깃 하한 | 44 × 44px |
| 콘텐츠 최대폭 | 1400 / 1100 / 820px 3단 |
| 카드 반경 | `--radius-xl` 14px 단일 |
| 카드 보더 | 1px 단일 (`border-2` 폐기) |
| 카드 hover | `--shadow-md` + `translateY(-2px)` |
| `--shadow-xl` | 모달 전용으로 격하 |
| 버튼 hover | `scale-105` → `translateY(-1px)` |
| 표 셀 패딩 / LH | `px-4 py-3` / 1.5 |
| 표 헤더 배경 | 라이트 `--grey-50` / 다크 `#1e2530` |
| 접근성 | `prefers-reduced-motion: reduce`에서 이동·스케일 정지 |
| `tabular-nums` 적용 범위 | 정렬되는 표의 숫자 열 + `/tools/holiday-pay` 결과값에만 |

### A.4 신규 마이크로카피 표준

§8.4의 상태 문구 5종(빈 상태 / 진행 / 오류 / 검색 없음 / 면책)과 §8.5 라벨 규칙 4항.
