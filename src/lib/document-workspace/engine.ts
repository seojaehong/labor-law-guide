import { transition, assertSections, type Workspace, type Action } from './workflow';
import { runModel, type Generator, type ModelPolicy, type Role } from './model-mix';
import type { BudgetRepository } from './budget';
import publicEvidence from './public-fixture.json';
export async function executeWorkspaceAction(input: {
  state: Workspace; action: Action; sectionId?: string; replacement?: string; requestId: string;
  store: BudgetRepository; policies: Partial<Record<Role, ModelPolicy>>; generator: Generator;
  evidenceSelector: () => Promise<string[]>;
}): Promise<Workspace> {
  const next = transition(input.state, input.action, input.sectionId, input.replacement);
  const roles: Partial<Record<Action, Role>> = { consult: 'ordinary', outline: 'complex', draft: 'document' };
  const role = roles[input.action];
  if (input.action === 'consult') next.evidence = await input.evidenceSelector();
  if (role) {
    const prompt = JSON.stringify({ task: input.action, case: 'synthetic-dismissal-v1',
      instruction: 'Return JSON only. Reconsider affected sections using corrected facts. Missing applicability evidence means abstain from a legal conclusion. Preserve unrelated sections and original notices. Do not invent evidence or quotations. Include contextRevision and reviewOutcome=needs-review.',
      contextRevision: next.review!.factRevision,
      facts: next.facts, missingFacts: next.missing, issues: next.issues,
      reportedHeadcount: next.reportedHeadcount, approvedLeave: next.approvedLeave,
      corrections: next.corrections, originalNotices: next.originalNotices,
      selectedEvidence: next.evidence.map(id => ({ id, publicRow: publicEvidence.find(row => 'lsa-'+row.article_label.replace(/\D/g,'') === id) || null, currencyVerified: false })),
      affectedSections: next.review!.affected,
      syntheticTemplate: { consultation: next.consultation, sections: next.sections } });
    const result = await runModel({ enabled: true, requestId: input.requestId, role, prompt, store: input.store, policies: input.policies, generator: input.generator });
    const output = JSON.parse(result.text);
    if (role === 'ordinary') {
      if (typeof output.consultation !== 'string' || output.consultation.length > 12000) throw Error('invalid-generation');
      next.consultation = output.consultation;
    } else {
      assertSections(output.sections,true);
      if (output.sections.some((s: {title:string},i:number)=>s.title!==next.sections[i].title)) throw Error('invalid-section-title');
      const affected = next.review!.affected;
      next.sections = next.sections.map((s,i) => affected.includes(s.id) ? ({ ...s, text: output.sections[i].text }) : s);
      if (role === 'document') {
        if (output.contextRevision !== next.review!.factRevision || output.reviewOutcome !== 'needs-review') throw Error('review-response-required');
        if (next.archivedSections?.some(old => affected.includes(old.id) && next.sections.some(s => s.id === old.id && s.text === old.text))) throw Error('stale-conclusion');
        next.review = { ...next.review!, status: 'generated', generatedFactRevision: next.review!.factRevision };
      }
    }
  }
  return next;
}
