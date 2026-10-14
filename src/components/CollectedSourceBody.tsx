import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import SourceMarkdownLink from './SourceMarkdownLink';
const schema={tagNames:['p','br','div','span','strong','em','b','i','ul','ol','li','table','thead','tbody','tfoot','tr','td','th','blockquote','pre','code','h1','h2','h3','h4','a','hr'],attributes:{a:['href'],td:['colSpan','rowSpan'],th:['colSpan','rowSpan']},protocols:{href:['http','https']},strip:['script','style','iframe','object','embed','img','svg','math','input','form']};
/** Parse stored HTML as data, sanitize, then render an allowlisted tree. No raw DOM insertion. */
export default function CollectedSourceBody({text}:{text:string}) {
 return <div className="reading-prose break-words [&_p]:mb-4 [&_li]:ml-4 [&_li]:list-disc"><ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeRaw,[rehypeSanitize,schema]]} components={{a:props=><SourceMarkdownLink {...props}/>,table:({children})=><div className="reading-table-scroll" role="region" aria-label="수집 본문 표" tabIndex={0}><table>{children}</table></div>}}>{text}</ReactMarkdown></div>;
}
