'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, ClipboardCopy, ShieldCheck, X } from 'lucide-react';
import { checkRules, type RuleSpec, type Verdict } from '@/lib/laws/rules-check';
import { citation, copyRich, ddayLabel, download, fmtDate, icsCalendar, prepCalItems, todayKST } from '@/lib/laws/format';

const SAMPLE = `제22조(휴게) ① 회사는 근로시간이 4시간인 경우에는 30분 이상, 8시간인 경우에는 1시간 이상의 휴게시간을 근로시간 도중에 준다.
제30조(연차유급휴가) ① 회사는 1년간 80퍼센트 이상 출근한 근로자에게 15일의 유급휴가를 준다.
제40조(배우자 출산휴가) ① 회사는 근로자가 배우자의 출산을 이유로 휴가를 고지하는 경우 20일의 유급휴가를 준다.
② 배우자 출산휴가는 배우자가 출산한 날부터 120일이 지나면 사용할 수 없다.
제41조(난임치료휴가) ① 회사는 근로자가 난임치료를 받기 위하여 휴가를 청구하는 경우 연간 6일 이내의 휴가를 주며, 이 경우 최초 2일은 유급으로 한다.
제42조(육아휴직) ① 회사는 근로자가 만 8세 이하 또는 초등학교 2학년 이하의 자녀를 양육하기 위하여 휴직을 신청하는 경우에 이를 허용한다.
제43조(육아기 근로시간 단축) ① 회사는 근로자가 근로시간의 단축을 신청하는 경우에 이를 허용한다. 다만, 대체인력 채용이 불가능한 경우에는 그러하지 아니하다.`;

let rulesPromise: Promise<RuleSpec[]> | null = null;
const loadRules = () =>
  (rulesPromise ??= fetch('/data/laws/rules.json').then((r) => { if (!r.ok) throw new Error('Rules unavailable'); return r.json(); }).then((d) => { if (!Array.isArray(d.rules)) throw new Error('Invalid rules'); return d.rules as RuleSpec[]; }).catch((error) => { rulesPromise = null; throw error; }));

function label(v: Verdict) {
  if (v.status === '반영됨') return { text: '반영됨', cls: 'ok' };
  if (!v.rule.required) return { text: '선택', cls: 'opt' };
  return { text: v.status === '누락' ? '조문 추가' : '고칠 것', cls: 'fix' };
}

function clauseText(v: Verdict) {
  const p = v.rule.mst ? { date: '', no: '', kind: '', mst: v.rule.mst } : undefined;
  return `${v.rule.clause}\n\n(근거) ${v.rule.law} ${v.rule.article}, ${fmtDate(v.rule.effective)} 시행\n${citation(v.rule.law, p, v.rule.effective).split('\n')[1]}`;
}

export default function RulesCheck({ onClose, toast }: { onClose: () => void; toast: (m: string) => void }) {
  const [text, setText] = useState('');
  const [rules, setRules] = useState<RuleSpec[] | null>(null);
  const [showOk, setShowOk] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const ref = useRef<HTMLTextAreaElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const today = todayKST();

  useEffect(() => {
    loadRules().then(setRules).catch(() => setLoadError(true));
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab') {
        const nodes = [...(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), textarea, a[href], input:not(:disabled)') ?? [])].filter(el => el.getClientRects().length);
        const first = nodes[0], last = nodes[nodes.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = overflow; previous?.focus(); };
  }, [onClose]);

  const verdicts = useMemo(() => (rules && text.trim().length > 20 ? checkRules(text, rules) : null), [rules, text]);
  const fix = verdicts?.filter((v) => v.status !== '반영됨' && v.rule.required) ?? [];
  const opt = verdicts?.filter((v) => v.status !== '반영됨' && !v.rule.required) ?? [];
  const ok = verdicts?.filter((v) => v.status === '반영됨') ?? [];

  const downloadPrep = () => {
    const targets = [...fix, ...opt].map((v) => ({
      key: `${v.rule.lawId}-${v.rule.article}-${v.rule.effective}`, topic: v.rule.topic, law: v.rule.law,
      article: v.rule.article, effective: v.rule.effective, required: v.rule.required,
    }));
    download('취업규칙_대응일정.ics', icsCalendar(prepCalItems(targets, today)), 'text/calendar;charset=utf-8');
    toast(`${targets.length}건의 개정안 작성·의견 청취·변경 신고 일정을 캘린더 파일로 받았습니다`);
  };

  const copyAllFix = async () => {
    const body = fix.map((v, i) => `${i + 1}. ${v.rule.topic}${v.where ? ` (현행 ${v.where})` : ' (새 조문)'}\n${clauseText(v)}`).join('\n\n');
    if (await copyRich(`[취업규칙 반영 문안 ${fix.length}건]\n\n${body}`)) toast(`수정 문안 ${fix.length}건을 한 번에 복사했습니다`);
  };

  return (
    <div className="lr-modal" role="dialog" aria-modal="true" aria-label="취업규칙 점검" onClick={onClose}>
      <div ref={dialogRef} className="lr-modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="lr-modal-head">
          <div>
            <div className="lr-eyebrow">취업규칙 점검</div>
            <h2>취업규칙 개정 관련 항목 확인</h2>
            <p className="lr-review-note">법령 검수 전 · 자동 문구 대조 결과는 법률 판단이 아닙니다.</p>
          </div>
          <button className="lr-icon-btn" onClick={onClose} aria-label="닫기"><X size={18} /></button>
        </div>

        <div className="lr-check">
          <div className="lr-check-in">
            <h3 className="lr-input-title">1. 취업규칙 본문 붙여넣기</h3>
            <textarea
              ref={ref}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={'한글·워드에서 취업규칙을 열고 Ctrl+A → Ctrl+C 한 다음 여기에 Ctrl+V 하세요.\n조문 제목(제○조(…))이 줄 머리에 있으면 위치까지 짚어 드립니다.'}
              aria-label="취업규칙 본문"
            />
            <div className="lr-check-meta">
              <ShieldCheck size={14} /> 붙여넣은 본문은 이 브라우저 안에서만 판정합니다. 서버로 보내지 않습니다.
              <span className="sp" />
              {!text && <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => setText(SAMPLE)}>예시 입력</button>}
              {text && <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={() => setText('')}>지우기</button>}
            </div>
          </div>

          <div className="lr-check-out" aria-live="polite">
            <h3 className="lr-output-title">2. 원문과 대조할 항목</h3>
            {!rules && !loadError && <p role="status">점검 기준을 불러오는 중입니다.</p>}
            {loadError && <div className="lr-check-empty" role="alert">점검 기준을 불러오지 못했습니다. 입력한 내용을 유지한 채 다시 시도할 수 있습니다.<button className="lr-btn" onClick={() => { setLoadError(false); loadRules().then(setRules).catch(() => setLoadError(true)); }}>다시 시도</button></div>}
            {!loadError && !verdicts && (
              <div className="lr-check-empty">
                <b>{rules ? `개정 ${rules.length}건` : '…'}</b>과 대조합니다. 배우자 출산전후휴가, 배우자 유산·사산휴가, 단기 육아휴직, 난임치료휴가 유급 4일, 육아기 근로시간 단축, 연차 분할 사용, 휴게 생략 요청 등.
              </div>
            )}
            {verdicts && (
              <>
                <div className="lr-check-sum">
                  <div><span className="n fix">{fix.length}</span>고칠 것</div>
                  <div><span className="n opt">{opt.length}</span>선택</div>
                  <div><span className="n ok">{ok.length}</span>반영됨</div>
                  <span className="sp" />
                  {fix.length > 0 && <button className="lr-btn lr-btn-sm" onClick={copyAllFix}><ClipboardCopy size={14} /> 수정 문안 전부 복사</button>}
                  {fix.length + opt.length > 0 && (
                    <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={downloadPrep} title="시행일에서 거꾸로 세운 개정안 작성·의견 청취·변경 신고 일정">
                      <CalendarClock size={14} /> 대응 일정 캘린더로
                    </button>
                  )}
                </div>
                {[...fix, ...opt, ...(showOk ? ok : [])].map((v) => (
                  <VerdictCard key={v.rule.article + v.rule.topic} v={v} today={today} toast={toast} />
                ))}
                {ok.length > 0 && (
                  <button className="lr-fold-btn" onClick={() => setShowOk(!showOk)}>
                    {showOk ? '반영된 항목 접기' : `반영된 ${ok.length}건 보기`}
                  </button>
                )}
                <p className="lr-check-note">
                  자동 대조는 문구를 기준으로 합니다. 표현을 달리 쓴 조항은 「고칠 것」으로 보일 수 있으니 원문과 함께 확인하세요.
                  {' '}<Link href="/contact">노무사 검토 요청</Link>
                </p>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function VerdictCard({ v, today, toast }: { v: Verdict; today: string; toast: (m: string) => void }) {
  const l = label(v);
  const upcoming = v.rule.effective > today;
  return (
    <div className={`lr-verdict ${l.cls}`}>
      <div className="lr-rule-head">
        <span className={`lr-badge v-${l.cls}`}>{l.text}</span>
        <b>{v.rule.topic}</b>
      </div>
      <div className="lr-verdict-meta">
        {v.rule.law} {v.rule.article} · {fmtDate(v.rule.effective)} {upcoming ? `시행 예정(${ddayLabel(v.rule.effective, today)})` : '시행 중'}
        {v.where && <> · 현행 <b>{v.where}</b></>}
        {!v.where && v.status === '누락' && <> · 해당 조문 없음</>}
      </div>
      {v.status !== '반영됨' && (
        <>
          {v.stale.length > 0 && <div className="lr-verdict-meta">남은 옛 문구: {v.stale.map((s) => <del key={s}>{s}</del>)}</div>}
          <p>{v.rule.point}</p>
          <div className="lr-clause">{v.rule.clause}</div>
          <div style={{ marginTop: 8 }}>
            <button className="lr-btn lr-btn-ghost lr-btn-sm" onClick={async () => { if (await copyRich(clauseText(v))) toast('문안을 복사했습니다. 회사 조문 번호에 맞춰 붙이세요'); }}>
              <ClipboardCopy size={14} /> 문안 복사
            </button>
          </div>
        </>
      )}
    </div>
  );
}
