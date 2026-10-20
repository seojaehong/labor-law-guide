/** Only remove text that is wholly visible elsewhere; similarity/prefixes are not equivalence. */
export function isFullyCovered(text: string, visible: string): boolean {
  return text.length > 0 && visible.includes(text);
}
export function normalizeHoldingSummary(raw: string): string {
  const text=raw.trim();
  const match=text.match(/^([\s\S]*?)\n+쟁점:\s*([\s\S]*?)\n+판단:\s*([\s\S]*)$/);
  if(!match)return text;
  const parts=[{label:'',text:match[1].trim()},{label:'쟁점',text:match[2].trim()},{label:'판단',text:match[3].trim()}];
  return parts.filter((p,i)=>p.text&&!parts.some((other,j)=>j!==i&&isFullyCovered(p.text,other.text)&&(p.text!==other.text||j<i))).map(p=>p.label?`${p.label}\n${p.text}`:p.text).join('\n\n');
}
