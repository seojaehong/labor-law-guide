import { describe, expect, it } from 'vitest';
import {
  getDecisionDetailHref,
  detectDecisionSourceProvider,
  getDecisionDetailRoutePath,
  getDecisionSourceLabel,
  isDecisionSourceProvider,
  normalizeDecisionSourceProvider,
  resolveDecisionSourceContract,
} from '../source-contracts';

describe('decision source contracts', () => {
  it('detects the provider from the canonical id prefixes', () => {
    expect(detectDecisionSourceProvider('prec_2024_001')).toBe('lawgo');
    expect(detectDecisionSourceProvider('bc_1024')).toBe('bigcase');
    expect(detectDecisionSourceProvider('nlrc_123')).toBe('nlrc');
    expect(detectDecisionSourceProvider('plain-id')).toBe('nlrc');
  });

  it('normalizes known provider labels and rejects unknown values', () => {
    expect(isDecisionSourceProvider('lawgo')).toBe(true);
    expect(isDecisionSourceProvider('court')).toBe(false);
    expect(normalizeDecisionSourceProvider(' LAWGO ')).toBe('lawgo');
    expect(normalizeDecisionSourceProvider('bigcase')).toBe('bigcase');
    expect(normalizeDecisionSourceProvider('unknown')).toBeNull();
    expect(normalizeDecisionSourceProvider(undefined)).toBeNull();
  });

  it('resolves the collection and route contract for BigCase and Law.go sources', () => {
    const bigcase = resolveDecisionSourceContract({ id: 'bc_42' });
    const lawgo = resolveDecisionSourceContract({ id: 'prec_77' });
    const nlrc = resolveDecisionSourceContract({ id: 'case_1' });

    expect(bigcase).toMatchObject({
      provider: 'bigcase',
      idPrefix: 'bc_',
      detailTable: 'cases',
      detailKind: 'bigcase-case',
      isSourceAware: true,
      routePath: '/decisions/bc_42',
    });
    expect(lawgo).toMatchObject({
      provider: 'lawgo',
      idPrefix: 'prec_',
      detailTable: 'lawgo_precedents',
      detailKind: 'lawgo-precedent',
      isSourceAware: true,
      routePath: '/decisions/prec_77',
    });
    expect(nlrc).toMatchObject({
      provider: 'nlrc',
      idPrefix: null,
      detailTable: 'nlrc_decisions',
      detailKind: 'nlrc-decision',
      isSourceAware: false,
      routePath: '/decisions/case_1',
    });
  });

  it('lets an explicit provider override id-based detection when the source contract is known', () => {
    const resolution = resolveDecisionSourceContract({
      id: 'bc_999',
      sourceProvider: 'lawgo',
    });

    expect(resolution.provider).toBe('lawgo');
    expect(resolution.detailTable).toBe('lawgo_precedents');
    expect(resolution.detailKind).toBe('lawgo-precedent');
    expect(resolution.routePath).toBe('/decisions/bc_999');
  });

  it('formats canonical decision detail routes from the id alone', () => {
    expect(getDecisionDetailRoutePath('prec_1001')).toBe('/decisions/prec_1001');
    expect(getDecisionDetailRoutePath('bc_1001')).toBe('/decisions/bc_1001');
  });

  it('builds source-aware hrefs for BigCase and Law.go surfaces', () => {
    expect(getDecisionDetailHref({ id: 'bc_1001', sourceProvider: 'bigcase' })).toBe('/decisions/bc_1001?source=bigcase');
    expect(getDecisionDetailHref({ id: 'prec_1001', sourceProvider: 'lawgo' })).toBe('/decisions/prec_1001?source=lawgo');
    expect(getDecisionDetailHref({ id: 'plain-id' })).toBe('/decisions/plain-id');
  });

  it('exposes human-readable source labels', () => {
    expect(getDecisionSourceLabel('bigcase')).toBe('법원 판례');
    expect(getDecisionSourceLabel('lawgo')).toBe('법제처 판례');
    expect(getDecisionSourceLabel('nlrc')).toBe('노동위 판정례');
  });
});
