/** Stored source URLs are untrusted; links never execute non-web schemes. */
export function publicSourceUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url=new URL(value); return ['https:','http:'].includes(url.protocol)&&!url.username&&!url.password ? url.href : null; }
  catch { return null; }
}
