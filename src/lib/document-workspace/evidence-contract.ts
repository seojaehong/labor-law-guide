// Integration preparation only: no app routes, providers, database or paid calls.
export type Source = {
  id: string; text: string; digest: string;
  kind: 'law' | 'evidence';
  effectiveFrom?: string; effectiveTo?: string;
  temporalStatus: 'verified' | 'unknown';
};
export type Request = {
  userId: string; caseId: string; revisionId: string; operationId: string;
  factsDigest: string; candidateSetDigest: string; legalAsOf: string;
  issues: string[]; sources: Source[];
};
export type Selection = {
  issueId: string; sourceId: string; rawScore: number;
  scoreKind: 'probability' | 'relevance' | 'logit';
  start: number; end: number; quote: string; sourceDigest: string;
};
export type Result = {
  revisionId: string; factsDigest: string; candidateSetDigest: string;
  providerId: string; modelVersion: string; adapterVersion: string;
  status: 'selected' | 'abstained' | 'failed';
  reasons: string[]; selections: Selection[];
};
export interface Selector { select(request: Request): Promise<Result> }
const date = (v: string | undefined): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) &&
  Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v;
export function validate(request: Request, result: Result): string[] {
  const errors = new Set<string>();
  if (!date(request.legalAsOf)) errors.add('invalid-date');
  if (!request.userId || !request.caseId || !request.operationId ||
      !request.revisionId || !request.factsDigest || !request.candidateSetDigest)
    errors.add('missing-identity');
  if (request.revisionId !== result.revisionId ||
      request.factsDigest !== result.factsDigest ||
      request.candidateSetDigest !== result.candidateSetDigest) errors.add('stale-result');
  if (!result.providerId || !result.modelVersion || result.modelVersion === 'unknown' ||
      !result.adapterVersion) errors.add('unknown-model');
  const sources = new Map<string, Source>();
  for (const source of request.sources) {
    if (!source.id || sources.has(source.id)) errors.add('duplicate-source');
    if (!source.text.trim() || !source.digest) errors.add('missing-body');
    sources.set(source.id, source);
  }
  if (result.status !== 'selected' || !result.selections.length) errors.add('abstained');
  const seen = new Set<string>();
  for (const selection of result.selections) {
    const key = JSON.stringify([selection.issueId, selection.sourceId]);
    if (seen.has(key)) errors.add('duplicate-selection');
    seen.add(key);
    if (!request.issues.includes(selection.issueId)) errors.add('unknown-issue');
    if (!Number.isFinite(selection.rawScore) ||
        (selection.scoreKind === 'probability' &&
         (selection.rawScore < 0 || selection.rawScore > 1))) errors.add('invalid-score');
    const source = sources.get(selection.sourceId);
    if (!source) { errors.add('unknown-source'); continue; }
    if (selection.sourceDigest !== source.digest) errors.add('digest-mismatch');
    if (!Number.isSafeInteger(selection.start) || !Number.isSafeInteger(selection.end) ||
        selection.start < 0 || selection.end <= selection.start ||
        selection.end > source.text.length || !selection.quote.trim() ||
        source.text.slice(selection.start, selection.end) !== selection.quote)
      errors.add('quote-mismatch');
    if (source.kind === 'law') {
      if (source.temporalStatus !== 'verified' || !date(source.effectiveFrom) ||
          (source.effectiveTo !== undefined && !date(source.effectiveTo)))
        errors.add('unknown-time');
      else if (source.effectiveFrom > request.legalAsOf ||
          (source.effectiveTo !== undefined && (source.effectiveTo < source.effectiveFrom ||
           request.legalAsOf >= source.effectiveTo))) errors.add('out-of-time');
    }
  }
  for (const issue of request.issues)
    if (!result.selections.some(s => s.issueId === issue)) errors.add('missing-issue');
  return [...errors];
}

export type Revision = {
  id: string; kind: 'M1' | 'M2' | 'M3a' | 'M3b';
  originalNotice: string; currentAllegations: string[];
  headcount: number | null; outline: string[]; draft: string;
  draftDigest: string; outlineDigest: string; sourceSetDigest: string;
  unresolvedImpact: boolean; explanation: string;
};
type Approval = {
  actor: string; timestamp: string; revisionId: string;
  draftDigest: string; outlineDigest: string; sourceSetDigest: string;
};
export type Artifact = {
  revisionId: string; draftDigest: string; format: 'word' | 'pdf';
  bytes: Uint8Array;
};
export class CaseFlow {
  private revisions: Revision[] = [];
  private outlineApproval?: Approval;
  private finalApproval?: Approval;
  private artifacts: Artifact[] = [];
  readonly userId: string;
  readonly caseId: string;
  constructor(userId: string, caseId: string, initial: Revision) {
    this.userId = userId; this.caseId = caseId;
    this.revisions.push(structuredClone(initial));
  }
  get current(): Revision { return structuredClone(this.revisions.at(-1)!); }
  get history(): Revision[] { return structuredClone(this.revisions); }
  correct(actor: string, next: Revision): void {
    this.authorize(actor);
    if (this.revisions.some(r => r.id === next.id) ||
        next.originalNotice !== this.current.originalNotice) throw new Error('immutable-history');
    if (next.kind === 'M3a' && next.headcount !== null) throw new Error('uncertain-headcount');
    if (next.kind === 'M2' && next.currentAllegations.includes('08-18')) throw new Error('approved-leave');
    if (next.kind === 'M3b' && (next.draftDigest === this.current.draftDigest ||
        !next.outline.includes('적용범위'))) throw new Error('new-outline-required');
    this.revisions.push(structuredClone({ ...next, unresolvedImpact: true }));
    this.outlineApproval = undefined; this.finalApproval = undefined;
    this.artifacts = [];
  }
  review(actor: string, revisionId: string): void {
    this.authorize(actor);
    if (revisionId !== this.current.id || this.current.headcount === null)
      throw new Error('review-blocked');
    this.revisions[this.revisions.length - 1].unresolvedImpact = false;
  }
  approve(actor: string, revisionId: string, action: 'outline' | 'final', timestamp: string): void {
    this.authorize(actor);
    const r = this.current;
    if (r.id !== revisionId || r.unresolvedImpact || r.headcount === null ||
        !Number.isFinite(Date.parse(timestamp))) throw new Error('approval-blocked');
    if (action === 'final' && !this.matches(this.outlineApproval, r)) throw new Error('outline-required');
    const approval = { actor, timestamp, revisionId, draftDigest: r.draftDigest,
      outlineDigest: r.outlineDigest, sourceSetDigest: r.sourceSetDigest };
    if (action === 'outline') this.outlineApproval = approval;
    else this.finalApproval = approval;
  }
  store(actor: string, artifact: Artifact): void {
    this.authorize(actor);
    if (!this.matches(this.finalApproval, this.current) ||
        artifact.revisionId !== this.current.id ||
        artifact.draftDigest !== this.current.draftDigest ||
        !artifact.bytes.length) throw new Error('artifact-blocked');
    this.artifacts = this.artifacts.filter(a => a.format !== artifact.format);
    this.artifacts.push(structuredClone(artifact));
  }
  download(actor: string, revisionId: string, format: 'word' | 'pdf'): Uint8Array {
    this.authorize(actor);
    if (revisionId !== this.current.id || this.current.unresolvedImpact ||
        !this.matches(this.finalApproval, this.current)) throw new Error('download-blocked');
    const artifact = this.artifacts.find(a => a.format === format);
    if (!artifact) throw new Error('artifact-missing');
    return artifact.bytes.slice();
  }
  private authorize(actor: string): void {
    if (actor !== this.userId) throw new Error('forbidden');
  }
  private matches(a: Approval | undefined, r: Revision): boolean {
    return !!a && a.revisionId === r.id && a.draftDigest === r.draftDigest &&
      a.outlineDigest === r.outlineDigest && a.sourceSetDigest === r.sourceSetDigest;
  }
}

// In-memory mock only. Shared durable budget enforcement remains blocked.
export class MockOperations {
  private entries = new Map<string, { request: string; promise: Promise<Result>; reserved: number }>();
  run(request: Request, maximumReservation: number, selector: Selector): Promise<Result> {
    if (!Number.isSafeInteger(maximumReservation) || maximumReservation < 0)
      throw new Error('invalid-reservation');
    const key = JSON.stringify([request.userId, request.caseId, request.revisionId, request.operationId]);
    const serialized = JSON.stringify(request);
    const prior = this.entries.get(key);
    if (prior) {
      if (prior.request !== serialized) throw new Error('operation-conflict');
      return prior.promise;
    }
    // Reserve before invoking the adapter, including synchronous failures.
    const promise = Promise.resolve().then(() => selector.select(structuredClone(request)));
    this.entries.set(key, { request: serialized, promise, reserved: maximumReservation });
    return promise; // No retry; unknown failure retains full reservation.
  }
  reserved(): number { return [...this.entries.values()].reduce((n, e) => n + e.reserved, 0); }
}
