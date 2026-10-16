import type { BudgetRepository, Entry, Pricing, Usage } from './budget';
import { reservation, usageCost, validUsage } from './cost';
export type BudgetRpc = (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>;
/** Transport is injected; no DB client or credential is created here. */
export class RpcBudgetRepository implements BudgetRepository {
  constructor(private rpc: BudgetRpc) {}
  private async call(name: string, args: Record<string, unknown>): Promise<unknown> {
    try { const r = await this.rpc(name, args); if (r.error || r.data === null) throw Error('unavailable'); return r.data; }
    catch { throw Error('budget-unavailable'); }
  }
  async reserve(id: string, model: string, inputCap: number, outputCap: number, price: Pricing): Promise<string> {
    if (!price.reviewed) throw Error('unreviewed-price');
    const amount = reservation(price, inputCap, outputCap);
    if (!Number.isSafeInteger(amount) || amount <= 0) throw Error('invalid-reservation');
    const result = await this.call('reserve_ai_budget', { p_id: id, p_model: model, p_amount: amount });
    if (result !== id) throw Error('budget-unavailable'); return id;
  }
  async finish(id: string, usage: Usage | undefined, price: Pricing, inputCap: number, outputCap: number, latencyMs: number, success: boolean): Promise<void> {
    const valid = success && usage && validUsage(usage) && usage.inputTokens <= inputCap && usage.outputTokens <= outputCap;
    await this.call('settle_ai_budget', { p_id: id, p_cost: valid ? usageCost(price, usage) : null,
      p_input: valid ? usage.inputTokens : null, p_output: valid ? usage.outputTokens : null, p_latency: latencyMs, p_success: success });
  }
  async metrics(): Promise<Entry[]> { throw Error('aggregate-report-not-configured'); }
}
