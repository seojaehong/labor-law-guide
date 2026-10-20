import type { Root, Element } from 'hast';
export const COLLECTED_ANCHOR_PREFIX='collected-source-';
/** Runs after sanitizer clobber protection; resolve only targets inside this collected body. */
export default function collectedSourceAnchors(options?: { prefix?: string }) {
 const prefix=options?.prefix?.startsWith(COLLECTED_ANCHOR_PREFIX) ? options.prefix : COLLECTED_ANCHOR_PREFIX;
 return (tree:Root)=>{
  const elements:Element[]=[];
  function walk(node:Root|Root['children'][number]) {if(node.type==='element')elements.push(node);if('children' in node)for(const child of node.children)walk(child);}
  walk(tree);
  const targets=new Map<string,string>(),used=new Set<string>();
  for(const el of elements){
   const p=el.properties;const raw=typeof p.id==='string'?p.id:typeof p.name==='string'?p.name:null;
   if(raw){
    const original=raw.startsWith(prefix)?raw.slice(prefix.length):raw;
    const base=prefix+original;let id=base,index=2;while(used.has(id))id=base+'-'+index++;
    used.add(id);p.id=id;if(!targets.has(original))targets.set(original,id);
   }
   delete p.name;
  }
  for(const el of elements){
   const p=el.properties;
   if(typeof p.href==='string'&&p.href.startsWith('#')){
    let ref=p.href.slice(1);try{ref=decodeURIComponent(ref);}catch{}
    const target=targets.get(ref);if(target)p.href='#'+encodeURIComponent(target);else delete p.href;
   }
   if(p.ariaDescribedBy){const refs=Array.isArray(p.ariaDescribedBy)?p.ariaDescribedBy:String(p.ariaDescribedBy).split(/\s+/);const mapped=refs.map(ref=>targets.get(String(ref))).filter((ref):ref is string=>!!ref);if(mapped.length)p.ariaDescribedBy=mapped;else delete p.ariaDescribedBy;}
  }
 };
}
