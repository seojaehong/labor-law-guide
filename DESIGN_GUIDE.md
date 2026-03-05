# 노동법 인사이트 — 디자인 & 개발 가이드 v2

> 2025-2026 최신 웹 디자인 트렌드 리서치 기반. Toss, Linear, Stripe, Apple Liquid Glass, Awwwards 수상작 패턴 반영.

---

## 0. 디자인 원칙 (Design Philosophy)

### "Earned Minimalism" — 모든 요소가 존재 이유를 갖는다
- Jony Ive / LoveFrom 철학: 장식적 요소 제거, 네거티브 스페이스 = 자신감의 표현
- Toss 철학: 시스템이 완성도 높으면 디자이너는 컴포넌트가 아닌 제품에 집중
- Linear 접근: 모노크롬 + 단일 액센트 컬러 = 프리미엄

### 핵심 키워드
1. **단일 폰트 패밀리** (Pretendard Variable — 100~900 weight)
2. **모노크롬 + 블루 액센트** (Toss Blue `#3182f6` 참조)
3. **Glass는 네비게이션/크롬에만** (본문 영역은 깨끗한 솔리드)
4. **Scroll-aware 인터랙션** (TOC 하이라이트, 부드러운 진입 애니메이션)
5. **한국어 타이포그래피 최적화** (`word-break: keep-all`, 40자/줄)

---

## 1. 폰트 (Typography)

### Pretendard Variable CDN

```html
<!-- layout.tsx <head>에 추가 -->
<link rel="stylesheet" as="style" crossOrigin="anonymous"
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css" />
```

### font-family 스택

```css
font-family: "Pretendard Variable", Pretendard, -apple-system, BlinkMacSystemFont,
  system-ui, Roboto, "Helvetica Neue", "Segoe UI", "Apple SD Gothic Neo",
  "Noto Sans KR", "Malgun Gothic", sans-serif;
```

### 타입 스케일 (Fluid Typography — clamp)

| 토큰 | 값 | line-height | letter-spacing | 용도 |
|------|----|-------------|----------------|------|
| `--text-xs` | `clamp(0.6875rem, 0.6rem + 0.3vw, 0.75rem)` | 1.4 | 0 | 캡션, 라벨 |
| `--text-sm` | `clamp(0.8125rem, 0.75rem + 0.25vw, 0.875rem)` | 1.5 | 0 | 보조 텍스트 |
| `--text-base` | `clamp(0.9375rem, 0.85rem + 0.4vw, 1.0625rem)` | 1.65 | -0.01em | **본문** (15→17px) |
| `--text-lg` | `clamp(1.125rem, 1rem + 0.5vw, 1.25rem)` | 1.5 | -0.01em | 소제목 |
| `--text-xl` | `clamp(1.25rem, 1.1rem + 0.6vw, 1.5rem)` | 1.3 | -0.02em | 섹션 헤딩 |
| `--text-2xl` | `clamp(1.5rem, 1.2rem + 1vw, 2rem)` | 1.2 | -0.025em | 페이지 타이틀 |
| `--text-hero` | `clamp(2.5rem, 1.5rem + 4vw, 5rem)` | 1.05 | -0.03em | 히어로 |

### 한국어 본문 규칙

```css
.content-body {
  font-family: "Pretendard Variable", sans-serif;
  font-size: var(--text-base);
  line-height: 1.65;
  letter-spacing: -0.01em;
  word-break: keep-all;        /* 한국어 단어 단위 줄바꿈 */
  overflow-wrap: break-word;
  max-width: 38em;             /* ~40 한글 글자 (WCAG CJK 권장) */
  color: var(--color-text-primary);
}
```

---

## 2. 컬러 시스템

### Toss 기반 팔레트 (Light Mode 기본)

```css
:root {
  /* Grey Scale (Toss 참조) */
  --grey-50:  #f9fafb;
  --grey-100: #f2f4f6;
  --grey-200: #e5e8eb;
  --grey-300: #d1d6db;
  --grey-400: #b0b8c1;
  --grey-500: #8b95a1;
  --grey-600: #6b7684;
  --grey-700: #4e5968;
  --grey-800: #333d4b;
  --grey-900: #191f28;

  /* Brand Blue (Toss) */
  --blue-50:  #e8f3ff;
  --blue-100: #c9e2ff;
  --blue-200: #90c2ff;
  --blue-300: #64a8ff;
  --blue-400: #4593fc;
  --blue-500: #3182f6;   /* ← 주 액센트 */
  --blue-600: #1b64da;
  --blue-700: #1957c2;

  /* Semantic Tokens */
  --color-bg-primary:    var(--grey-50);    /* 페이지 배경 */
  --color-bg-surface:    #ffffff;           /* 카드/패널 */
  --color-bg-elevated:   #ffffff;           /* 모달/팝오버 */

  --color-text-primary:   var(--grey-900);
  --color-text-secondary: var(--grey-600);
  --color-text-tertiary:  var(--grey-400);

  --color-accent:         var(--blue-500);
  --color-accent-hover:   var(--blue-600);
  --color-accent-light:   var(--blue-50);

  --color-border:         var(--grey-200);
  --color-border-subtle:  rgba(0,0,0,0.06);

  --color-danger:  #ef4444;
  --color-success: #10b981;
  --color-warning: #f59e0b;
}
```

### 배경 — Mesh Gradient (미묘한 오로라)

```css
body {
  background-color: var(--color-bg-primary);
  background-image:
    radial-gradient(ellipse 80% 60% at 20% 30%, rgba(49,130,246,0.06) 0%, transparent 50%),
    radial-gradient(ellipse 60% 80% at 80% 20%, rgba(99,102,241,0.04) 0%, transparent 50%),
    radial-gradient(ellipse 70% 50% at 50% 80%, rgba(16,185,129,0.03) 0%, transparent 50%);
  background-attachment: fixed;
}
```

---

## 3. Liquid Glass (네비게이션/크롬 전용)

> **중요**: Glass 효과는 네비게이션 바, 사이드바, 플로팅 TOC, 모달에만. 본문 콘텐츠 영역은 절대 적용하지 않는다.

### 3단계 Glass

```css
/* Level 1: 내비게이션 바 */
.glass-nav {
  background: rgba(255, 255, 255, 0.72);
  backdrop-filter: blur(16px) saturate(180%);
  -webkit-backdrop-filter: blur(16px) saturate(180%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 1px 3px rgba(0,0,0,0.05);
}

/* Level 2: 사이드바, 카드 */
.glass-panel {
  background: rgba(255, 255, 255, 0.45);
  backdrop-filter: blur(24px) saturate(180%);
  -webkit-backdrop-filter: blur(24px) saturate(180%);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 16px;
  box-shadow:
    0 8px 32px rgba(0,0,0,0.06),
    inset 0 1px 0 rgba(255,255,255,0.8);
}

/* Level 3: 플로팅 TOC, 팝오버 */
.glass-elevated {
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(40px) saturate(200%);
  -webkit-backdrop-filter: blur(40px) saturate(200%);
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 20px;
  box-shadow:
    0 12px 40px rgba(0,0,0,0.08),
    inset 0 2px 0 rgba(255, 255, 255, 0.9);
}
```

### 미지원 브라우저 폴백

```css
@supports not (backdrop-filter: blur(1px)) {
  .glass-nav, .glass-panel, .glass-elevated {
    background: rgba(255, 255, 255, 0.92);
  }
}
```

### 성능 규칙
- `blur()` ≤ 16px (네비게이션), ≤ 24px (사이드바)
- 뷰포트 60% 이상의 영역에 glass 사용 금지
- 모바일에서는 `blur()` 값 절반으로 줄이기

---

## 4. 레이아웃 — 3패널 Documentation 표준

Stripe Docs, Vercel Docs, GitBook 등 콘텐츠 사이트의 표준 패턴.

```
┌──────────────────────────────────────────────────────────┐
│  Glass Nav (sticky, scroll시 compact)                     │
├──────────┬───────────────────────────────┬───────────────┤
│ Left     │                               │  Right        │
│ Section  │   Article Content             │  Sticky       │
│ Nav      │   (max-width: 720px)          │  TOC          │
│ (260px)  │   word-break: keep-all        │  (220px)      │
│          │   Solid white bg              │  scroll-aware │
├──────────┴───────────────────────────────┴───────────────┤
│  Footer                                                   │
└──────────────────────────────────────────────────────────┘
```

### CSS Grid 구현

```css
.docs-layout {
  display: grid;
  grid-template-columns: 260px 1fr 220px;
  gap: 0;
  min-height: 100vh;
  max-width: 1400px;   /* 양쪽 빈공간 최소화 */
  margin: 0 auto;
}

/* 반응형 축소 */
@media (max-width: 1024px) {
  .docs-layout {
    grid-template-columns: 240px 1fr;
  }
  .docs-toc { display: none; }
}

@media (max-width: 768px) {
  .docs-layout {
    grid-template-columns: 1fr;
  }
  .docs-sidebar { display: none; }  /* 햄버거 메뉴로 대체 */
}
```

### Sticky TOC (IntersectionObserver로 활성 섹션 추적)

```tsx
// React 구현
useEffect(() => {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          setActiveSection(entry.target.id);
        }
      });
    },
    { rootMargin: '-80px 0px -60% 0px' }
  );
  document.querySelectorAll('h2[id], h3[id]').forEach(h => observer.observe(h));
  return () => observer.disconnect();
}, []);
```

```css
.toc-link {
  font-size: 0.8125rem;
  color: var(--color-text-tertiary);
  padding: 4px 12px;
  border-left: 2px solid transparent;
  transition: all 150ms ease;
}

.toc-link.active {
  color: var(--color-accent);
  font-weight: 600;
  border-left-color: var(--color-accent);
}
```

---

## 5. 콘텐츠 블록 컴포넌트 (5종)

JSON 데이터의 `content`를 파싱하여 아래 블록 유형으로 자동 분류.

### 5-1. 조문 블록 (ArticleBlock)

```tsx
// 트리거: "제N조", "제N항", "동법 제N조"
<div className="my-6 rounded-xl bg-blue-50/60 border border-blue-100 p-5">
  <div className="flex items-center gap-2 mb-3">
    <Scale size={16} className="text-blue-500" />
    <span className="text-sm font-bold text-blue-700">관련 조문</span>
  </div>
  <p className="text-[15px] leading-relaxed text-grey-800">{content}</p>
</div>
```

### 5-2. 정의 블록 (DefinitionBlock)

```tsx
// 트리거: "~란", "~의미한다", "~정의"
<div className="my-6 rounded-xl bg-grey-50 border border-grey-200 p-5">
  <div className="flex items-center gap-2 mb-3">
    <BookOpen size={16} className="text-grey-500" />
    <span className="text-sm font-bold text-grey-700">용어 정의</span>
  </div>
  <p className="text-[15px] leading-relaxed">{content}</p>
</div>
```

### 5-3. 판례 블록 (CaseBlock)

```tsx
// 트리거: "대법원", "20XX두", "20XX다", "판결"
<div className="my-6 rounded-xl border-l-4 border-l-blue-500 bg-white p-5 shadow-sm">
  <div className="flex items-center gap-2 mb-3">
    <Gavel size={16} className="text-blue-600" />
    <span className="text-sm font-bold text-blue-700">판례</span>
    <span className="text-xs text-grey-400">{caseNumber}</span>
  </div>
  <p className="text-[15px] leading-relaxed text-grey-700">{content}</p>
</div>
```

### 5-4. 주의/해석포인트 (NoteBlock)

```tsx
// 트리거: "유의", "주의", "중요", "참고"
<div className="my-6 rounded-xl border-l-4 border-l-amber-400 bg-amber-50/50 p-5">
  <div className="flex items-center gap-2 mb-3">
    <AlertTriangle size={16} className="text-amber-600" />
    <span className="text-sm font-bold text-amber-700">해석 포인트</span>
  </div>
  <p className="text-[15px] leading-relaxed text-grey-700">{content}</p>
</div>
```

### 5-5. 기준/요건 블록 (CriteriaBlock)

```tsx
// 트리거: "①", "②", 번호가 있는 나열
<div className="my-6 rounded-xl bg-white border border-grey-200 p-5">
  <div className="flex items-center gap-2 mb-3">
    <ListChecks size={16} className="text-emerald-600" />
    <span className="text-sm font-bold text-emerald-700">판단 기준</span>
  </div>
  <ol className="list-none space-y-3 text-[15px] leading-relaxed">
    {items.map((item, i) => (
      <li key={i} className="flex gap-3">
        <span className="shrink-0 w-6 h-6 rounded-full bg-emerald-50 text-emerald-600
                         flex items-center justify-center text-xs font-bold">{i+1}</span>
        <span>{item}</span>
      </li>
    ))}
  </ol>
</div>
```

---

## 6. 애니메이션 & 인터랙션

### 이징 함수 (2025 프리미엄 표준)

```css
:root {
  --ease-expo-out: cubic-bezier(0.16, 1, 0.3, 1);    /* 빠른 시작, 느린 정착 — Linear/Vercel 사용 */
  --ease-standard:  cubic-bezier(0.4, 0, 0.2, 1);    /* Material Design 표준 */
  --transition-fast:   150ms;
  --transition-normal: 300ms;
  --transition-slow:   500ms;
}
```

### 스크롤 진입 애니메이션 (CSS-only, JS 불필요)

```css
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(32px); }
  to   { opacity: 1; transform: translateY(0); }
}

.content-block {
  animation: fade-in-up linear both;
  animation-timeline: view(block);
  animation-range: entry 0% entry 25%;
}
```

### 호버 효과 (카드)

```css
.feature-card {
  transition: transform var(--transition-normal) var(--ease-expo-out),
              box-shadow var(--transition-normal) ease;
}

.feature-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 40px rgba(0,0,0,0.08);
}
```

### Framer Motion (React — 선택 사항)

```tsx
// 스태거 리스트 진입
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const itemVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] } },
};
```

---

## 7. 그림자 시스템 (2-Layer Shadow)

> 2025 프리미엄 사이트는 항상 ambient + direct 2중 그림자 사용.

```css
:root {
  --shadow-sm: 0 1px 2px rgba(0,0,0,0.05), 0 0 0 1px rgba(0,0,0,0.03);
  --shadow-md: 0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03);
  --shadow-lg: 0 10px 15px -3px rgba(0,0,0,0.08), 0 4px 6px -2px rgba(0,0,0,0.04), 0 0 0 1px rgba(0,0,0,0.03);
  --shadow-xl: 0 20px 40px -8px rgba(0,0,0,0.1), 0 8px 16px -4px rgba(0,0,0,0.06);
}
```

---

## 8. Border Radius 체계

| 용도 | 값 | 예시 |
|------|-----|------|
| UI 컴포넌트 (버튼, 입력) | 8px | `rounded-lg` |
| 카드, 패널 | 16px | `rounded-2xl` |
| 모달, 큰 패널 | 20~24px | `rounded-3xl` |
| 필/태그 | 9999px | `rounded-full` |

---

## 9. 콘텐츠 자동 감지 렌더링 로직

```typescript
function detectBlockType(text: string): BlockType {
  // 조문
  if (/제\d+조|제\d+항|동법\s*제/.test(text)) return 'article';
  // 판례
  if (/대법원|헌법재판소|\d{2,4}(두|다|누|나|가합|구합)/.test(text)) return 'case';
  // 정의
  if (/(이란|란|의미한다|정의한다|말한다)/.test(text)) return 'definition';
  // 기준/나열
  if (/^[①②③④⑤⑥⑦⑧⑨⑩]/.test(text) || /^\d+[\.\)]\s/.test(text)) return 'criteria';
  // 주의
  if (/(유의|주의|중요|참고|해석포인트)/.test(text)) return 'note';
  // 기본
  return 'paragraph';
}
```

---

## 10. 레퍼런스 사이트

| 사이트 | 참고 포인트 |
|--------|------------|
| [Toss](https://toss.im) | 컬러 시스템, 타이포그래피, 한국어 최적화 |
| [Linear](https://linear.app) | 모노크롬+액센트, 다크모드, 그림자 체계 |
| [Stripe Docs](https://docs.stripe.com) | 3패널 레이아웃, TOC, 콘텐츠 구조 |
| [Vercel](https://vercel.com/docs) | 폰트 시스템, 애니메이션, 미니멀 UI |
| [Apple Liquid Glass](https://developer.apple.com) | glass-nav, glass-panel 참조 |
| [lovefrom.com](https://lovefrom.com) | 타이포그래피 절제, 네거티브 스페이스 |

---

## 11. 구현 체크리스트

- [ ] Pretendard Variable CDN 연결
- [ ] CSS 변수 (컬러, 타입 스케일, 그림자, 이징) 설정
- [ ] `word-break: keep-all` + `max-width: 38em` 본문 적용
- [ ] 3패널 레이아웃 (사이드바 260px + 콘텐츠 + TOC 220px)
- [ ] 반응형: 1024px 이하 TOC 숨김, 768px 이하 사이드바 숨김
- [ ] Glass 효과: 네비게이션 바 + 사이드바에만 적용
- [ ] 콘텐츠 블록 5종 컴포넌트 구현 (자동 감지 렌더링)
- [ ] Sticky TOC + IntersectionObserver 스크롤 추적
- [ ] 스크롤 진입 애니메이션 (CSS `animation-timeline: view()`)
- [ ] 카드 호버 효과 (translateY -4px + shadow 확대)
- [ ] 2중 그림자 시스템 적용
- [ ] `backdrop-filter` 미지원 폴백
- [ ] 모바일 성능 테스트 (glass blur 절반 축소)
