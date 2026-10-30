import { CaseFlow, validate } from './evidence-contract';
import type { Request, Result, Revision, Artifact } from './evidence-contract';

// Integration contract only. Callers supply verified source-byte digests.
// No provider execution, document rendering, persistence or app integration.
export class ReviewedCase {
  private flow: CaseFlow;
  private verifiedRevision?: string;
  constructor(userId: string, caseId: string, initial: Revision) {
    this.flow = new CaseFlow(userId, caseId, initial);
  }
  get current(): Revision { return this.flow.current; }
  get history(): Revision[] { return this.flow.history; }
  correct(actor: string, next: Revision): void {
    this.flow.correct(actor, next);
    this.verifiedRevision = undefined;
  }
  acceptEvidence(actor: string, request: Request, result: Result): string[] {
    if (actor !== this.flow.userId) throw new Error('forbidden');
    this.verifiedRevision = undefined; // failed replacement cannot retain prior gate
    const errors = validate(request, result);
    if (request.userId !== this.flow.userId || request.caseId !== this.flow.caseId)
      errors.push('case-mismatch');
    if (request.revisionId !== this.current.id ||
        request.candidateSetDigest !== this.current.sourceSetDigest)
      errors.push('revision-mismatch');
    if (!errors.length) this.verifiedRevision = request.revisionId;
    return errors;
  }
  review(actor: string): void {
    this.requireEvidence();
    this.flow.review(actor, this.current.id);
  }
  approve(actor: string, action: 'outline' | 'final', timestamp: string): void {
    this.requireEvidence();
    this.flow.approve(actor, this.current.id, action, timestamp);
  }
  store(actor: string, artifact: Artifact): void {
    this.requireEvidence(); this.flow.store(actor, artifact);
  }
  download(actor: string, revisionId: string, format: 'word' | 'pdf'): Uint8Array {
    this.requireEvidence(); return this.flow.download(actor, revisionId, format);
  }
  private requireEvidence(): void {
    if (this.verifiedRevision !== this.current.id) throw new Error('evidence-review-required');
  }
}
