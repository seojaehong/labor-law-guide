import { describe, expect, it } from 'vitest';
import { bannedHits } from '@/lib/tool-kit/banned';
import { councilView, NODE_TYPES, parseCouncilFiles, visibleIds } from '@/lib/nosa-council/graph-view';
import { sampleCouncilFiles } from '@/lib/nosa-council/graph-sample';
import { minutesRecord } from '@/lib/nosa-council/meeting-docs';
import { IMPORTED } from '@/lib/nosa-council/records';

// 회의록 그래프 화면 — 기록 폴더 파일을 브라우저 안에서 읽어 그린다(서버로 보내지 않는다). 값은 가상.
const WORDS = ['노무사', '상담', '자문', '진단', '판정', '적법', '확률', '체불', '위법', '승소', '대행', '대리'];
const TODAY = '2026-11-10';

describe('기록 폴더 읽기 — 로컬 도구와 같은 규칙', () => {
  it('회의록 .json · 이행 · 회의록 이력 · 고충을 가르고, 다른 파일·깨진 줄·같은 회의 키는 건너뛴다', () => {
    const files = sampleCouncilFiles();
    const dup = files.find((f) => f.name === '2026-정기-1차.json')!;
    const f = parseCouncilFiles([...files, { name: 'x/2026-정기-1차_사본.json', text: dup.text }, { name: '메모.json', text: '{"a":1}' }, { name: '깨짐.json', text: '{' }, { name: '_이행기록.jsonl', text: `${files.find((x) => x.name === '_이행기록.jsonl')!.text}\n{깨짐` }]);
    expect(f.minutes.map((m) => m.meeting.key)).toEqual(['2026-정기-1차', '2026-정기-2차', '2026-정기-3차']);
    expect(f.records).toHaveLength(2);
    expect(f.grievances).toHaveLength(4);
    expect(f.skipped.map((s) => s.file)).toEqual(expect.arrayContaining(['2026-정기-1차_사본.json', '깨짐.json', '_이행기록.jsonl']));
    expect(f.skipped.find((s) => s.file === '2026-정기-1차_사본.json')!.reason).toMatch(/같은 회의 키/);
  });
});

describe('보기 자료 — 선은 구조화 값에서만, 크기는 연결 수', () => {
  const v = councilView(parseCouncilFiles(sampleCouncilFiles()), TODAY);
  it('여덟 종류가 다 있고, 이월·부의 선이 있다', () => {
    for (const t of NODE_TYPES) expect(v.counts[t], t).toBeGreaterThan(0);
    expect(v.edges.filter((e) => e.type === '이월')).toHaveLength(2);
    expect(v.edges).toContainEqual({ type: '부의', from: 'G-2026-001', to: 'A-20260305-02' });
    const a = v.nodes.find((n) => n.id === 'A-20260305-02')!;
    expect(a.label).toBe('A-20260305-02 야간 작업 순환');
    expect(a.size).toBeGreaterThan(v.nodes.find((n) => n.id === 'A-20260903-02')!.size);
  });
  it('기한 경과 — 이행(교육 일정 공지 10-15)과 고충(G-2026-002 통보 없음)은 late, 근거 있는 완료는 종료', () => {
    expect(v.nodes.find((n) => n.id === 'A-20260903-02 이행')).toMatchObject({ late: true, status: '미착수' });
    expect(v.nodes.find((n) => n.id === 'A-20260604-02 이행')).toMatchObject({ late: true, status: '진행' });
    expect(v.nodes.find((n) => n.id === 'A-20260305-01 이행')).toMatchObject({ late: false, status: '종료' });
    expect(v.nodes.find((n) => n.id === 'G-2026-002')).toMatchObject({ late: true, status: '청취' });
    expect(v.nodes.find((n) => n.id === 'G-2026-001')).toMatchObject({ late: false, status: '통보' });
  });
  it('아무 안건도 잇지 않은 법조문·결과 노드는 그리지 않는다(다루지 않은 협의사항은 보관함 대시보드에)', () => {
    expect(v.nodes.filter((n) => (n.type === '법조문' || n.type === '결과') && n.degree === 0)).toEqual([]);
    expect(v.nodes.find((n) => n.id === 'G-2026-002')).toMatchObject({ degree: 0 }); // 부의하지 않은 고충은 선이 없어도 남는다
    expect(v.nodes.some((n) => n.id === '근참법 제20조제1항제7호')).toBe(true);
    expect(v.nodes.some((n) => n.id === '근참법 제20조제1항제1호')).toBe(false);
  });
  it('가져와서 확인 전인 회의록은 잇지 않는다', () => {
    const files = sampleCouncilFiles();
    const m4 = minutesRecord({ workplace: { name: '가상제조' }, meeting: { kind: '정기', number: 4, date: '2026-12-03' }, seats: { worker: 5, employer: 5 }, agenda: [{ id: 'A-20260305-02', title: '야간 작업 순환', type: '협의', article: '20-7', carriedOver: true }], writtenDate: '2026-12-04' });
    const imp = { ...m4, import: { status: IMPORTED, source: { path: 'C:/옛/4차.hwp', sha256: 'ab'.repeat(32) } } };
    const w = councilView(parseCouncilFiles([...files, { name: '2026-정기-4차.json', text: JSON.stringify(imp) }]), TODAY);
    expect(w.unconfirmed).toEqual(['2026-정기-4차']);
    expect(w.nodes.some((n) => n.id === '2026-정기-4차')).toBe(false);
    expect(w.edges.filter((e) => e.type === '이월')).toHaveLength(2);
  });
  it('글자에 금지어가 없다', () => {
    expect(bannedHits(v.nodes.map((n) => `${n.label} ${n.status ?? ''}`).join('\n'), WORDS)).toEqual([]);
  });
});

describe('필터 — 종류 · 기간 · 미이행만', () => {
  const v = councilView(parseCouncilFiles(sampleCouncilFiles()), TODAY);
  it('종류를 끄면 빠진다', () => {
    const ids = visibleIds(v, { types: ['회의', '안건'] });
    expect([...ids].every((id) => ['회의', '안건'].includes(v.nodes.find((n) => n.id === id)!.type))).toBe(true);
  });
  it('기간 — 그 기간 회의와 그 회의에서 다룬 안건·이행만', () => {
    const ids = visibleIds(v, { types: NODE_TYPES, from: '2026-06-01', to: '2026-06-30' });
    expect(ids.has('2026-정기-2차')).toBe(true);
    expect(ids.has('2026-정기-1차')).toBe(false);
    expect(ids.has('A-20260604-02')).toBe(true);
    expect(ids.has('A-20260305-02')).toBe(true); // 2차에서도 다룸(이월)
    expect(ids.has('A-20260305-01')).toBe(false);
    expect(ids.has('A-20260604-02 이행')).toBe(true);
    // 기간 밖 안건에만 이어진 법조문·결과·위원은 홀로 남지 않는다
    const hang = v.nodes.filter((n) => ['법조문', '결과', '위원'].includes(n.type) && ids.has(n.id) && !v.edges.some((e) => (e.from === n.id && ids.has(e.to)) || (e.to === n.id && ids.has(e.from))));
    expect(hang.map((n) => n.id)).toEqual([]);
    expect(ids.has('근참법 제20조제1항제7호')).toBe(true);
  });
  it('미이행만 — 기한 경과 노드와 바로 이웃만', () => {
    const ids = visibleIds(v, { types: NODE_TYPES, onlyOpen: true });
    expect(ids.has('A-20260903-02 이행')).toBe(true);
    expect(ids.has('A-20260903-02')).toBe(true);
    expect(ids.has('G-2026-002')).toBe(true);
    expect(ids.has('A-20260305-01 이행')).toBe(false);
    expect(ids.has('2026-정기-1차')).toBe(false);
  });
});
