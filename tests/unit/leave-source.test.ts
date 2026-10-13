import { test } from 'vitest';

// Original SafeClaw assertions run through Vite's TS resolver. The arithmetic
// assertions and external expected values remain intact; process.exit becomes
// an exception so a failure is reported by the host suite.
const scripts = [
  'annual-leave-edges.test', 'annual-leave.crosscheck', 'leave-advanced.test',
  'leave-adversarial.test', 'leave-guardrails.test', 'leave-ledger.crosscheck',
  'leave-settlement-textbook.test', 'leave-usage.test', 'leave-workspaces.test',
  'leave-xlsx-roundtrip.test',
];
for (const script of scripts) {
  test(`SafeClaw original assertions: ${script}`, async () => {
    await import(`../leave-source/${script}.mts`);
  });
}
