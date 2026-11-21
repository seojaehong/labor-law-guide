import { Children, isValidElement, type ReactNode, type ComponentProps } from 'react';
import ReadingMarkdownLink from './ReadingMarkdownLink';
import { officialSource } from '@/lib/public-source-url';
function textOf(node: ReactNode): string { return Children.toArray(node).map(n=>isValidElement<{children?:ReactNode}>(n)?textOf(n.props.children):typeof n==='string'||typeof n==='number'?String(n):'').join(''); }
export default function SourceMarkdownLink(props: ComponentProps<typeof ReadingMarkdownLink>) {
  if(props.href?.startsWith('#') || (props.href?.startsWith('/')&&!props.href.startsWith('//')))return <ReadingMarkdownLink {...props}/>;
  const label=textOf(props.children);
  let privateHost=false;
  let malformedExternal=false;
  try {const url=new URL(props.href??'', 'https://source.invalid');const host=url.hostname.replace(/\.+$/,'');
    malformedExternal=!!props.href&&(!['http:','https:'].includes(url.protocol)||!!url.username||!!url.password||!!url.port||!host.includes('.')||/^(?:\d{1,3}\.){3}\d{1,3}$/.test(host)||host.includes(':')||host.split('.').some(part=>!part||!/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(part)));
    privateHost=/(?:^|\.)(?:bigcase\.ai|elbox\.io|lbox\.kr|lbox\.co\.kr|elawbox\.io|elawbox\.com|superlawyer\.co\.kr|superlawyer\.ai|ilabor\.co\.kr|i-labor\.co\.kr|elabor\.co\.kr|e-labor\.co\.kr)$/.test(host);} catch {malformedExternal=!!props.href;}
  if(malformedExternal)return <span>{props.children}</span>;
  if(privateHost||/원문|전문\s*(?:보기|확인|출처)|출처|참고/.test(label)) {
    const source=officialSource(props.href);
    // 덧말은 화면 안내다 — 복사·내려받기 글자에 싣지 않는다(data-export-skip).
    return source?<ReadingMarkdownLink {...props} href={source.url}/>:<span>{props.children}<span data-export-skip=""> (공식 원문 미확인)</span></span>;
  }
  return <ReadingMarkdownLink {...props}/>;
}
