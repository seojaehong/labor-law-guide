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
