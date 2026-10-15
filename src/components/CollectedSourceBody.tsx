import collectedSourceAnchors, { COLLECTED_ANCHOR_PREFIX } from "@/lib/collected-source-anchors";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import SourceMarkdownLink from './SourceMarkdownLink';
const schema={tagNames:['p','br','div','span','strong','em','b','i','ul','ol','li','table','thead','tbody','tfoot','tr','td','th','blockquote','pre','code','h1','h2','h3','h4','a','hr'],clobber:['id','name'],clobberPrefix:COLLECTED_ANCHOR_PREFIX,attributes:{'*':['id','name'],a:['href','dataFootnoteRef','dataFootnoteBackref','ariaDescribedBy','ariaLabel'],ol:['start','reversed','type'],li:['value'],td:['colSpan','rowSpan'],th:['colSpan','rowSpan']},protocols:{href:['http','https']},strip:['script','style','iframe','object','embed','img','svg','math','input','form']};
/** Parse stored HTML as data, sanitize, then render an allowlisted tree. No raw DOM insertion. */
export default function CollectedSourceBody({text,anchorScope}:{text:string;anchorScope?:string}) {
 const prefix=anchorScope&&/^[a-z0-9-]+$/.test(anchorScope)?COLLECTED_ANCHOR_PREFIX+anchorScope+'-':COLLECTED_ANCHOR_PREFIX;
 const scopedSchema={...schema,clobberPrefix:prefix};
 return <div className="reading-prose break-words [&_p]:mb-4 [&_li]:ml-4 [&_ul>li]:list-disc"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw,[rehypeSanitize,scopedSchema],[collectedSourceAnchors,{prefix}]]} components={{ol:({children,start,reversed,type})=><ol start={start} reversed={reversed} type={type} style={{listStyleType:type==='a'?'lower-alpha':type==='A'?'upper-alpha':type==='i'?'lower-roman':type==='I'?'upper-roman':'decimal'}}>{children}</ol>,a:props=><SourceMarkdownLink {...props}/>,table:({children})=><div className="reading-table-scroll" role="region" aria-label="수집 본문 표" tabIndex={0}><table>{children}</table></div>}}>{text}</ReactMarkdown></div>;
}
