'use client';
import { useCallback, useState } from 'react';
import Link from 'next/link';
import RulesCheck from '../../laws/RulesCheck';

export default function WorkRulesClient() {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState('');
  const close = useCallback(() => setOpen(false), []);
  return <div className="lr"><div className="lr-wrap">
    <header className="lr-hero">
      <h1 className="lr-h1">취업규칙 점검</h1>
      <p className="lr-lead">취업규칙 텍스트를 입력해 법령 개정 관련 항목을 확인합니다.</p>
      <p className="lr-review-note">법령 검수 전 참고 자료입니다. 결과와 제안 문안은 원문 대조와 공인노무사 검토가 필요합니다.</p>
      <div className="lr-hero-cta"><button className="lr-btn" onClick={() => setOpen(true)}>취업규칙 입력·점검</button></div><p><Link href="/laws">법령 개정 현황</Link></p>
    </header>
    <section aria-label="기타 도구"><h2>기타 계산·점검 도구</h2><p><Link href="/tools">근로계약서 점검·공휴일 수당·퇴직금 계산</Link></p></section>
  </div>{open && <RulesCheck onClose={close} toast={setMessage} />}{message && <div className="lr-toast" role="status">{message}</div>}</div>;
}
