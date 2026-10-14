import { Badge } from '@/components/decisions-ui/badge';
import { pickReason } from '@/lib/reason-pick';
import { REASON_LABELS, type ReasonCategory } from '@/lib/types';

/** Distinguish the shared representative badge from all other stored categories. */
export default function DecisionReasonBadges({categories,primary}:{categories:readonly string[]|null|undefined;primary?:string|null}){
  const representative=pickReason(categories,primary);
  const others=[...new Set(categories??[])].filter(c=>c!==representative);
  if(!representative&&!others.length)return null;
  return <>
    {representative&&<>
      <span className="self-center text-xs text-muted-foreground">대표 유형</span>
      <Badge variant="outline" aria-label={`대표 유형: ${REASON_LABELS[representative]}`}>{REASON_LABELS[representative]}</Badge>
    </>}
    {others.length>0&&<>
      <span className="self-center text-xs text-muted-foreground">{representative?'함께 저장된 유형':'저장된 유형'}</span>
      {others.map(category=><Badge key={category} variant="outline">{REASON_LABELS[category as ReasonCategory]??category}</Badge>)}
    </>}
  </>;
}
