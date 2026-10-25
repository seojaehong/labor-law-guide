// 판독문 원문 대조 — 스캔 쪽 판독 중 조문이 아닌 것(표·문서 머리 줄·부칙·별표)을 쪽 번호와 두 판독으로 펼친다.
// 「읽었다」와 「담당자가 원문과 맞춰 볼 수 있다」 사이를 메운다. 맞게 읽었는지는 알려 주지 않는다 — 두 판독이 다른 숫자만 표시한다.
// 표는 판독기가 「 | 」로 나눈 칸 그대로 그린다. 칸을 짐작해 만들지 않는다.
import type { ReactNode } from 'react';
import { anchorSpans, type PageCheck } from '@/lib/rules-review/ocr-crosscheck';
import { isTableRow, nonArticleSegments, type Segment, type SegmentLine } from '@/lib/rules-review/readings';

/** 두 번째 판독에 없던 표지를 <mark> 로 — 같은 표지가 여러 번이면 빠진 수만큼 앞에서부터 */
function marked(text: string, left: string[]): ReactNode {
  const spans = anchorSpans(text).filter((s) => { const k = left.indexOf(s.a); if (k < 0) return false; left.splice(k, 1); return true; });
  if (!spans.length) return text;
  const out: ReactNode[] = [];
  let at = 0;
  spans.forEach((s, i) => {
    if (s.start > at) out.push(text.slice(at, s.start));
    out.push(<mark key={i}>{text.slice(s.start, s.end)}</mark>);
    at = s.end;
  });
  if (at < text.length) out.push(text.slice(at));
  return out;
}

function Lines({ lines }: { lines: SegmentLine[] }) {
  const blocks: SegmentLine[][] = [];
  for (const l of lines) {
    const last = blocks[blocks.length - 1];
    if (last && isTableRow(last[0].text) === isTableRow(l.text)) last.push(l); else blocks.push([l]);
  }
  return <>{blocks.map((b) => isTableRow(b[0].text)
    ? (
      <div key={b[0].no} className="rr-table-wrap">
        <table className="rr-table rr-rd-grid">
          <tbody>{b.map((l) => { const left = [...l.missing]; return <tr key={l.no}>{l.text.split(' | ').map((c, k) => <td key={k}>{marked(c.trim(), left)}</td>)}</tr>; })}</tbody>
        </table>
      </div>
    )
    : <pre key={b[0].no} className="rr-rd-pre">{b.map((l, k) => <span key={l.no}>{k > 0 && '\n'}{marked(l.text, [...l.missing])}</span>)}</pre>)}</>;
}

/** 쪽 하나의 대조 상태 — 대조하지 않은 쪽은 「사람 확인 필요」로만 말한다 */
function status(check: PageCheck, segs: Segment[]): { warn: boolean; text: string } {
  if (check.state === 'not_checked') {
    const why = check.reason === 'low_coverage' ? '두 번째 판독이 숫자를 대부분 놓친 쪽입니다(빽빽한 표 등)' : '두 번째 판독이 끝나지 않은 쪽입니다';
    return { warn: true, text: `대조 못 함 — 사람 확인 필요. ${why}. 아래 판독을 원문과 직접 대조하세요.` };
  }
  const lines = segs.flatMap((s) => s.lines);
  const diff = lines.filter((l) => l.missing.length).length;
  if (diff) return { warn: true, text: `숫자·조 번호가 두 판독에서 다른 줄 ${diff}곳 — 표시한 곳부터 원문과 대조하세요. 다른 글자도 원문과 대조가 필요합니다.` };
  if (lines.some((l) => l.anchored)) return { warn: false, text: '숫자·날짜·조 번호는 두 판독에 모두 나옵니다. 글자는 원문과 대조하세요.' };
  return { warn: true, text: '숫자·날짜·조 번호가 없어 두 판독을 맞춰 보지 못했습니다 — 사람 확인 필요.' };
}

export default function ReadingsPanel({ path, xcheck }: { path: string; xcheck: PageCheck[] }) {
  if (!xcheck.length) return null;
  if (xcheck.every((c) => !c.a)) {
    return <p className="rr-mute small">이 작업에는 판독문이 저장되지 않았습니다 — 같은 파일을 「규정 묶음 다시 올리기」로 올려 스캔 쪽을 다시 읽으면 표·머리 줄 판독을 원문과 대조할 수 있습니다.</p>;
  }
  const segs = nonArticleSegments(xcheck);
  if (!segs.length) return null;
  const pages = [...new Set(segs.map((s) => s.page))];
  const open = segs.some((s) => s.check.state === 'not_checked');
  return (
    <details className="rr-rd" open={open}>
      <summary>판독문 원문 대조 — 조문이 아닌 판독(표·머리 줄·부칙·별표) {pages.length}쪽</summary>
      <p className="rr-mute small">조문 본문이 아니어서 다른 탭에 보이지 않는 판독입니다. 쪽마다 첫 번째 판독(서버)과 두 번째 판독(이 브라우저)을 나란히 둡니다. 두 번째 판독은 쪽 전체를 그 판독기가 낸 줄바꿈 그대로 보입니다.
        <mark>표시한 숫자</mark>는 두 번째 판독에서 찾지 못한 것입니다.</p>
      {pages.map((no) => {
        const mine = segs.filter((s) => s.page === no);
        const check = mine[0].check;
        const st = status(check, mine);
        return (
          <section key={no} className="rr-rd-page" aria-label={`${no}쪽 판독`}>
            <p><b>{no}쪽</b> · {[...new Set(mine.map((s) => s.kind))].join('·')}</p>
            <p className={`rr-rd-status${st.warn ? ' warn' : ''}`} role="note">{st.text}</p>
            <div className="rr-rd-cols">
              <div>
                <p className="rr-rd-label">첫 번째 판독(서버)</p>
                {mine.map((s) => <div key={`${s.kind}-${s.lines[0].no}`} className="rr-rd-seg"><span className="rr-mute small">{s.kind} · {s.lines[0].no}~{s.lines[s.lines.length - 1].no}번째 줄</span><Lines lines={s.lines} /></div>)}
              </div>
              <div>
                <p className="rr-rd-label">두 번째 판독(이 브라우저)</p>
                {check.b?.trim() ? <pre className="rr-rd-pre">{check.b.trim()}</pre> : <p className="rr-mute small">두 번째 판독 글자가 없습니다.</p>}
              </div>
            </div>
            <p className="rr-mute small">원본 쪽 그림은 저장하지 않습니다 — 원본 pdf {no}쪽을 열어 나란히 대조하세요({path.split('/').pop()}).</p>
          </section>
        );
      })}
    </details>
  );
}
