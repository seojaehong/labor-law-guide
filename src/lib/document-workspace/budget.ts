import { mkdirSync, openSync, closeSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { reservation, usageCost, validUsage, type TokenUsage, type Price } from './cost';

export type Usage = TokenUsage;
export type Pricing = Price;
export type Entry = {
  id: string; month: string; model: string; calls: 1; reservedMicroUsd: number;
  state: 'pending' | 'success' | 'abstained' | 'unknown'; costMicroUsd: number;
  inputTokens?: number; outputTokens?: number; latencyMs?: number;
  rawUsage?: Usage;
};
type Ledger = { version: 1; entries: Entry[] };
export interface BudgetRepository {
  reserve(id: string, model: string, inputCap: number, outputCap: number, price: Pricing, now?: Date): string | Promise<string>;
  finish(id: string, usage: Usage | undefined, price: Pricing, inputCap: number, outputCap: number, latencyMs: number, success: boolean): void | Promise<void>;
  metrics(): Entry[] | Promise<Entry[]>;
}
export class BudgetStore {
  constructor(private directory: string, private monthlyMicroUsd: number) {
    if (!Number.isSafeInteger(monthlyMicroUsd) || monthlyMicroUsd < 0) throw Error('invalid-budget');
  }
  private transaction<T>(operation: (ledger: Ledger) => T): T {
    mkdirSync(this.directory, { recursive: true });
    const lock = join(this.directory, 'lock');
    let fd: number;
    try { fd = openSync(lock, 'wx'); } catch { throw Error('budget-unavailable'); }
    const file = join(this.directory, 'ledger.json');
    const temp = join(this.directory, randomUUID() + '.tmp');
    try {
      let ledger: Ledger;
      try { ledger = JSON.parse(readFileSync(file, 'utf8')); }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT' && !existsSync(join(this.directory, 'initialized'))) ledger = { version: 1, entries: [] };
        else throw Error('budget-unavailable');
      }
      if (ledger.version !== 1 || !Array.isArray(ledger.entries) || ledger.entries.some(e =>
        !e || !Number.isSafeInteger(e.costMicroUsd) || e.costMicroUsd < 0 ||
        !Number.isSafeInteger(e.reservedMicroUsd) || e.reservedMicroUsd < 0 ||
        !['pending', 'success', 'abstained', 'unknown'].includes(e.state) ||
        typeof e.id !== 'string' || typeof e.model !== 'string' || !/^\d{4}-\d{2}$/.test(e.month))) throw Error('budget-unavailable');
      const result = operation(ledger);
      writeFileSync(temp, JSON.stringify(ledger), { flag: 'wx' });
      renameSync(temp, file);
      writeFileSync(join(this.directory, 'initialized'), '1');
      return result;
    } finally {
      closeSync(fd); unlinkSync(lock);
      try { unlinkSync(temp); } catch { /* no remaining temp file */ }
    }
  }
  reserve(id: string, model: string, inputCap: number, outputCap: number, price: Pricing, now = new Date()): string {
    if (!/^[a-zA-Z0-9-]{8,100}$/.test(id) || !/^[a-zA-Z0-9._-]{1,100}$/.test(model)) throw Error('invalid-request');
    if (!price.reviewed || [inputCap, outputCap]
      .some(n => !Number.isSafeInteger(n) || n < 0)) throw Error('unreviewed-price');
    const reserved = reservation(price, inputCap, outputCap);
    if (!Number.isSafeInteger(reserved) || reserved <= 0) throw Error('invalid-reservation');
    return this.transaction(ledger => {
      if (ledger.entries.some(e => e.id === id)) throw Error('duplicate-request');
      const month = now.toISOString().slice(0, 7);
      const exposure = ledger.entries.reduce((sum, e) => sum +
        (e.month === month ? e.costMicroUsd : ['pending', 'unknown'].includes(e.state) ? e.reservedMicroUsd : 0), 0);
      if (!Number.isSafeInteger(exposure + reserved) || exposure + reserved > this.monthlyMicroUsd) throw Error('monthly-budget-exceeded');
      ledger.entries.push({ id, month, model, calls: 1, reservedMicroUsd: reserved, costMicroUsd: reserved, state: 'pending' });
      return id;
    });
  }
  finish(id: string, usage: Usage | undefined, price: Pricing, inputCap: number, outputCap: number, latencyMs: number, success: boolean): void {
    this.transaction(ledger => {
      const e = ledger.entries.find(e => e.id === id);
      if (!e || e.state !== 'pending') throw Error('invalid-settlement');
      const valid = success && usage && validUsage(usage) &&
        usage.inputTokens <= inputCap && usage.outputTokens <= outputCap;
      // No usage or ambiguous failure keeps the maximum reservation permanently.
      if (!valid) { e.state = 'unknown'; return; }
      const cost = usageCost(price, usage);
      if (!Number.isSafeInteger(cost) || cost < 0 || cost > e.reservedMicroUsd) { e.state = 'unknown'; return; }
      e.state = success ? 'success' : 'abstained'; e.costMicroUsd = cost;
      e.inputTokens = usage.inputTokens; e.outputTokens = usage.outputTokens;
      e.rawUsage = structuredClone(usage);
      e.latencyMs = Math.max(0, Math.ceil(latencyMs));
    });
  }
  metrics(): Entry[] { return this.transaction(l => structuredClone(l.entries)); }
}
