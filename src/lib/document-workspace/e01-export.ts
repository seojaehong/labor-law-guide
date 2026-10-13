import {exportE01,type E01} from './e01';
import type {Workspace} from './workflow';
/** Revalidate after asynchronous rendering, before the caller creates a download. */
export async function renderApprovedE01(
  snapshot:E01, current:()=>E01, render:(state:Workspace)=>Promise<Uint8Array>,
):Promise<Uint8Array> {
  const bytes=await render(exportE01(snapshot));
  const latest=current();
  if(latest!==snapshot || latest.version!==snapshot.version)throw Error('stale-export');
  exportE01(latest);
  return bytes;
}
