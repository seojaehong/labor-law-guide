'use client';

import { useState, useCallback, useEffect } from 'react';
import { Calculator, ChevronRight, Share2, Download, Copy, Check, AlertTriangle, Info, MessageCircle } from 'lucide-react';
import { calcHolidayPay, type Result, type SiteSize, type WorkerType, type HolidayKind } from '@/lib/holiday-pay';

type Step = 'site' | 'holiday' | 'worker' | 'input' | 'result';

const KAKAO_JS_KEY = process.env.NEXT_PUBLIC_KAKAO_JS_KEY || '';

declare global {
  interface Window {
    Kakao?: {
      init: (key: string) => void;
      isInitialized: () => boolean;
      Share?: {
        sendDefault: (params: Record<string, unknown>) => void;
      };
    };
  }
}

function StepHeader({ current }: { current: number }) {
  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: '#64748b' }}>
      {['사업장', '휴일', '유형', '입력', '결과'].map((label, i) => (
        <div key={label} className="flex items-center gap-2">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full font-semibold ${
              i + 1 < current ? 'bg-yellow-400 text-white' : i + 1 === current ? 'bg-slate-900 text-white' : 'bg-slate-200'
            }`}
          >
            {i + 1}
          </span>
          <span className={i + 1 === current ? 'font-semibold text-slate-900' : ''}>{label}</span>
          {i < 4 && <ChevronRight className="h-3 w-3" />}
        </div>
      ))}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-semibold" style={{ color: '#334155' }}>
        {label}
      </label>
      {hint && (
        <div className="mb-2 text-xs" style={{ color: '#64748b' }}>
          {hint}
        </div>
      )}
      {children}
    </div>
  );
}

function NumInput({
  value,
  onChange,
  placeholder,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  suffix?: string;
}) {
  const formatted = (() => {
    const n = parseFloat((value || '').replace(/[,\s]/g, ''));
    if (!isFinite(n)) return value;
    if (suffix === '원' && n >= 1000) return n.toLocaleString('ko-KR');
    return value;
  })();
  return (
    <div className="flex items-center gap-2">
      <input
        type="text"
        inputMode="decimal"
        value={formatted}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.,]/g, ''))}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-base focus:border-yellow-400 focus:outline-none focus:ring-2 focus:ring-yellow-200"
      />
      {suffix && <span className="text-sm text-slate-600">{suffix}</span>}
    </div>
  );
}

export default function HolidayPayCalculator() {
  const [step, setStep] = useState<Step>('site');
  const [siteSize, setSiteSize] = useState<SiteSize>('large');
  const [holidayKind, setHolidayKind] = useState<HolidayKind>('labor_day');
  const [workerType, setWorkerType] = useState<WorkerType>('hourly');

  // 입력 값
  const [monthlyPay, setMonthlyPay] = useState('');
  const [monthlyHours, setMonthlyHours] = useState('209');
  const [inclusivePay, setInclusivePay] = useState(false);
  const [dailyWage, setDailyWage] = useState('');
  const [dailyHours, setDailyHours] = useState('8');
  const [paidContinuously, setPaidContinuously] = useState(true);
  const [hourlyWage, setHourlyWage] = useState('');
  const [hourlyIncludesWeekly, setHourlyIncludesWeekly] = useState(false);
  const [weeklyHours, setWeeklyHours] = useState('40');
  const [workedHours, setWorkedHours] = useState('8');
  const [nightHours, setNightHours] = useState('0');

  const [result, setResult] = useState<Result | null>(null);
  const [copied, setCopied] = useState(false);

  const goToStep = (s: Step) => {
    setResult(null);
    setStep(s);
  };

  const calculate = () => {
    const wh = Math.max(parseFloat(workedHours) || 0, 0);
    const nh = Math.max(parseFloat(nightHours) || 0, 0);
    let r: Result | null = null;

    if (workerType === 'monthly') {
      const mp = parseFloat(monthlyPay.replace(/[,\s]/g, '')) || 0;
      const mh = parseFloat(monthlyHours) || 209;
      if (mp <= 0) {
        alert('월 통상임금 항목 합계를 입력해주세요.');
        return;
      }
      r = calcHolidayPay({
        worker_type: 'monthly',
        site_size: siteSize,
        holiday_kind: holidayKind,
        monthly_pay: mp,
        monthly_hours: mh,
        worked_hours: wh,
        night_hours: nh,
        inclusive_pay: inclusivePay,
      });
    } else if (workerType === 'daily') {
      const dw = parseFloat(dailyWage.replace(/[,\s]/g, '')) || 0;
      const dh = parseFloat(dailyHours) || 8;
      if (dw <= 0) {
        alert('일급을 입력해주세요.');
        return;
      }
      r = calcHolidayPay({
        worker_type: 'daily',
        site_size: siteSize,
        holiday_kind: holidayKind,
        daily_wage: dw,
        daily_hours: dh,
        worked_hours: wh,
        night_hours: nh,
        paid_continuously: paidContinuously,
      });
    } else {
      const hw = parseFloat(hourlyWage.replace(/[,\s]/g, '')) || 0;
      const wkh = parseFloat(weeklyHours) || 0;
      if (hw <= 0) {
        alert('시급을 입력해주세요.');
        return;
      }
      r = calcHolidayPay({
        worker_type: 'hourly',
        site_size: siteSize,
        holiday_kind: holidayKind,
        hourly_wage: hw,
        hourly_includes_weekly: hourlyIncludesWeekly,
        worked_hours: wh,
        night_hours: nh,
        weekly_hours: wkh,
      });
    }

    setResult(r);
    setStep('result');
  };

  const formatNumber = (n: number) => n.toLocaleString('ko-KR');

  const buildShareText = useCallback(() => {
    if (!result) return '';
    const sizeLabel = siteSize === 'large' ? '5인 이상' : '5인 미만';
    const holidayLabel = holidayKind === 'labor_day' ? '노동절(5/1)' : '관공서 공휴일';
    const typeLabel = workerType === 'monthly' ? '월급제' : workerType === 'daily' ? '일용직' : '시급제';
    const lines = [
      `[공휴일 수당 계산 결과]`,
      `• 사업장: ${sizeLabel} | 휴일: ${holidayLabel} | 유형: ${typeLabel}`,
      `• 휴일 근로: ${workedHours}시간` + (parseFloat(nightHours) > 0 ? ` (야간 ${nightHours}시간 포함)` : ''),
      `• 통상시급: ${formatNumber(result.base_hourly)}원`,
      ``,
      `💰 추가 지급액: ${formatNumber(result.total)}원`,
      ``,
      ...result.breakdown.map((b) => `  - ${b.label}: ${formatNumber(b.amount)}원`),
      ``,
      `🔍 자세한 계산: 노란봉투법.com/tools/holiday-pay`,
    ];
    return lines.join('\n');
  }, [result, siteSize, holidayKind, workerType, workedHours, nightHours]);

  const handleCopy = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(buildShareText());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert('복사 실패. 결과를 직접 복사해주세요.');
    }
  };

  const handleNativeShare = async () => {
    if (!result) return;
    const text = buildShareText();
    const url = 'https://www.xn--o80bk8isxeinax68f.com/tools/holiday-pay';
    if (typeof navigator !== 'undefined' && 'share' in navigator) {
      try {
        await navigator.share({
          title: '공휴일 수당 계산 결과',
          text,
          url,
        });
        return;
      } catch {
        // user cancelled or unsupported
      }
    }
    // fallback: copy
    handleCopy();
  };

  const handleKakaoShare = () => {
    if (!result) return;
    const url = 'https://www.xn--o80bk8isxeinax68f.com/tools/holiday-pay';
    const sizeLabel = siteSize === 'large' ? '5인 이상' : '5인 미만';
    const holidayLabel = holidayKind === 'labor_day' ? '노동절(5/1)' : '관공서 공휴일';
    const typeLabel = workerType === 'monthly' ? '월급제' : workerType === 'daily' ? '일용직' : '시급제';
    const desc =
      `[${sizeLabel} | ${holidayLabel} | ${typeLabel}]\n` +
      `통상시급 ${formatNumber(result.base_hourly)}원 × ${workedHours}시간\n` +
      `→ 추가 지급액 ${formatNumber(result.total)}원`;
    if (window.Kakao && window.Kakao.Share && window.Kakao.isInitialized()) {
      try {
        window.Kakao.Share.sendDefault({
          objectType: 'feed',
          content: {
            title: '공휴일 수당 계산 결과',
            description: desc,
            imageUrl: 'https://www.xn--o80bk8isxeinax68f.com/opengraph-image',
            link: { mobileWebUrl: url, webUrl: url },
          },
          buttons: [
            {
              title: '계산기 열기',
              link: { mobileWebUrl: url, webUrl: url },
            },
          ],
        });
        return;
      } catch (e) {
        console.error('Kakao share failed', e);
      }
    }
    // SDK 미로드/미설정 → 네이티브 share 또는 복사로 fallback
    handleNativeShare();
  };

  const handleDownloadImage = async () => {
    if (!result) return;
    // Web Canvas 직접 그리기 (외부 라이브러리 없이) — 결과 카드를 텍스트 기반 이미지로
    try {
      const canvas = document.createElement('canvas');
      const W = 720;
      const padding = 32;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // 측정용 임시 height
      canvas.width = W;
      canvas.height = 200; // 측정 후 다시 설정

      const sizeLabel = siteSize === 'large' ? '5인 이상' : '5인 미만';
      const holidayLabel = holidayKind === 'labor_day' ? '노동절(5/1)' : '관공서 공휴일';
      const typeLabel = workerType === 'monthly' ? '월급제' : workerType === 'daily' ? '일용직' : '시급제';

      const lines: { text: string; size: number; bold?: boolean; color?: string }[] = [];
      lines.push({ text: '공휴일 수당 계산 결과', size: 28, bold: true, color: '#0f172a' });
      lines.push({ text: `${sizeLabel} | ${holidayLabel} | ${typeLabel}`, size: 16, color: '#64748b' });
      lines.push({ text: '', size: 8 });
      lines.push({ text: `통상시급  ${formatNumber(result.base_hourly)}원`, size: 18, color: '#475569' });
      lines.push({ text: `휴일 근로  ${workedHours}시간` + (parseFloat(nightHours) > 0 ? `  (야간 ${nightHours}h)` : ''), size: 18, color: '#475569' });
      lines.push({ text: '', size: 16 });
      lines.push({ text: '💰 추가 지급액', size: 16, color: '#92400e' });
      lines.push({ text: `${formatNumber(result.total)}원`, size: 40, bold: true, color: '#0f172a' });
      lines.push({ text: '', size: 16 });
      for (const b of result.breakdown) {
        lines.push({ text: `▸ ${b.label}`, size: 14, color: '#334155' });
        lines.push({ text: `   ${formatNumber(b.amount)}원`, size: 16, bold: true, color: '#0f172a' });
      }
      lines.push({ text: '', size: 16 });
      lines.push({ text: '노란봉투법.com/tools/holiday-pay', size: 14, color: '#94a3b8' });

      // 높이 계산
      let totalH = padding * 2;
      for (const l of lines) totalH += l.size + 8;

      canvas.width = W;
      canvas.height = totalH;

      // 배경
      const grad = ctx.createLinearGradient(0, 0, W, totalH);
      grad.addColorStop(0, '#fffbeb');
      grad.addColorStop(1, '#fef3c7');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, totalH);

      // 카드 frame
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      const cardX = 16, cardY = 16, cardW = W - 32, cardH = totalH - 32;
      const r = 16;
      ctx.beginPath();
      ctx.moveTo(cardX + r, cardY);
      ctx.lineTo(cardX + cardW - r, cardY);
      ctx.quadraticCurveTo(cardX + cardW, cardY, cardX + cardW, cardY + r);
      ctx.lineTo(cardX + cardW, cardY + cardH - r);
      ctx.quadraticCurveTo(cardX + cardW, cardY + cardH, cardX + cardW - r, cardY + cardH);
      ctx.lineTo(cardX + r, cardY + cardH);
      ctx.quadraticCurveTo(cardX, cardY + cardH, cardX, cardY + cardH - r);
      ctx.lineTo(cardX, cardY + r);
      ctx.quadraticCurveTo(cardX, cardY, cardX + r, cardY);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      // 텍스트
      let y = padding + 24;
      for (const l of lines) {
        ctx.font = `${l.bold ? '700' : '500'} ${l.size}px -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Pretendard", "Noto Sans KR", sans-serif`;
        ctx.fillStyle = l.color || '#0f172a';
        ctx.fillText(l.text, padding + 16, y);
        y += l.size + 8;
      }

      // 다운로드
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `holiday-pay-${Date.now()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error('image download failed', e);
      alert('이미지 생성 실패. 화면을 캡처해주세요.');
    }
  };

  // ──────── Kakao SDK 동적 로드 ────────
  useEffect(() => {
    if (!KAKAO_JS_KEY) return;
    if (typeof window === 'undefined') return;
    if (window.Kakao && window.Kakao.isInitialized && window.Kakao.isInitialized()) return;
    const existing = document.querySelector<HTMLScriptElement>('script[data-kakao-sdk="1"]');
    const initIfReady = () => {
      if (window.Kakao && !window.Kakao.isInitialized()) {
        try {
          window.Kakao.init(KAKAO_JS_KEY);
        } catch {
          /* ignore */
        }
      }
    };
    if (existing) {
      initIfReady();
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.share.min.js';
    s.async = true;
    s.dataset.kakaoSdk = '1';
    s.onload = initIfReady;
    document.head.appendChild(s);
  }, []);

  // ──────── render ────────

  // ── Step 1: 사업장 규모
  if (step === 'site') {
    return (
      <div>
        <StepHeader current={1} />
        <h2 className="mb-1 text-xl font-bold">1단계 — 사업장 규모를 선택하세요</h2>
        <p className="mb-6 text-sm" style={{ color: '#64748b' }}>
          상시 근로자 수에 따라 가산수당 적용 여부가 달라집니다.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {([
            { key: 'large', title: '5인 이상', desc: '근로기준법 전면 적용 — 휴일근로 가산수당 1.5배/2배 + 야간 0.5배 의무', recommended: true },
            { key: 'small', title: '5인 미만', desc: '제56조 가산수당 의무 없음 — 약정 있을 때만 적용', recommended: false },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                setSiteSize(opt.key);
                setStep('holiday');
              }}
              className={`rounded-xl border-2 p-5 text-left transition-all hover:shadow-lg ${
                siteSize === opt.key ? 'border-yellow-400 bg-yellow-50' : 'border-slate-200 hover:border-yellow-300'
              }`}
            >
              <div className="mb-2 text-lg font-bold">{opt.title}</div>
              <div className="text-sm leading-relaxed" style={{ color: '#475569' }}>
                {opt.desc}
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  // ── Step 2: 휴일 종류
  if (step === 'holiday') {
    return (
      <div>
        <StepHeader current={2} />
        <h2 className="mb-1 text-xl font-bold">2단계 — 어떤 휴일인가요?</h2>
        <p className="mb-6 text-sm" style={{ color: '#64748b' }}>
          노동절은 모든 사업장에 적용되고, 관공서 공휴일(빨간날)은 5인 이상 사업장만 유급휴일로 적용됩니다.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {([
            { key: 'labor_day', title: '노동절 (5/1)', desc: '「노동절 제정에 관한 법률」 — 5인 미만 포함 모든 사업장 유급휴일' },
            { key: 'public_holiday', title: '관공서 공휴일', desc: '근로기준법 제55조·시행령 제30조 — 5인 이상 사업장만 유급휴일' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                setHolidayKind(opt.key);
                setStep('worker');
              }}
              className={`rounded-xl border-2 p-5 text-left transition-all hover:shadow-lg ${
                holidayKind === opt.key ? 'border-yellow-400 bg-yellow-50' : 'border-slate-200 hover:border-yellow-300'
              }`}
            >
              <div className="mb-2 text-lg font-bold">{opt.title}</div>
              <div className="text-sm leading-relaxed" style={{ color: '#475569' }}>
                {opt.desc}
              </div>
            </button>
          ))}
        </div>
        <button onClick={() => goToStep('site')} className="mt-6 text-sm text-slate-500 hover:text-slate-700">
          ← 이전
        </button>
      </div>
    );
  }

  // ── Step 3: 근로 유형
  if (step === 'worker') {
    return (
      <div>
        <StepHeader current={3} />
        <h2 className="mb-1 text-xl font-bold">3단계 — 근로 유형을 선택하세요</h2>
        <p className="mb-6 text-sm" style={{ color: '#64748b' }}>
          유형에 따라 통상임금 산정 방식이 다릅니다.
        </p>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {([
            { key: 'monthly', title: '월급제 (상용)', desc: '월 고정 임금. 통상시급 = 월 통상임금 ÷ 209h' },
            { key: 'daily', title: '일용직', desc: '일급 단위. 통상시급 = 일급 ÷ 1일 근로시간' },
            { key: 'hourly', title: '시급제 (파트)', desc: '시급 단위. 주휴수당 포함 여부에 따라 분리 계산' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              onClick={() => {
                setWorkerType(opt.key);
                setStep('input');
              }}
              className={`rounded-xl border-2 p-5 text-left transition-all hover:shadow-lg ${
                workerType === opt.key ? 'border-yellow-400 bg-yellow-50' : 'border-slate-200 hover:border-yellow-300'
              }`}
            >
              <div className="mb-2 text-lg font-bold">{opt.title}</div>
              <div className="text-sm leading-relaxed" style={{ color: '#475569' }}>
                {opt.desc}
              </div>
            </button>
          ))}
        </div>
        <button onClick={() => goToStep('holiday')} className="mt-6 text-sm text-slate-500 hover:text-slate-700">
          ← 이전
        </button>
      </div>
    );
  }

  // ── Step 4: 입력
  if (step === 'input') {
    return (
      <div>
        <StepHeader current={4} />
        <h2 className="mb-1 text-xl font-bold">4단계 — 근로 정보를 입력하세요</h2>
        <p className="mb-6 text-sm" style={{ color: '#64748b' }}>
          정확한 통상시급 산정을 위해 모든 항목을 입력해주세요.
        </p>

        <div className="space-y-5 rounded-xl border-2 border-slate-200 p-5">
          {workerType === 'monthly' && (
            <>
              <Field label="월 통상임금 항목 합계" hint="기본급 + 정기·일률·고정 지급되는 수당 (식대·직책수당 등)">
                <NumInput value={monthlyPay} onChange={setMonthlyPay} placeholder="예: 2,500,000" suffix="원" />
              </Field>
              <Field label="월 소정근로시간" hint="주 40시간 + 주휴 8시간 = 월 209시간 (기본값)">
                <NumInput value={monthlyHours} onChange={setMonthlyHours} placeholder="209" suffix="시간" />
              </Field>
              <label className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={inclusivePay}
                  onChange={(e) => setInclusivePay(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="font-semibold">포괄임금 약정</span>이 있습니다 (연장·휴일·야간 가산이 월급에 포함된다는 약정)
                  <br />
                  <span className="text-slate-700">
                    체크하면 결과 화면에 별도 안내가 표시됩니다. 단, 근로시간 산정이 어려운 업종이 아닌 경우
                    포괄임금 약정 자체가 무효일 수 있습니다 (대법원 2010다91046 등).
                  </span>
                </span>
              </label>
            </>
          )}

          {workerType === 'daily' && (
            <>
              <Field label="일급" hint="1일 임금 총액">
                <NumInput value={dailyWage} onChange={setDailyWage} placeholder="예: 120,000" suffix="원" />
              </Field>
              <Field label="1일 소정근로시간" hint="일반적으로 8시간">
                <NumInput value={dailyHours} onChange={setDailyHours} placeholder="8" suffix="시간" />
              </Field>
              <label className="flex items-start gap-3 rounded-lg bg-slate-50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={paidContinuously}
                  onChange={(e) => setPaidContinuously(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="font-semibold">동일 사업장에 지속적으로 근로</span> (반복 호출됨)
                  <br />
                  <span className="text-slate-600">
                    체크 안 하면 단발성 일용직 — 통상임금 산정 대상이 아닙니다 (행정해석 근기 68207-2508).
                  </span>
                </span>
              </label>
            </>
          )}

          {workerType === 'hourly' && (
            <>
              <Field label="시급" hint="근로계약서·임금명세서에 표시된 시급">
                <NumInput value={hourlyWage} onChange={setHourlyWage} placeholder="예: 13,000" suffix="원" />
              </Field>
              <Field label="주 소정근로시간" hint="주휴수당 발생 여부 판단 (15시간 이상 발생)">
                <NumInput value={weeklyHours} onChange={setWeeklyHours} placeholder="40" suffix="시간" />
              </Field>
              <label className="flex items-start gap-3 rounded-lg bg-amber-50 p-3 text-sm">
                <input
                  type="checkbox"
                  checked={hourlyIncludesWeekly}
                  onChange={(e) => setHourlyIncludesWeekly(e.target.checked)}
                  className="mt-0.5 h-4 w-4"
                />
                <span>
                  <span className="font-semibold">시급에 주휴수당이 포함</span>되어 있습니다 (시급 × 1.2 형태)
                  <br />
                  <span className="text-slate-700">
                    체크하면 통상시급 = 시급 ÷ 1.2 (주휴분 제외한 기본시급)으로 가산수당을 계산합니다.
                  </span>
                </span>
              </label>
            </>
          )}

          <div className="border-t border-slate-200 pt-5">
            <Field label="공휴일 근로시간" hint="실제 근무한 시간">
              <NumInput value={workedHours} onChange={setWorkedHours} placeholder="8" suffix="시간" />
            </Field>
            <div className="mt-3" />
            <Field label="야간근로시간 (22:00~06:00)" hint="가산 0.5배 추가 — 5인 이상만 적용">
              <NumInput value={nightHours} onChange={setNightHours} placeholder="0" suffix="시간" />
            </Field>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <button onClick={() => goToStep('worker')} className="text-sm text-slate-500 hover:text-slate-700">
            ← 이전
          </button>
          <button
            onClick={calculate}
            className="flex items-center gap-2 rounded-lg bg-yellow-400 px-6 py-3 font-bold text-slate-900 hover:bg-yellow-500"
          >
            <Calculator className="h-4 w-4" />
            계산하기
          </button>
        </div>
      </div>
    );
  }

  // ── Step 5: 결과
  if (step === 'result' && result) {
    return (
      <div>
        <StepHeader current={5} />
        <div className="rounded-2xl border-2 border-yellow-400 bg-gradient-to-br from-amber-50 to-yellow-100 p-6">
          <div className="mb-4 flex items-center gap-2 text-sm font-semibold" style={{ color: '#92400e' }}>
            <Calculator className="h-4 w-4" />
            계산 결과
          </div>
          <div className="mb-2 text-sm" style={{ color: '#64748b' }}>
            추가 지급액 {result.already_in_monthly_pay && <span className="text-xs">(가산수당만 — 월급 외)</span>}
          </div>
          <div className="mb-2 text-4xl font-bold" style={{ color: '#0f172a' }}>
            {formatNumber(result.total)}
            <span className="ml-1 text-2xl">원</span>
          </div>

          {/* 환산 총액 안내 */}
          <div className="mb-6 rounded-lg bg-white/60 p-3 text-xs" style={{ color: '#475569' }}>
            <div className="mb-1 font-semibold text-slate-700">노동절 8시간 임금 환산 (참고)</div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <span>
                휴일근로 임금(1.0배):{' '}
                <strong style={{ color: '#0f172a' }}>{formatNumber(result.regular_pay_equivalent)}원</strong>
                {result.already_in_monthly_pay && <span className="text-slate-500"> (월급에 포함)</span>}
                {!result.already_in_monthly_pay && workerType === 'hourly' && hourlyIncludesWeekly && (
                  <span className="text-slate-500"> (통상시급 기준 — 주휴분 별도)</span>
                )}
              </span>
              <span>+</span>
              <span>
                가산수당:{' '}
                <strong style={{ color: '#0f172a' }}>
                  {formatNumber(result.gross_holiday_pay - result.regular_pay_equivalent)}원
                </strong>
              </span>
              <span>=</span>
              <span>
                환산 총액:{' '}
                <strong style={{ color: '#0f172a' }}>{formatNumber(result.gross_holiday_pay)}원</strong>
              </span>
            </div>
          </div>

          <div className="mb-4 rounded-lg bg-white/70 p-4 text-sm">
            <div className="mb-2 font-semibold" style={{ color: '#334155' }}>
              통상시급 {formatNumber(result.base_hourly)}원
            </div>
            <div className="space-y-2">
              {result.breakdown.map((b, i) => (
                <div key={i} className="flex items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="text-sm font-medium" style={{ color: '#334155' }}>
                      {b.label}
                    </div>
                    <div className="mt-0.5 text-xs" style={{ color: '#64748b' }}>
                      {b.formula}
                    </div>
                  </div>
                  <div className="font-bold" style={{ color: b.amount === 0 ? '#94a3b8' : '#0f172a' }}>
                    {formatNumber(b.amount)}원
                  </div>
                </div>
              ))}
            </div>
          </div>

          {result.warning && (
            <div className="mb-3 flex items-start gap-2 rounded-lg bg-amber-100 p-3 text-sm" style={{ color: '#78350f' }}>
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <div>{result.warning}</div>
            </div>
          )}

          {result.notes.length > 0 && (
            <div className="mb-3 rounded-lg bg-white/50 p-3 text-xs" style={{ color: '#475569' }}>
              <div className="mb-1 flex items-center gap-1 font-semibold">
                <Info className="h-3 w-3" />
                설명
              </div>
              <ul className="space-y-1">
                {result.notes.map((n, i) => (
                  <li key={i}>• {n}</li>
                ))}
              </ul>
            </div>
          )}

          <details className="mt-3 text-xs" style={{ color: '#64748b' }}>
            <summary className="cursor-pointer font-semibold hover:text-slate-900">법적 근거</summary>
            <ul className="mt-2 space-y-1 pl-4">
              {result.legal_basis.map((l, i) => (
                <li key={i}>• {l}</li>
              ))}
            </ul>
          </details>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <button
            onClick={handleKakaoShare}
            className="flex items-center justify-center gap-2 rounded-lg bg-yellow-300 px-4 py-3 font-semibold text-slate-900 hover:bg-yellow-400"
            title="카카오톡 공유 (Kakao SDK)"
          >
            <MessageCircle className="h-4 w-4" />
            카톡 공유
          </button>
          <button
            onClick={handleNativeShare}
            className="flex items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 py-3 font-semibold text-white hover:bg-slate-800"
            title="시스템 공유 시트 (모바일)"
          >
            <Share2 className="h-4 w-4" />
            메신저 공유
          </button>
          <button
            onClick={handleDownloadImage}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            이미지 저장
          </button>
          <button
            onClick={handleCopy}
            className="flex items-center justify-center gap-2 rounded-lg border border-slate-300 bg-white px-4 py-3 font-semibold text-slate-900 hover:bg-slate-50"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? '복사됨' : '결과 복사'}
          </button>
        </div>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button onClick={() => goToStep('site')} className="text-slate-500 hover:text-slate-700">
            처음부터 다시
          </button>
          <button onClick={() => goToStep('input')} className="text-slate-500 hover:text-slate-700">
            ← 입력값 수정
          </button>
        </div>
      </div>
    );
  }

  return null;
}
