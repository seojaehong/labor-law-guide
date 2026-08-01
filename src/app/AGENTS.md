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
