# src/app/ 지식

## 디자인 토큰은 전부 globals.css 한 파일에 있다
Tailwind v4이고 **tailwind config 파일이 없다.** 순서와 역할:

1. `@custom-variant dark (&:is(.dark *));` — `dark:` 유틸을 `.dark` 클래스 축에 붙인다.
   `node_modules/shadcn/dist/tailwind.css`는 `data-*` variant만 주고 `dark`는 안 주므로 이 선언이 없으면
   `dark:` 유틸이 `prefers-color-scheme` 축으로 떨어져 토글과 어긋난다.
2. `@theme inline { }` — **유틸 클래스가 생성되는 곳.**
3. `:root { }` 라이트 값 / `.dark { }` 다크 값.

★ **`:root`에만 정의한 변수로는 유틸이 생기지 않는다.** `var(--x)` 인라인 스타일로만 쓸 수 있다.
`bg-x` / `border-x` / `text-x` 유틸이 필요하면 `@theme`에 이름을 올려야 한다.
반대로 `@theme`에 이미 `:root`가 쓰는 이름을 올리면 브랜드 값을 덮어써 버린다 — 추가 전에
`grep -rn "var(--color-<이름>)" src`로 인라인 사용처를 먼저 세어볼 것.

### 이름이 겹칠 때: shadcn 별칭 한 홉을 둔다
`:root`에 이미 있는 이름(`--color-border` 등)의 유틸이 필요하면
`@theme inline { --color-x: var(--color-x) }` 로 자기참조하지 말고 **별칭 한 홉**을 끼운다:

```css
@theme inline { --color-border: var(--border); }   /* 유틸 → border-color: var(--border) */
:root        { --border: var(--color-border); }    /* 별칭이 원본을 따라간다 */
```

`--primary`/`--muted`/`--input` 등 기존 shadcn 토큰이 전부 이 모양이다. 이점 두 가지:
- `@theme`가 `:root`에 같은 이름을 다시 뱉어도 **뒤에 오는 사용자 `:root` 선언이 이긴다** → 사이클이 안 생긴다.
- 별칭이 `var(--color-border)`를 가리키므로 **`.dark`에 별칭을 다시 쓸 필요가 없다.**
  `var()`는 선언 위치가 아니라 **사용 위치**에서 풀리므로 `.dark`의 원본 값을 그대로 따라간다.

검증은 브라우저보다 **빌드 산출물 grep이 싸다**:
`npm run build` 후 `grep -o "\.border-border[^{]*{[^}]*}" .next/static/chunks/*.css`
→ `border-color:var(--border)`면 성공, 규칙 자체가 없으면 유틸이 안 생긴 것이다(=`currentColor`로 떨어진다).

### 램프와 역할 토큰은 층을 나눈다
`--grey-*` / `--blue-*` / `--brand-*` 같은 **램프는 원시값**, `--color-*`는 **역할**이다. 규칙:

- 라이트·다크가 같은 램프는 `:root`에만 쓴다. `.dark`에 통째로 복사하지 말 것(`--brand-*` 9단이 이 경우).
- 역할 토큰은 값이 같으면 램프를 `var()`로 가리킨다 — `--color-brand-solid: var(--brand-400)`.
  `--color-accent: var(--blue-500)`이 원래 이 모양이다. hex를 두 번 적으면 한쪽만 고쳐져 갈라진다.
- `.dark`에는 **라이트와 값이 다른 역할만** 재선언한다. 램프를 가리키는 역할은 램프가 `.dark`에서
  뒤집히면 자동으로 따라온다(`var()`는 사용 위치에서 풀린다).
- 다크에서 연한 표면은 hex를 새로 고르지 말고 **알파 오버레이**로 만든다(`rgba(250,204,21,.16)`).
  불투명 어두운 hex(구 `--yellow-100: #422006`)보다 바탕과 어울리고 위에 얹히는 밝은 잉크가 그대로 산다.

### 토큰만 추가한 커밋이 무해함을 증명하는 법
호출부 교체 전에 토큰만 먼저 넣는 story가 여럿 있다. "화면이 안 변한다"를 육안으로 주장하지 말고
**소비자가 0건임을 빌드 산출물에서 보인다**:

```sh
npm run build
grep -o "var(--color-<새이름>)" .next/static/chunks/*.css   # 0건이면 CSS는 아무것도 안 쓴다
grep -rn "var(--color-<새이름>)" src/                        # 인라인 style 소비자도 함께 센다
```

CSS·인라인 양쪽이 0이면 렌더는 정의상 안 바뀐다.

### ★ 값이 "문서 그대로"인지는 grep으로 증명되지 않는다 — 칠해서 읽어라
`grep -o -- "--<이름>:[^;]*"`는 **텍스트 존재**만 보여준다. 커스텀 프로퍼티는 거의 아무 토큰 스트림이나 받으므로
`#fbb24`(5자리)·괄호 누락 같은 오타가 빌드를 통과하고 **사용 시점에 조용히 죽는다.** 더 나쁜 건 유효하지만 틀린 값
(`var(--blue-500)`을 `--blue-600` 대신 쓴 경우)으로, 이건 어떤 grep에도 안 잡힌다.

임시 스펙에서 **프로브에 칠하고 정규화된 색을 되읽는다**:

```ts
const got = await page.evaluate((names: string[]) => {
  const probe = document.createElement('div');
  document.body.appendChild(probe);
  const out: Record<string, string> = {};
  for (const n of names) {
    probe.style.backgroundColor = '';                 // 앞 토큰의 잔상을 지운다
    probe.style.backgroundColor = `var(${n})`;
    out[n] = getComputedStyle(probe).backgroundColor;
  }
  probe.remove(); return out;
}, Object.keys(EXPECT));
```

`.dark` 토글을 끼워 라·다 양쪽을 돌리면 **재선언 누락**(다크에 라이트 색이 그대로 나오는 사고)까지 같이 잡힌다.
원시 텍스트를 읽지 않는 이유: Lightning CSS가 `rgba(5,150,105,.16)` → `#05966929`로 축약하므로 문서의 `rgba()` 표기와
직접 비교하면 알파값마다 가짜 불일치가 난다. **칠하면 양변이 `rgb()`/`rgba()`로 정규화된다.**

### ★ 의미색을 솔리드 배경으로 쓰는 자리는 잉크를 테마로 뒤집어야 한다
`--color-{success,warn,danger,info}` 계열은 **라이트에서 어둡고 다크에서 밝다.** 그래서 틴트 배경(`-bg`) 위에
`-ink`를 얹는 표준 배치는 두 테마에서 자동으로 맞지만, **색 자체를 배경으로 쓰고 그 위에 흰 글씨를 얹은 자리**는
토큰으로 바꾸는 순간 다크에서 밝은 배경 + 흰 글씨가 되어 읽히지 않는다(§3.3 ★★).

해법은 잉크에 **테마로 뒤집히는 표면 토큰**을 쓰는 것이다:

```tsx
// 라이트 #ffffff(종전 text-white와 동일) / 다크 #191f28
style={{ backgroundColor: 'var(--color-danger)', color: 'var(--color-bg-surface)' }}
```

`--color-bg-surface`는 카드 색이라 다크 잉크로 쓰면 그 위 대비가 6~11:1로 나온다(실측). 반대로 `#fff`를 그대로
두면 다크에서 2:1 대로 떨어진다. 해당 자리 실측(US-006): `/guide` OX 필, `/blog` 서브타입 칩.

★ 라이트에서 **흰 잉크를 받을 수 있는 의미색 솔리드는 `--color-danger`(4.83:1)뿐이다.**
`--color-success`(#059669)는 3.77:1로 AA 미달이고, DESIGN.md §3.3 ★★가 지정한 대안 `#047857`은 **토큰이 없다**
(US-005의 17종에 안 들어갔다). 지어내지 말고 US-016 점검표에 올릴 것.

### ★ 보조 잉크는 표면이 정한다 — `--color-text-secondary`는 흰 표면 전용 (US-009에서 실측)
회색 잉크를 고를 때 "보조 텍스트니까 `--color-text-secondary`"로 기계적으로 가면 **AA 아래로 떨어진다.**
DESIGN.md §3.2 규율 2가 명시한 규칙이고, 실측이 그대로 재현된다:

| 자리 | `--color-text-secondary` `#6b7684` | `--grey-700` `#4e5968` |
|---|---|---|
| 흰 카드 `#ffffff` | 4.62 ✅ | 7.11 |
| 페이지 바탕 `#f9fafb` | **4.42 ✗** | 6.81 ✅ |
| `--grey-100` 패널 `#f2f4f6` | **4.19 ✗** | 6.45 ✅ |
| `--color-brand-surface` `#fef9c3` | **4.30 ✗** | 6.62 ✅ |

- **흰/부양 표면(`--color-bg-surface`·`-elevated`) 위에서만 secondary.** 그 밖(페이지 바탕·틴트 패널·
  브랜드 표면)과 **`--text-xs`(11~12px) 전부**는 `--grey-700`이다. §6.4 중립 배지(`--grey-100` 배경 +
  `--grey-700` 잉크)·§6.5 표 헤더가 같은 판정을 쓴다 — 절마다 다르게 고르지 말 것.
- `--color-text-tertiary`는 어느 표면에서도 텍스트로 못 쓴다(2.01:1). 플레이스홀더·비활성 아이콘 전용.
- 램프 토큰(`--grey-700`)을 쓰는 게 역할 토큰 우선 원칙의 예외로 보이지만, **DESIGN.md가 값까지 지정한
  자리**다(§3.2 표의 "대안" 행). 새 역할 토큰을 지어내지 말 것.

### ★ 고정 표면 위 잉크 vs 테마 표면 위 잉크 — 배경을 먼저 정한다
표면이 **테마를 안 타면**(노랑 솔리드·고정 그라디언트) 그 위 잉크도 고정이어야 하고, 반대로 잉크를
`--color-text-*`로 옮기려면 **배경을 같은 커밋에서 테마 표면으로 바꿔야 한다.** 둘을 쪼개면 다크에서
밝은 글씨 + 밝은 배경이 되어 화면이 통째로 사라진다(US-009 결과 카드가 이 상태 직전이었다).

- 노랑 솔리드(`--color-brand-solid`/`--brand-300`) 위 잉크 = **리터럴 `#191f28` 고정**(10.81:1).
  `--grey-900`·`--color-text-primary`는 다크에서 뒤집혀 노랑 위 흰 글씨가 된다(globals.css §3.4 주석).
- 어두운 솔리드 버튼(`bg-slate-900 text-white` 계열)은 **`--color-text-primary` 배경 + `--color-bg-surface`
  잉크**로 옮긴다. 두 토큰이 서로 반대로 뒤집혀 라이트 #191f28/#ffffff → 다크 #f2f4f6/#191f28이 된다
  (종전 `dark:bg-slate-100 dark:text-slate-900`과 같은 의도, 유틸 2개가 4개를 대신한다).
- ★ **canvas는 `var()`를 못 읽는다.** `ctx.fillStyle`/`strokeStyle`에 들어가는 색은 토큰화 대상이 아니다
  (`HolidayPayCalculator`의 공유 이미지 생성부). 빌드·타입체크·lint 어디에도 안 걸리고 **런타임에 조용히
  검정으로 떨어진다.** 리터럴을 남기고 대응 토큰을 주석으로 적어 둘 것.

### ★ 토큰 계열이 없는 색은 hex로 남긴다 — grey로 뭉치지 말 것
호출부의 색을 토큰으로 옮길 때, 그 색의 **계열(램프·의미색)이 레포에 아예 없는 경우**가 있다
(`lib/category-colors.ts`의 보라 `#6d28d9`·주황 `#9a3412`가 그렇다 — DESIGN.md에 보라·주황 값이 없다).
이때 선택지는 셋인데 둘은 틀렸다:

- ❌ 값을 지어내 새 토큰을 만든다 → PRD가 금지("문서에 없는 값을 새로 지어내지 않는다").
- ❌ 가장 가까운 의미색·`--grey-*`로 뭉친다 → **다른 것들이 같은 색이 되어 새 파손이 된다.**
  (카테고리 칩을 grey로 몰면 판례분석·뉴스브리핑·종합·general 네 칩이 같은 회색이 된다.)
- ✅ **hex를 그대로 두고 주석 + 인계 목록에 남긴다.** 부분 전환이 정답이고, 남긴 이유를 코드 옆에 적는다.

판단 기준은 늘 같다: **새 파손을 만드는가 vs 기존 파손을 남기는가.** 남기는 쪽이 항상 낫다.
단 남기면 **다크에서 한 줄에 대응된 칩과 안 된 칩이 섞인다**(실측: 전환된 칩은 카드 대비 1.2:1, 남은 파스텔은 15:1).
"부분 전환이라 눈에 띈다"는 사실을 progress.txt에 반드시 적을 것 — 다음 사람이 버그로 재조사하지 않도록.

### ★ 같은 의미가 한 화면에서 두 번 렌더되면 표를 공유시킨다
`ContractCheckClient`는 판정 4색을 **두 곳**에서 그린다 — 항목별 `StatusBadge`(`STATUS_STYLE`)와
결과 상단 집계 칩(같은 hex를 인라인으로 복제). 한쪽만 토큰화하면 **같은 화면에서 같은 뜻이 다른 색**이 된다
(다크에서 위쪽은 라이트 파스텔, 아래쪽은 알파 틴트 — 스크린샷으로 발견했다. 수치 검증만으로는 안 잡힌다).
복제본을 발견하면 값을 두 번 적지 말고 **원본 표를 import해서 map**한다. 순서를 바꾸지 않도록
표시 순서 배열은 따로 둘 것(`STATUS_ORDER`는 정렬용이라 표시 순서와 다르다).

### 호출부는 임의값 문법으로 토큰을 쓴다 — 생성 확인된 프리픽스 목록
역할 토큰(`--color-brand-*` 등)은 `@theme`에 없어서 유틸 클래스가 없다. 호출부에서는 임의값 문법을 쓰고,
**새 프리픽스를 처음 쓸 때마다 빌드 산출물에서 규칙 생성을 확인**한다(안 생기면 조용히 무시된다 — `border-border` 사고).

```sh
npm run build
python3 -c "import re;css=open('.next/static/chunks/<hash>.css',encoding='utf-8').read();\
print([ (s,b) for s,b in re.findall(r'([^{}]+)\{([^{}]*)\}',css) if '--color-brand' in b and '\\\\[' in s ])"
```
grep으로 찾을 때는 선택자가 `.bg-\[var\(--x\)\]` 처럼 **전부 백슬래시 이스케이프**돼 있다는 걸 기억할 것.

생성 확인 완료(US-003·US-004): `bg-` `text-` `border-` `hover:bg-` `hover:border-` `focus:border-`
`accent-`(→`accent-color`) `focus:ring-`(→`--tw-ring-color`) + 알파 `/20`(→`color-mix`).

★ **인라인 `style`은 어떤 유틸보다 세다.** `style={{ borderColor: ... }}`를 가진 input에 `focus:border-*`를
붙여도 **절대 발화하지 않는다**(contract-check `inputStyle`, HolidayPayCalculator `NumInput`이 이 상태 —
노랑이든 파랑이든 원래부터 죽어 있었다). 포커스 표시는 `focus:ring-*`가 담당한다. 포커스 링 표준은
`focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/20`
(`DatabaseClient.tsx:334`가 정본). `--color-accent-light`(=blue-50 `#e8f3ff`)는 **링에 쓰지 말 것** — 흰 배경 대비 1.1:1로 안 보인다.

## 배열 데이터가 색을 들고 있을 때 다크 축을 주는 법 (US-008에서 확립)
`features.map(f => <div style={{ backgroundColor: f.bg }}>)` 처럼 **색이 컴포넌트 밖 배열에 있으면**
값을 인라인 `style`로밖에 못 넣는데, **인라인 `background-color`는 `.dark` 클래스 규칙을 이겨서 다크 전환이 불가능하다.**
정적 hex를 테마 토큰으로 못 바꾸는 경우(계열 토큰이 없는 장식색 등)의 처방:

```tsx
<div className="feature-chip" style={{ '--chip-color': f.color, '--chip-bg': f.bg } as React.CSSProperties}>
```
```css
.feature-chip { background-color: var(--chip-bg); }
.dark .feature-chip { background-color: color-mix(in srgb, var(--chip-color) 16%, transparent); }
```
- 인라인으로 넘기는 것은 **커스텀 프로퍼티뿐**이고 실제 `background-color` 선언은 클래스가 갖는다 → `.dark`가 이긴다.
- TS는 인라인 커스텀 프로퍼티를 모르므로 `as React.CSSProperties` 캐스트가 필요하다.
- ★ Lightning CSS는 `color-mix`를 쓴 선언마다 **미지원 브라우저용 폴백을 앞에 깐다**
  (`.dark .feature-chip{background-color:var(--chip-color)}` + `@supports(color-mix)` 블록).
  폴백은 **알파가 빠진 원색**이라 틴트가 솔리드가 된다 — 빌드 산출물 grep에서 규칙이 2개로 보이는 건 정상이다.

## ★ `.dark` 규칙은 형제 라이트 규칙에서 속성을 상속받는다 — 지우기 전에 확인할 것 (US-010)
`globals.css`의 다크 오버라이드(`.dark body` · `.dark .glass-nav` · `.glass-panel` · `.glass-elevated` · `.nav-dropdown`)는
**바뀌는 속성만 재선언**한다. 나머지는 같은 요소를 잡는 라이트 규칙에서 그대로 상속받는다.
→ **라이트 규칙에서 어떤 선언을 지우면 다크 렌더가 조용히 같이 바뀐다.**
US-010 실례: `background-attachment: fixed`는 `@layer base`의 `body`에 있었고 `.dark body`는 `background-image`만
재선언했다. 라이트에서 그냥 지웠으면(라이트엔 이미지가 없어 무의미) 다크 오로라만 스크롤을 따라 움직였을 것이다.
- 처방: 라이트에서 지우는 선언이 다크에서 의미가 있으면 **다크 규칙으로 옮기고 사유를 주석으로 남긴다.**
- 검증: before/after 다크 스크린샷 **md5 비교**가 가장 싸다(스크롤 위치별 2장). computed style만으로는
  `fixed`의 뷰포트 고정 같은 동작 회귀를 못 잡는다. 진입 애니메이션이 있는 화면은 대기 후 찍어야 md5가 맞는다.
- ★ 이 `.dark` 규칙들은 **`@layer base` 밖(unlayered)**이라 레이어드 `body`를 항상 이긴다.
  거꾸로 **`@layer base`에서는 다크를 덮을 수 없다** — 특이도를 올려도 소용없다.

## 테마 축: layout.tsx ↔ ThemeToggle.tsx 는 한 몸이다
- 축은 `document.documentElement`의 `.dark` 클래스, localStorage 키는 `'theme'`.
- 판정식 `saved === 'dark' || (!saved && prefersDark)` 이 **두 곳에 중복 존재**한다:
  `layout.tsx` `<head>`의 pre-hydration 인라인 스크립트, `components/ThemeToggle.tsx`의 `useEffect`.
  **★ 한쪽만 고치면 FOUC가 되살아난다. 반드시 같이 고칠 것.**
- pre-hydration 스크립트는 `next/script`가 아니라 raw `<script dangerouslySetInnerHTML>` 이어야 한다
  (`next/script`는 첫 페인트 전 실행을 보장하지 않는다). localStorage가 throw할 수 있으니 try/catch 필수.
- 그 스크립트가 SSR HTML에 없는 클래스를 `<html>`에 붙이므로 `<html>`에 `suppressHydrationWarning`이 필요하다.
  빼면 다크 사용자에게 매 로드 하이드레이션 불일치 콘솔 에러가 뜬다.

## JSX 함정
`return (` 다음 줄에 `{/* 주석 */}`을 두면 루트 엘리먼트가 2개가 되어 파싱이 깨지고,
dev 서버는 `Parsing ecmascript source code failed`만 반복 출력해 원인을 안 알려준다.
루트 엘리먼트 앞 주석은 `return` **위에 `//`** 로 쓸 것.

## lint
`npm run lint`는 **사전 존재 에러 11건**(react-hooks/set-state-in-effect 등)으로 항상 exit≠0이다.
전체 통과는 목표가 될 수 없다 — `npx eslint <내가 만진 파일>`로 범위를 좁혀 확인한다.

## 타이포 — `.t-*` 전달 클래스 (globals.css `@layer utilities`)
- `.t-hero`/`.t-h2`/`.t-h3`/`.t-h4`/`.t-body`/`.t-sm`/`.t-xs` 7종이 **크기·weight·line-height·letter-spacing을
  한 묶음**으로 준다(DESIGN.md §4.2 표 = 정본). 제목마다 3속성을 손으로 반복하지 말 것.
  24px 초과(`--text-2xl`·`--text-hero`)는 §4.3상 **Tailwind 유틸 금지, 이 클래스로만** 지정한다.
- ★ `.t-body`는 `.content-body`의 **스케일 별칭**이다. 두 이름이 한 규칙을 공유하되
  `max-width: 38em`·`color`는 `.content-body`에만 따로 준다 — `.t-body`를 카드 안 본문에 붙였을 때
  38em이 따라붙지 않게 하려는 의도적 분리다. **합치지 말 것.**
- ★ 손으로 쓴 규칙을 `@layer utilities {}` 안에 둬도 **Tailwind v4는 호출부가 0곳이어도 퍼지하지 않는다**
  (US-011 실측: `.t-*` 7종 전부 `.next/static/chunks/*.css`에 생성됨). v3 습관으로 레이어 밖으로 빼지 않아도 된다.
  다만 새 클래스는 항상 빌드 산출물 grep으로 한 번 확인할 것.

## 줄바꿈 규율은 이제 `body` 전역이다
- `word-break: keep-all` + `overflow-wrap: break-word`가 `@layer base`의 `body`에 있다(US-011, §4.3).
  둘 다 **상속 속성**이라 컴포넌트·클래스에서 다시 선언할 필요가 없다(`.content-body`·`.blog-content`에서 제거함).
- 효과: 한글 단어가 줄 끝에서 쪼개지지 않는다(예: `핵심 노|동법` → `핵심|노동법`). 되돌리지 말 것.
- ★ `keep-all`은 **flex/grid 아이템의 min-content 폭을 키울 수 있다**(`min-width:auto` 기본값 때문).
  줄바꿈 관련 전역 변경 후에는 **360/375px에서 `documentElement.scrollWidth > clientWidth`**를 전 라우트로 재 볼 것.
  (US-011 실측: 7개 라우트 모두 over=0. 단, 열이 많은 표는 이 변경과 무관하게 이미 모바일에서 넘친다.)

## 버튼 — §6.2 4변형은 "클래스 레이어"가 아니라 **문자열 그대로** 쓴다
DESIGN.md §6.2가 정한 4변형(primary / brand / secondary / ghost)을 `.btn-*` CSS 레이어로 추상화하지 않았다.
호출부가 20곳대라 레이어를 만들면 기존 호출부를 다시 전부 고쳐야 하고, 그 편익이 없다.
**아래 문자열을 복사해 쓴다**(US-012에서 확립, 실측값 병기):

- 공통 골격: `inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md px-5 py-2.5
  text-[15px] font-semibold transition-[background-color,transform] hover:-translate-y-px`
- **primary**: `bg-[var(--color-accent-ink)] text-[var(--color-on-accent-ink)] hover:bg-[var(--color-accent-ink-hover)]`
  → 실측 라이트 `#1b64da`/`#ffffff` **5.41:1**, 다크 `#4593fc`/`#0f1117` **6.14:1**(§6.2 표와 일치)
- **brand**: `bg-[var(--color-brand-solid)] text-[#191f28] hover:bg-[var(--brand-500)]`
  → 라·다 동일 `#facc15`/`#191f28` **10.81:1**. 잉크는 **리터럴 고정**이다(토큰화 금지 — `--grey-900`은 다크에서 뒤집힌다)
- **secondary**: `border border-[var(--color-border)] bg-[var(--color-bg-surface)]
  text-[var(--color-text-primary)] hover:bg-[var(--grey-100)]`
- disabled: `disabled:opacity-50 disabled:cursor-not-allowed`
- ★ **primary 배경은 `--color-accent`가 아니라 `--color-accent-ink`다.** `#3182f6` + 흰 잉크는 3.71:1로 AA 미달이다.
  `--color-accent`는 포커스 링·보더·아이콘 등 비텍스트 전용으로 남는다.
- ★ 잉크 토큰 `--color-on-accent-ink`는 US-012에서 신설했다(라이트 `#ffffff` / 다크 `#0f1117`).
  기존 표면 토큰으로는 이 조합이 안 나온다 — `--color-bg-surface`는 다크가 `#191f28`, `--color-bg-primary`는 라이트가 `#f9fafb`다.
- `grid`/`flex` 칸 안에 넣을 때는 앞에 `w-full`을 붙인다(`inline-flex`라 기본은 내용 폭).

## 콘텐츠 최대폭 — "페이지 셸"과 "컴포넌트 내부 폭"을 가르는 기준
§5.2는 `max-w-[1400px]`(셸) / `[1100px]`(목록·데이터) / `[820px]`(읽는 화면) 3종만 허용하지만,
**적용 대상은 라우트의 콘텐츠 컨테이너뿐이다.** 아래는 3종 규칙의 대상이 아니다(US-012에서 확정한 판정선):
- 산문 measure: `<p>`에 걸린 `max-w-[760px]`·`max-w-xl`·`max-w-md`·`max-w-3xl`, prose의 `max-w-none`
- 컴포넌트 내부 폭: 채팅 말풍선 `max-w-[85%]`/`[80%]`, 표 셀 `max-w-[280px]`, 모달 `max-w-[800px]`,
  단일 카드가 곧 화면인 경우(어드민 로그인 `max-w-[400px]`)
- 판정법: `grep -rno "max-w-[^ \"]*" src --include=*.tsx | ...`로 세고, **`mx-auto`가 붙은 블록만** 셸 후보로 본다.

## ★ `var(--x, 폴백)`의 폴백은 죽은 토큰을 숨긴다 (US-012에서 발견)

죽은 유틸은 빌드 산출물에 규칙이 없으니 grep으로 잡히지만, **죽은 *토큰*은 폴백이 있으면 안 잡힌다.**
`background: var(--color-accent-soft, #fff8e6)`처럼 쓰면 `--color-accent-soft`가 정의 0건이어도 화면은 칠해진다 —
대신 그 값이 **라이트·다크 고정 hex**가 되어 다크만 조용히 깨진다(`SubscribeForm.tsx:89`가 이 경우다.
크림 배경 위 `--color-text-primary`가 다크에서 `#f2f4f6` → 약 1.1:1).

판별법:
```bash
grep -rn "var(--[a-z0-9-]*, *#" src/                  # 폴백을 단 var() 전수
grep -n "\-\-그토큰이름" src/app/globals.css           # 정의가 실제로 있는지
```
정의가 없으면 **토큰을 만들 것인지 다른 토큰으로 옮길 것인지**를 문서 근거로 결정한다. 폴백만 지우면 배경이 아예 사라진다.

## ★ 규격을 바꿀 때는 쌍둥이 컴포넌트를 함께 본다

같은 역할의 형제가 여럿이라 한쪽만 고치면 규격이 갈린다. 실재 쌍:
`SubscribeForm` ↔ `BetaSignupForm`(구독/신청 폼) · `ChecklistWidget` ↔ `DeepChecklistWidget` ↔ `SimpleChecklistWidget` ·
`components/ui/*` ↔ `components/decisions-ui/*` — **US-013 P5-7에서 전자 5개를 삭제해 정리됐다. 이제 `decisions-ui` 하나뿐이다.**
버튼·입력·카드 규격을 손대기 전에 `ls src/components/ | grep <역할어>`를 한 번 돌릴 것.

## ★ Tailwind v4 레이어 서열 — `@layer base`는 유틸을 못 이긴다 (US-013에서 실측)

전역 `:focus-visible`에 `border-radius: 4px`가 있었고 DESIGN.md §9 P5-12는 그것 때문에
`rounded-full` FAB·칩의 포커스 링이 각지게 그려진다고 적었다. **재현되지 않았다.**
4px을 되살린 상태에서 재도 FAB 반경은 `3.35544e+07px`(= `rounded-full`) 그대로였다 —
Tailwind v4의 캐스케이드 레이어 순서상 `utilities`가 `base`를 이기기 때문이다.

- `@layer base`에 쓴 선언은 **유틸이 손대지 않는 속성에만** 실제로 발화한다.
- 반대로 `globals.css`의 `@layer utilities` 블록(`.nav-link`·`.feature-card` 등)과
  Tailwind 생성 유틸(`hover:shadow-md`)은 **같은 레이어·같은 특정도(0,2,0)**라 소스 순서가 승부를 가른다 — 제어 불가에 가깝다.
- 판별법: 문제의 선언을 되살린 상태에서 **Tab 순회**로 각 포커스 요소의 계산값을 뽑는다
  (`el.matches(':focus-visible')`를 같이 찍을 것 — 스크립트 `.focus()`는 요소에 따라 `:focus-visible`이 안 붙는다).
  US-013 실측: 반경 유틸이 없는 요소 2곳(스킵 링크·베타 배너 ✕)만 `4px → 0px`로 바뀌었다.

## ★ 인라인 `style`은 클래스 hover 규칙을 영구히 이긴다 — 호출부를 보고 판단할 것

`.feature-card:hover { box-shadow: var(--shadow-md) }`는 **인라인 `style`을 든 호출부에서 발화하지 않는다.**
`HomeClient.tsx:206·237·277`·`BlogClient.tsx:66`이 `style={{ boxShadow: 'var(--shadow-sm)' }}`를 들고 있어 인라인이 이긴다
(홈 `.feature-card` 9개 전수 실측: hover 전후 boxShadow **불변**, 라·다 동일). `transform`은 인라인이 없어 정상 전환된다.
나머지 1곳 `TopicPicks.tsx:36`은 인라인이 없는 대신 Tailwind `hover:shadow-md`를 함께 들고 있다 —
**미측정**(이 환경에서 `/blog`·홈 픽 데이터가 안 실려 노드가 렌더되지 않았다).
→ **CSS의 hover 규칙을 고칠 때는 호출부의 인라인 style을 먼저 grep한다.**
소유권을 인라인 → 클래스로 옮기는 것은 `hover:shadow-md` 유틸과 소스 순서 충돌을 만드니 별도 판단이 필요하다.

## `@theme inline`의 토큰은 유틸 사용량에 따라 트리셰이킹된다

`--radius-sm/md/lg/xl`은 `:root`가 아니라 `@theme inline`에 산다. 이 변수들은 대응 유틸(`rounded-md` 등)이
소스에 남아 있는 동안만 산출물에 실린다. CSS 규칙에서 `var(--radius-md)`로 참조하는 코드를 늘리면서
동시에 `rounded-md`를 쓰던 파일을 지우면, **참조는 남고 정의가 사라져 조용히 `border-radius: 0`이 된다.**
확인: `npm run build && grep -o -- "--radius-md:[^;]*" .next/static/chunks/*.css`
(US-013에서 `components/ui/*` 5개를 지우기 전 `rounded-md` 호출부가 그 밖에도 다수임을 확인하고 진행했다.)

## ★ `prose*` 유틸은 이 레포에서 **아무 일도 하지 않는다** (typography 플러그인 미설치)

`/lecture/ai-isan-2026/textbook`의 `<article>`은 `prose prose-zinc dark:prose-invert prose-h1:text-3xl
prose-blockquote:… prose-code:…`를 20여 개 달고 있지만 **`@tailwindcss/typography`가 설치되어 있지 않고
`globals.css`에 `@plugin` 선언도 없다.** Tailwind v4는 config 파일 없이 `@plugin`으로만 플러그인을 싣는다.

- 근거 2중: 빌드 산출물에 `.prose` 규칙 **0건** (`grep -o '\.prose' .next/static/chunks/*.css`)
  + 그 컨테이너에 링크를 주입하고 `prose-a:underline`을 붙여도 `textDecorationLine: none`으로 렌더.
- 결과: 그 페이지의 제목 크기·인용·표·코드 규격이 **통째로 미적용**이다. 붙어 있는 클래스만 보고
  "조판이 되어 있다"고 판단하지 말 것.
- **그 페이지에서 조판을 실제로 바꾸려면 `prose-…`를 고치지 말고 임의 자식 선택자를 쓴다** — 예:
  `[&_pre]:overflow-x-auto`. `prose-…`를 추가하는 변경은 죽은 유틸을 새로 심는 것과 같다.

## 그리드/플렉스 컨테이너의 가로 오버플로 — 원인은 콘텐츠가 아니라 **트랙**이다

`/lecture/.../textbook`이 375px에서 398px 넘치던 건(US-011·US-012가 두 번 넘긴 것)의 귀속:

1. `div`가 모바일에서도 `grid`인데 컬럼 지정이 `lg:`에만 있었다 → 암시 트랙 기본값 `auto`는 **max-content까지 성장**한다.
2. 위 typography 부재로 `pre`가 UA 기본 `white-space: pre` · `overflow-x: visible` → 가장 긴 코드 줄이 트랙 폭을 정한다.

**둘 중 하나만 고치면 값이 1px도 안 움직인다**(트랙만·`min-width:0`만·`pre`만 = 전부 398 그대로, 둘 동시 = 0).
→ 반응형 컨테이너에 `grid`를 걸 때는 **기본 브레이크포인트에도 `grid-cols-[minmax(0,1fr)]`을 명시**하고,
스크롤 가능한 자식(`pre`·`table`)은 스크롤 컨테이너로 만든다.

- ★ 진단 시 **블록 자식의 `scrollWidth`로 범인을 찾지 말 것** — 자기 콘텐츠가 아니라 부모가 정해 준 폭이라
  빈 `<p>`까지 전부 같은 값이 나온다. `page.evaluate`로 **후보 처방을 하나씩 켜 보고 `docOver`가 0이 되는 조합**을 찾는다.
- ★ `overflow-wrap: break-word`는 **min-content를 줄이지 않는다**(줄이는 건 `anywhere`뿐).
  `word-break: keep-all`(US-011이 `body`로 승격)과 `min-width: auto`가 만나면 컨테이너가 최장 토큰만큼 넓어진다.

## `layout.tsx` `<head>` 메타 — 어느 경로로 나오는지 먼저 확인한다

`theme-color`·`viewport`는 이 레포에서 Next의 `metadata`/`viewport` **export가 아니라 `layout.tsx` `<head>`의 raw JSX**로
나온다(`export const metadata`에는 `themeColor` 키가 없다). 고칠 때 **grep으로 출처를 먼저 확인**할 것 —
`viewport.themeColor` 배열 API로 옮기면서 raw 태그를 안 지우면 **같은 메타가 2벌** 렌더된다.
검증은 빌드 산출물이 제일 싸다: `grep -o 'theme-color[^>]*' .next/server/app/<정적라우트>.html` +
`grep -c 'name="theme-color"'`. (RSC flight 페이로드에도 문자열이 보이지만 그건 `\"name\":\"theme-color\"` 형태라
`<head>` 태그 카운트에는 안 잡힌다 — 헷갈리지 말 것.)

- ★ **`theme-color`는 리터럴 색만 받는다.** `var(--color-bg-surface)`는 조용히 무시된다 → **토큰화 대상이 아니다.**
  타입체크·lint·빌드 어디에도 안 걸린다(canvas `ctx.fillStyle`과 같은 부류).
- ★ **`media="(prefers-color-scheme: …)"`는 OS 설정만 탄다 — 이 사이트의 테마 축이 아니다.**
  축은 `.dark` 클래스 + localStorage(`ThemeToggle.tsx`)이므로 **OS 라이트 + 사이트 토글 다크** 방문자는
  브라우저 크롬만 라이트로 남는다. 이건 `media` 방식의 구조적 한계이지 버그가 아니다.
  없애려면 토글이 런타임에 meta 태그를 갱신해야 한다.

## ★★ 램프 토큰(`--blue-*`)을 잉크로 직접 참조하면 다크가 조용히 깨진다 (US-016 실측)

`.dark`는 파랑 램프 중 **`--blue-50`만 알파 틴트로 재정의한다**(`globals.css:200`
`--blue-50: rgba(49,130,246,.12)`). `--blue-200`·`--blue-600`·`--blue-700`은 **재정의가 없어 라이트 값 그대로**다.

그래서 호출부가 `backgroundColor: var(--blue-50)` + `color: var(--blue-600|700)` 쌍을 직접 쓰면
다크에서 **배경만 어두워지고 잉크는 라이트 파랑으로 남는다** → 실측 **2.03~3.83:1**(AA 미달).
라이트에서는 같은 쌍이 4.82~5.87:1로 멀쩡해서 **라이트만 보면 절대 안 보인다.**

- 실제 사례(US-016 시점): `BetaBanner:38-40`(전 라우트) · `contact:136,219-220` · `subsidy:117-118` ·
  `ArticleCard:13` · `components/CaseCard:20` · `StepDiagram:8` · `ComparisonTable:17` · `HomeClient:135` ·
  `HolidayPayCalculator:450` · `cases/[id]` · `faq` · `database/_components/*` · `ChatInterface`.
- **규칙: 잉크·전경은 역할 토큰으로 쓴다** — `--color-info` / `--color-info-ink` / `--color-accent-ink`.
  역할 토큰은 `.dark`에 전부 반전값이 있다(`--color-info: var(--blue-300)` 등). 램프 직접 참조는 **배경 전용**으로 본다.
- 같은 함정의 다른 얼굴: `--color-accent`는 `.dark`에 **선언 자체가 없다** — DESIGN.md §3.3 표는 다크 `#4593fc`라고
  적지만 실측은 라·다 모두 `#3182f6`이다. 문서를 근거로 "다크는 알아서 밝아진다"고 가정하지 말 것.
- 판별법: `grep -rn -- "--blue-[2-9]00" src/ --include=*.tsx` 로 잉크 참조를 찾고,
  `grep -n -- "--blue-" src/app/globals.css` 의 `.dark` 블록(현 200행 부근)에 그 단계가 있는지 대조한다.
