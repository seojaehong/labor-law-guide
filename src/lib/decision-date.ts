/** Normalize a stored date for display/metadata only; never invent a replacement. */
export function decisionDate(value:unknown):string|null{
  if(typeof value!=='string')return null;
  const legacy=value.trim().match(/^(\d{4})([./])\s*(\d{1,2})\2\s*(\d{1,2})\.?$/);
  const canonical=legacy?`${legacy[1]}-${legacy[3].padStart(2,'0')}-${legacy[4].padStart(2,'0')}`:/^\d{8}$/.test(value)?`${value.slice(0,4)}-${value.slice(4,6)}-${value.slice(6,8)}`:value;
  const match=canonical.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
  if(!match)return null;
  if(canonical.includes('T')&&!Number.isFinite(Date.parse(canonical)))return null;
  const [,year,month,day]=match;const y=Number(year),m=Number(month),d=Number(day);
  if(y<2||m<1||m>12||d<1)return null;
  const days=[31,y%4===0&&(y%100!==0||y%400===0)?29:28,31,30,31,30,31,31,30,31,30,31];
  return d<=days[m-1]?`${year}-${month}-${day}`:null;
}
