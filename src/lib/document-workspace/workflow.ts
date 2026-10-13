export type Stage = 'consultation' | 'facts' | 'outline' | 'draft';
export type Section = { id: string; title: string; text: string };
export const SECTION_IDS = ['request','facts','grounds','evidence'] as const;
/** One canonical document schema used by generation, transitions and exports. */
export function assertSections(value: unknown, requireText: boolean, allowEmpty = false): asserts value is Section[] {
  if (!Array.isArray(value) || (value.length !== SECTION_IDS.length && !(allowEmpty && value.length === 0))) throw Error('incomplete-sections');
  for (let i=0;i<value.length;i++) {
    const s=value[i];
    if (!s || typeof s !== 'object' || s.id !== SECTION_IDS[i] || typeof s.title !== 'string' || !s.title.trim() || s.title.length>200 ||
      typeof s.text !== 'string' || s.text.length>20000 || (requireText && !s.text.trim())) throw Error('incomplete-sections');
  }
}
export type Workspace = {
  version: 1; revision: number; stage: Stage; caseId: 'synthetic-dismissal-v1';
  consultation: string; facts: string[]; missing: string[]; issues: string[];
  factsConfirmed: boolean; outlineConfirmed: boolean;
  sections: Section[]; evidence: string[];
  reportedHeadcount?: number; approvedLeave?: boolean;
  originalNotices?: string[]; corrections?: string[];
  review?: { status: 'pending' | 'generated' | 'accepted'; factRevision: number; generatedFactRevision?: number; affected: string[] };
  archivedSections?: Section[];
};
export type Action = 'consult' | 'confirm-facts' | 'outline' | 'confirm-outline' | 'draft' | 'revise' | 'correct-headcount' | 'correct-leave' | 'accept-review';
export const PUBLIC_EVIDENCE = [
  { id: 'lsa-23', law: '근로기준법', article: '제23조', topic: '해고 제한' },
  { id: 'lsa-27', law: '근로기준법', article: '제27조', topic: '해고 사유와 시기의 서면 통지' },
  { id: 'lsa-28', law: '근로기준법', article: '제28조', topic: '부당해고 구제신청' },
] as const;
export function initialWorkspace(): Workspace {
  return { version: 1, revision: 0, stage: 'consultation', caseId: 'synthetic-dismissal-v1',
    consultation: '', facts: [], missing: [], issues: [], factsConfirmed: false,
    outlineConfirmed: false, sections: [], evidence: [], reportedHeadcount: 8, approvedLeave: false,
    originalNotices: ['합성 과거 통지 원본: 휴무 승인 여부는 별도 확인 대상'], corrections: [],
    review: { status: 'pending', factRevision: 0, affected: ['request','facts','grounds','evidence'] }, archivedSections: [] };
}
export function validateWorkspace(value: unknown): Workspace {
  if (!value || typeof value !== 'object') throw Error('invalid-workspace');
  const v = value as Workspace;
  if (v.version !== 1 || v.caseId !== 'synthetic-dismissal-v1' || !Number.isSafeInteger(v.revision) || v.revision < 0 ||
    !['consultation', 'facts', 'outline', 'draft'].includes(v.stage) ||
    typeof v.consultation !== 'string' || v.consultation.length > 12000 ||
    typeof v.factsConfirmed !== 'boolean' || typeof v.outlineConfirmed !== 'boolean') throw Error('invalid-workspace');
  for (const list of [v.facts, v.missing, v.issues, v.evidence]) {
    if (!Array.isArray(list) || list.length > 32 || list.some(s => typeof s !== 'string' || s.length > 4000)) throw Error('invalid-workspace');
  }
  for (const list of [v.originalNotices, v.corrections]) {
    if (list !== undefined && (!Array.isArray(list) || list.length > 32 || list.some(s => typeof s !== 'string' || s.length > 4000))) throw Error('invalid-history');
  }
  if (!v.review || !['pending','generated','accepted'].includes(v.review.status) || !Number.isSafeInteger(v.review.factRevision) ||
    !Array.isArray(v.review.affected) || v.review.affected.some(id => !['request','facts','grounds','evidence'].includes(id))) throw Error('invalid-review');
  assertSections(v.sections, v.stage === 'draft', ['facts','consultation'].includes(v.stage));
  if (v.evidence.some(id => !PUBLIC_EVIDENCE.some(e => e.id === id) && !['lsa-26','lsa-36','lsa-43'].includes(id))) throw Error('invalid-evidence');
  return structuredClone(v);
}
export function transition(state: Workspace, action: Action, sectionId?: string, replacement?: string): Workspace {
  const next = validateWorkspace(state);
  switch (action) {
    case 'accept-review':
      assertSections(next.sections,true);
      if (next.stage !== 'draft' || next.review?.status !== 'generated' || next.review.generatedFactRevision !== next.review.factRevision) throw Error('review-required');
      next.review.status = 'accepted'; break;
    case 'correct-headcount': return correctFacts(next, { reportedHeadcount: Number(replacement) });
    case 'correct-leave': return correctFacts(next, { approvedLeave: replacement === 'true' });
    case 'consult':
      if (next.stage !== 'consultation') throw Error('invalid-stage');
      next.stage = 'facts';
      next.consultation = '가상 사건: 합성 근로자 A가 구두 해고를 통보받았습니다. 사업장 규모, 해고일과 통지 방식, 근로자 지위 및 신청기간을 확인한 뒤 주장과 증거를 나눕니다.';
      next.facts = ['합성 사건이며 실제 당사자는 없습니다.', 'A는 1년간 근무한 근로자라는 가정입니다.', '구두 해고 통보를 받았다는 가정입니다.'];
      next.missing = ['상시근로자 수', '해고일 및 통보 내용', '서면 통지 존재', '근로계약·급여·통보 자료', '구제신청 기간 충족 여부'];
      next.issues = ['근로자성 및 적용 사업장', '정당한 해고 사유', '서면 통지와 효력', '구제신청 기간과 청구 범위'];
      next.evidence = PUBLIC_EVIDENCE.map(e => e.id);
      break;
    case 'confirm-facts':
      if (next.stage !== 'facts') throw Error('invalid-stage');
      next.factsConfirmed = true; break;
    case 'outline':
      if (next.stage !== 'facts' || !next.factsConfirmed) throw Error('facts-required');
      next.stage = 'outline';
      if (!next.sections.length) next.sections = [
        { id: 'request', title: '1. 신청 취지', text: '' },
        { id: 'facts', title: '2. 사실관계 및 확인할 자료', text: '' },
        { id: 'grounds', title: '3. 신청 이유', text: '' },
        { id: 'evidence', title: '4. 증거와 보완 사항', text: '' },
      ]; break;
    case 'confirm-outline':
      if (next.stage !== 'outline') throw Error('invalid-stage');
      assertSections(next.sections,true);
      next.outlineConfirmed = true; break;
    case 'draft': {
      if (next.stage !== 'outline' || !next.outlineConfirmed) throw Error('outline-required');
      assertSections(next.sections,true);
      next.stage = 'draft';
      const texts = [
        '가상 사건 부당해고 구제신청 이유서 초안\n신청인: 합성 근로자 A / 피신청인: 가상 사업장 B\n[제출기관·당사자 정보 확인 필요]\n1. 피신청인의 [해고일 확인 필요] 해고가 부당해고임을 인정한다.\n2. 원직 복직 및 해고기간 임금 상당액 지급을 명한다는 취지의 청구를 검토한다. 금전보상 등 청구 방식은 당사자 의사와 요건 확인 후 확정한다.',
        '이 문서는 실제 모델의 답변이 아닌 합성 검증용 초안이다. 신청인이 1년간 근무했고 구두로 해고를 통보받았다고 가정했다. 정확한 입사일·해고일·업무·급여 및 해고 통보 내용은 아직 확인되지 않았다. 구두 통보라는 주장과 서면 통지가 없었다는 사실은 구별해야 하며, 문자·이메일·인사통지서 여부를 확인해야 한다.\n상시근로자 수, 근로자성, 적용 범위와 구제신청 기간을 확인하기 전에는 구제 절차의 적용을 단정하지 않는다.',
        '가. 적용 요건\n공개 법령 후보는 문서 하단에 표시한다. 해당 후보가 이 사건 쟁점에 직접 답하는지는 별도 검토 대상이다. 해당 조문의 현행 본문 및 적용 범위는 제출 전에 공식 자료로 확인해야 한다. 아래는 쟁점별 주장 구조이며 법령 원문 인용이나 결론 확정이 아니다.\n나. 해고 사유\n사용자가 내세우는 해고 사유와 이를 뒷받침하는 자료가 무엇인지 확인한다. 신청인은 해당 사유에 대한 사실 인정 여부와 반박 자료를 구분하여 제시한다. 사유가 없었다는 결론을 현재 정보만으로 단정하지 않는다.\n다. 통지 방식\n서면 통지가 존재하는지, 그 내용에 해고 사유와 시기가 포함되는지 확인한다. 구두 통보만 있었다는 전제가 확인되면 서면 통지 요건을 중심으로 주장 구조를 보완한다.\n라. 신청기간\n해고일과 접수 예정일을 특정한 뒤 신청기간 충족 여부를 검토한다. 이 초안은 날짜가 확인되지 않아 기간 준수를 판단하지 않는다.',
        '증 제1호: 근로계약서 [존재·내용 확인 필요]\n증 제2호: 급여 지급 자료 [확인 필요]\n증 제3호: 해고 통보 관련 메시지·서면 [확인 필요]\n추가 확인: 상시근로자 수 자료, 해고 경위 진술, 사용자의 사유 설명, 신청기간.\n자료가 없는 항목은 추정 사실로 채우지 않는다. 반대 주장과 불리한 자료도 검토한다. 법령의 현행성과 요건·청구 취지는 전문가 검토 후 확정한다.',
      ];
      next.sections = next.sections.map((s, i) => next.review!.affected.includes(s.id) ? ({ ...s, text: texts[i] }) : s); break;
    }
    case 'revise':
      assertSections(next.sections,true);
      if (next.stage !== 'draft' || !sectionId || typeof replacement !== 'string' || !replacement.trim() || replacement.length > 20000) throw Error('invalid-revision');
      if (!next.sections.some(s => s.id === sectionId)) throw Error('unknown-section');
      next.sections = next.sections.map(s => s.id === sectionId ? { ...s, text: replacement } : s);
      next.review = { ...next.review!, status: 'generated' }; break;
    default: throw Error('invalid-action');
  }
  next.revision += 1;
  return next;
}
export function documentText(state: Workspace): string {
  validateWorkspace(state); assertSections(state.sections,true);
  if (state.stage !== 'draft' || state.review?.status !== 'accepted' || state.review.generatedFactRevision !== state.review.factRevision || !state.factsConfirmed || !state.outlineConfirmed) throw Error('review-required');
  return previewDocumentText(state);
}
export function previewDocumentText(state: Workspace): string {
  return ['가상 사건 서면 초안 · 검증용', `문서 버전 ${state.revision}`, ...state.sections.flatMap(s => [s.title, s.text]),
    '공개 근거 후보: ' + state.evidence.join(', '), '미확인 항목: ' + state.missing.join(', '),
    ...(state.corrections || []).map(c => '사실 정정 이력: ' + c)].join('\n\n');
}
/** Reported current count is not a finding of statutory regular employee count. */
export function correctFacts(state: Workspace, correction: { reportedHeadcount?: number; approvedLeave?: boolean }): Workspace {
  const next = validateWorkspace(state);
  if (correction.reportedHeadcount !== undefined) {
    if (!Number.isSafeInteger(correction.reportedHeadcount) || correction.reportedHeadcount < 0 || correction.reportedHeadcount > 100000) throw Error('invalid-count');
    next.corrections = [...(next.corrections || []), `보고 인원 ${next.reportedHeadcount ?? '미확인'}명 → ${correction.reportedHeadcount}명. 상시근로자 수 판단은 미확정.`];
    next.reportedHeadcount = correction.reportedHeadcount;
    next.missing = [...new Set([...next.missing, '산정 기간의 일별 사용 인원과 가동일수', '단시간·일용·휴직자 포함 여부와 근로자 지위', '사건 당시 적용 범위 및 시행령 연결 검토'])];
    next.factsConfirmed = false; next.outlineConfirmed = false; next.stage = 'facts';
  }
  if (correction.approvedLeave !== undefined) {
    next.corrections = [...(next.corrections || []), `휴무 승인 사실 정정: ${correction.approvedLeave ? '승인됨' : '미승인 주장'}. 과거 통지 원본과 구별하여 검토.`];
    next.approvedLeave = correction.approvedLeave;
  }
  const affected = ['request','facts','grounds'];
  next.archivedSections = [...(next.archivedSections || []), ...next.sections.filter(s => affected.includes(s.id)).map(s => ({ ...s }))];
  next.sections = next.sections.map(s => affected.includes(s.id) ? { ...s, text: '[사실 정정으로 기존 판단 무효화 · 추가 자료와 적용 법령 검토 전 판단 보류]' } : s);
  next.review = { status: 'pending', factRevision: (next.review?.factRevision || 0) + 1, affected };
  next.factsConfirmed = false; next.outlineConfirmed = false; next.stage = 'facts';
  // Unrelated evidence section, citation IDs and original notices remain unchanged.
  next.revision += 1; return next;
}
