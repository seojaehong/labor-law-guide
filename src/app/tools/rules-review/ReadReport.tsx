'use client';
// 읽은 결과 — 무엇을 읽었고 무엇을 읽지 않았는지 먼저 보여 준다. 빠진 규정이 있으면 확인 전에 알아야 한다.
import type { ReactNode } from 'react';
import { CircleAlert, FileCheck2 } from 'lucide-react';
import type { Workspace } from '@/lib/rules-review/workspace';

const base = (p: string) => p.split('/').pop()!;

export default function ReadReport({ ws, onStart, busy, onOcr, check }: { ws: Workspace; onStart: () => void; busy: string | null; onOcr: (() => void) | null; check?: ReactNode }) {
  const { report } = ws;
  const counts = (name: string) => ws.findings.filter((f) => f.reg === name).length;
  const notRead = report.skipped.length + report.failed.length + report.notRegulation.length;
  const pdfs = report.pdf ?? [];
  const unread = pdfs.reduce((n, p) => n + p.scanned.length - p.read.length, 0);
  const ocrRead = pdfs.reduce((n, p) => n + p.read.length, 0);
  return (
    <section aria-labelledby="rr-read">
      <div className="rr-head-row">
        <h2 id="rr-read" className="rr-h2"><FileCheck2 size={20} aria-hidden /> 규정 {ws.regs.length}개를 읽었습니다</h2>
        <button className="rr-btn" onClick={onStart}>확인 시작 — 항목 {ws.findings.length}건</button>
      </div>
      <p className="rr-mute">아래 목록에 빠진 규정이 있으면 그 파일을 더해 「규정 묶음 다시 올리기」로 함께 올리세요. 규정끼리 맞춰 보는 것이라 빠진 규정이 있으면 그 규정을 부르는 곳이 「묶음에 없는 규정」으로 걸립니다.</p>

      <div className="rr-table-wrap">
        <table className="rr-table">
          <thead><tr><th>규정</th><th>조문</th><th>별표·서식</th><th>최근 개정</th><th>소관 부서</th><th>걸린 곳</th><th>읽은 파일</th></tr></thead>
          <tbody>
            {ws.regs.map((r) => (
              <tr key={r.key}>
                <td><b>{r.name}</b></td>
                <td>{r.articles.length}</td>
                <td>{r.annexes.length || '-'}</td>
                <td>{r.meta.amended ?? '-'}</td>
                <td>{ws.depts[r.name] ?? '-'}</td>
                <td>{counts(r.name)}</td>
                <td className="rr-file">{r.fileName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pdfs.length > 0 && (
        <div className={`rr-details rr-pdf${unread ? ' warn' : ''}`} role="region" aria-label="pdf 로 읽은 규정">
          <p><b>pdf 로 읽은 규정 {pdfs.length}개</b> — 글자층에서 글자를 뽑아 읽었습니다. 줄이 바뀐 자리의 띄어쓰기가 원문과 다를 수 있고, 반영본(한글 파일)은 만들지 않습니다(신·구조문대비표는 만듭니다).
            {ocrRead > 0 && ` 스캔 쪽 ${ocrRead}쪽은 그림에서 읽은 글자입니다 — 원문과 한 번 대조하세요.`}</p>
          {unread > 0 && (
            <>
              <p><CircleAlert size={15} aria-hidden /> 글자층이 없는 스캔 쪽 <b>{unread}쪽</b>은 아직 읽지 못했습니다({pdfs.filter((p) => p.scanned.length > p.read.length).map((p) => `${base(p.path)} ${p.scanned.filter((n) => !p.read.includes(n)).join('·')}쪽`).join(', ')}).
                이 쪽들만 그림으로 서버를 거쳐 Anthropic(Claude)으로 보내 글자로 읽을 수 있습니다. 먼저 빠른 모델(하이쿠)로 읽고, 덜 읽힌 쪽만 상위 모델(소넷)로 다시 읽습니다.
                보낸 그림과 읽은 글자는 저장하지 않으며, 나머지 파일은 계속 이 브라우저 안에서만 처리합니다.</p>
              {busy ? <p className="rr-mute" role="status">{busy}</p> : onOcr
                ? <button className="rr-btn small" onClick={onOcr}>동의하고 스캔 {unread}쪽 보내 읽기</button>
                : <p className="rr-mute">새로 고친 뒤라 원본 파일이 없습니다. 「규정 묶음 다시 올리기」로 같은 파일을 올리면 이 단추가 나옵니다.</p>}
              {/* 자동 확인(Cloudflare) — 평소엔 보이지 않고, 사람 확인이 필요할 때만 이 자리에 상자가 뜬다 */}
              {onOcr && check}
            </>
          )}
        </div>
      )}
      {report.duplicates.length > 0 && (
        <details className="rr-details">
          <summary>같은 규정이라 하나만 읽은 파일 {report.duplicates.reduce((n, d) => n + d.others.length, 0)}개</summary>
          <p className="rr-mute">이름이 같은 규정이 여러 파일이면 날짜가 늦은 판, 그다음 hwpx·hwp 순으로 하나만 읽습니다.</p>
          <ul>{report.duplicates.map((d, i) => <li key={`${d.chosen}-${i}`}>읽음 <b>{base(d.chosen)}</b> — 읽지 않음 {d.others.map(base).join(', ')}</li>)}</ul>
        </details>
      )}
      {notRead > 0 && (
        <details className="rr-details" open={report.failed.length > 0}>
          <summary><CircleAlert size={15} aria-hidden /> 읽지 않은 파일 {notRead}개</summary>
          <ul>
            {report.failed.map((s, i) => <li key={`f-${s.path}-${i}`}><b>{base(s.path)}</b> — 읽지 못함: {s.why}</li>)}
            {report.notRegulation.map((p, i) => <li key={`n-${p}-${i}`}><b>{base(p)}</b> — 이름이 규정(○○규정·세칙·정관 등) 같지 않아 대조에서 뺐습니다</li>)}
            {report.skipped.map((s, i) => <li key={`s-${s.path}-${i}`}><b>{base(s.path)}</b> — {s.why}</li>)}
          </ul>
        </details>
      )}
      {report.annexFiles.length > 0 && (
        <details className="rr-details">
          <summary>따로 온 별표·서식 파일 {report.annexFiles.length}개</summary>
          <ul>{report.annexFiles.map((a, i) => <li key={`a-${a.path}-${i}`}><b>{base(a.path)}</b> — {a.owner ? `「${a.owner}」에 붙였습니다` : '붙일 규정을 찾지 못했습니다'}</li>)}</ul>
        </details>
      )}
    </section>
  );
}
