'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import './tool-split.css';

// 계산기 2단 틀 — PC(1024px 이상)는 입력 왼쪽·결과 오른쪽 고정, 모바일은 한 단.
// 모바일에서 결과가 아직 화면 아래에 있으면 「결과 보기」 바를 띄운다(결과가 보이거나 지나가면 숨김).
// DOM 순서는 입력 → 결과 → 더 보기 그대로라 화면 읽기 순서도 같다.

export default function ToolSplit({ inputs, result, children }: { inputs: ReactNode; result: ReactNode; children?: ReactNode }) {
  const resultRef = useRef<HTMLDivElement>(null);
  const [below, setBelow] = useState(false);

  useEffect(() => {
    const el = resultRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') return;
    const io = new IntersectionObserver(([e]) => {
      setBelow(!e.isIntersecting && e.boundingClientRect.top > 0);
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  const jump = () => {
    const el = resultRef.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  };

  return (
    <div className="tool-split">
      <div className="tool-split__inputs">{inputs}</div>
      <div className="tool-split__result" ref={resultRef} tabIndex={-1} role="region" aria-label="계산 결과">{result}</div>
      {children && <div className="tool-split__details">{children}</div>}
      {below && (
        <button type="button" className="tool-split__jump" onClick={jump}>결과 보기</button>
      )}
    </div>
  );
}
