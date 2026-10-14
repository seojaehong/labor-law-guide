import { Children, isValidElement, type ReactNode, type ComponentProps } from 'react';
import ReadingMarkdownLink from './ReadingMarkdownLink';
import { officialSource } from '@/lib/public-source-url';
function textOf(node: ReactNode): string { return Children.toArray(node).map(n=>isValidElement<{children?:ReactNode}>(n)?textOf(n.props.children):typeof n==='string'||typeof n==='number'?String(n):'').join(''); }
export default function SourceMarkdownLink(props: ComponentProps<typeof ReadingMarkdownLink>) {
  if(props.href?.startsWith('#') || (props.href?.startsWith('/')&&!props.href.startsWith('//')))return <ReadingMarkdownLink {...props}/>;
  const label=textOf(props.children);
  let privateHost=false;
  try {privateHost=/(?:^|\.)(?:bigcase\.ai|elbox\.io|lbox\.kr|lbox\.co\.kr|elawbox\.io|elawbox\.com|superlawyer\.co\.kr|superlawyer\.ai|ilabor\.co\.kr|i-labor\.co\.kr|elabor\.co\.kr|e-labor\.co\.kr)$/.test(new URL(props.href??'', 'https://source.invalid').hostname.replace(/\.+$/,''));} catch {}
  if(privateHost||/원문|전문\s*(?:보기|확인|출처)|출처|참고/.test(label)) {
    const source=officialSource(props.href);
    return source?<ReadingMarkdownLink {...props} href={source.url}/>:<span>{props.children} (공식 원문 미확인)</span>;
  }
  return <ReadingMarkdownLink {...props}/>;
}
