'use client';

import { useEffect, useRef, useState } from 'react';
import { CalendarPlus, ClipboardCopy, Download } from 'lucide-react';
import { copyRich } from '@/lib/laws/format';

// 캘린더 구독 — 지금 걸어 둔 필터(법령·취업규칙·법률만)를 그대로 담은 구독 주소를 만든다.
// 한 번 구독하면 새 개정이 수집될 때마다 캘린더 앱이 알아서 다시 받아 간다(내려받기 파일과 다른 점).
export default function SubscribeButton({
  laws, rulesOnly, lawsOnly, onDownload, toast,
}: {
  laws: string[];
  rulesOnly: boolean;
  lawsOnly: boolean;
  onDownload: () => void;
  toast: (m: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [promulgation, setPromulgation] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', esc);
    return () => { document.removeEventListener('mousedown', close); window.removeEventListener('keydown', esc); };
  }, [open]);

  const qs = new URLSearchParams();
  if (laws.length) qs.set('law', laws.join(','));
  if (rulesOnly) qs.set('rules', '1');
  if (lawsOnly) qs.set('level', 'law');
  if (promulgation) qs.set('promulgation', '1');
  const host = typeof window === 'undefined' ? '' : window.location.host;
  const proto = typeof window === 'undefined' ? 'https:' : window.location.protocol;
  const path = `/laws/calendar.ics${qs.toString() ? `?${qs}` : ''}`;
  const https = `${proto}//${host}${path}`;
  const webcal = `webcal://${host}${path}`;
  const scope = [laws.length ? `법령 ${laws.length}개` : '전체 법령', rulesOnly ? '취업규칙 관련만' : '', lawsOnly ? '법률만' : ''].filter(Boolean).join(' · ');

  return (
    <div className="lr-sub" ref={ref}>
      <button className="lr-btn lr-btn-ghost" onClick={() => setOpen(!open)} aria-expanded={open} title="개정 일정을 내 캘린더에 구독">
        <CalendarPlus size={16} /> 캘린더 구독
      </button>
      {open && (
        <div className="lr-sub-pop" role="dialog" aria-label="캘린더 구독">
          <h3>개정 일정을 내 캘린더로</h3>
          <p>한 번 구독하면 새 개정이 들어올 때마다 캘린더가 알아서 갱신됩니다. 시행 하루 전에 알림이 옵니다.</p>
          <p><b>{scope}</b> 기준입니다. 위 필터를 바꾸면 구독 범위도 바뀝니다.</p>
          <label><input type="checkbox" checked={promulgation} onChange={(e) => setPromulgation(e.target.checked)} /> 공포일도 넣기</label>
          <div className="row">
            <a className="lr-btn lr-btn-sm" href={`https://calendar.google.com/calendar/render?cid=${encodeURIComponent(webcal)}`} target="_blank" rel="noreferrer">구글 캘린더</a>
            <a className="lr-btn lr-btn-ghost lr-btn-sm" href={`https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(https)}&name=${encodeURIComponent('노동법 개정 일정')}`} target="_blank" rel="noreferrer">아웃룩</a>
            <a className="lr-btn lr-btn-ghost lr-btn-sm" href={webcal}>애플·기타</a>
          </div>
          <div className="lr-sub-url">{https}</div>
          <div className="row">
            <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={async () => { if (await copyRich(https)) toast('구독 주소를 복사했습니다. 캘린더 앱의 「URL로 추가」에 붙이세요'); }}>
              <ClipboardCopy size={14} /> 주소 복사
            </button>
            <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => { onDownload(); setOpen(false); }}>
              <Download size={14} /> 파일로 한 번만 받기
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
