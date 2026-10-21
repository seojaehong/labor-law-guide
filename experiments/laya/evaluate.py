"""Public/synthetic fixtures only. No downloads, credentials, API or live app calls."""
import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import resource
import statistics
import subprocess
import sys
import time

MODEL = 'convaiinnovations/laya-multilingual'
REVISION = 'e4e9ddf21a7b1903b7acffd8814ad4307bf63a67'
ROOT = Path(__file__).resolve().parent


class Refused(ValueError):
    """Only these local reason codes may be reported, never raw provider errors."""


def rank(scores, count):
    if (not isinstance(scores, list) or len(scores) != count or
        any(type(x) not in (float, int) or not math.isfinite(x) or not 0 <= x <= 1 for x in scores)):
        raise Refused('invalid-scores')
    return sorted(range(count), key=lambda i: (-scores[i], i))


def contains_auto_map(value):
    if isinstance(value, dict):
        return 'auto_map' in value or any(contains_auto_map(v) for v in value.values())
    return isinstance(value, list) and any(contains_auto_map(v) for v in value)


def validate_snapshot(snapshot, manifest_path):
    """Manifest must be independently reviewed against the official pinned HF files.

    A directory name alone does not establish model provenance. Do not generate a
    manifest from arbitrary local files and call that official source verification.
    """
    path = Path(snapshot).resolve()
    if path.name != REVISION or path.parent.name != 'snapshots':
        raise Refused('expected-pinned-official-snapshot')
    if not manifest_path:
        raise Refused('reviewed-manifest-required')
    manifest = json.loads(Path(manifest_path).read_text())
    if manifest.get('repository') != MODEL or manifest.get('revision') != REVISION:
        raise Refused('manifest-source-mismatch')
    digests = manifest.get('files')
    if not isinstance(digests, dict) or not digests:
        raise Refused('manifest-files-required')
    required = ['model.safetensors', 'rl_agent_config.json', 'tokenizer/tokenizer_config.json', 'encoder/config.json']
    if any(rel not in digests for rel in required):
        raise Refused('incomplete-manifest')
    for rel, digest in digests.items():
        parts = Path(rel).parts
        allowed = rel in required or (len(parts) == 2 and parts[0] == 'tokenizer' and Path(rel).suffix in ('.json', '.txt', '.model'))
        if not allowed or not isinstance(digest, str) or len(digest) != 64:
            raise Refused('unsafe-manifest-artifact')
        artifact = path / rel
        if not artifact.is_file():
            raise Refused('incomplete-snapshot')
        hasher = hashlib.sha256()
        with artifact.open('rb') as file:
            for chunk in iter(lambda: file.read(1 << 20), b''):
                hasher.update(chunk)
        if hasher.hexdigest() != digest:
            raise Refused('artifact-digest-mismatch')
    # Reject unlisted files, executable artifacts and nested remote-code configs.
    for artifact in path.rglob('*'):
        if artifact.is_file():
            rel = artifact.relative_to(path).as_posix()
            if rel not in digests:
                raise Refused('unreviewed-artifact')
            if artifact.suffix == '.json' and contains_auto_map(json.loads(artifact.read_text())):
                raise Refused('remote-code-config-refused')
    return path, digests


def score_case(agent, case):
    if not 2 <= len(case['candidates']) <= 32:
        raise Refused('candidate-budget')
    state = '합성 사용자 질문: ' + case['query'] + '\n공개자료:\n' + '\n'.join(
        f"자료 {i+1}: {c['text']}" for i,c in enumerate(case['candidates']))
    criteria = {str(i+1): f'자료 {i+1}' for i in range(len(case['candidates']))}
    question = '이 질문에 직접 관련된 공개 법령 또는 판례 자료를 고르세요. 법률적 정답 판정이 아닙니다.'
    # Conservative early guard, followed by the model's actual truncation report.
    size = len(agent.tok.encode(state + question + json.dumps(criteria, ensure_ascii=False)))
    if size > 8192 - 512:
        raise Refused('context-overflow-no-truncation')
    result = agent.system_one(state, {'pick': {'type':'choice', 'instructions':question, 'criteria':criteria}}, lang='ko', max_len=8192, head_max_len=512)
    usage = result.get('usage', {})
    if usage.get('truncated') is not False or usage.get('state_tokens_dropped') != 0 or usage.get('options'):
        raise Refused('context-truncated-or-options-collapsed')
    probabilities = result['answers']['pick']['probabilities']
    if not isinstance(probabilities, dict) or set(probabilities) != set(criteria):
        raise Refused('invalid-choice-ids')
    scores = [probabilities[str(i+1)] for i in range(len(criteria))]
    rank(scores, len(criteria))
    if abs(sum(scores) - 1) > .01:
        raise Refused('invalid-choice-probability-total')
    return scores


def worker(snapshot, manifest, case, repeats):
    path, digests = validate_snapshot(snapshot, manifest)
    from importlib.metadata import version
    if any(version(package) != expected for package, expected in
           [('laya','0.4.12'), ('torch','2.8.0+cpu'), ('transformers','4.57.6')]):
        raise Refused('incorrect-package-version')
    from laya import Agent
    start = time.perf_counter()
    agent = Agent(str(path), device='cpu', backend='eager', expected_sha256=digests)
    load_ms = (time.perf_counter() - start) * 1000
    timings = []
    for _ in range(repeats):
        start = time.perf_counter()
        scores = score_case(agent, case)
        timings.append((time.perf_counter() - start) * 1000)
    return {'scores':scores, 'load_ms':load_ms, 'inference_ms':timings,
            'peak_rss_mib':resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1024}


def metrics(case, order):
    relevant = set(case['relevant'])
    hits = [case['candidates'][i]['id'] in relevant for i in order]
    return {'top1':int(hits[0]), 'mrr':next((1/(i+1) for i,x in enumerate(hits) if x),0),
            'recall_at_3':sum(hits[:3])/len(relevant)}


def evaluate(snapshot, timeout, manifest=None, repeats=3):
    cases = json.loads((ROOT / 'fixtures.json').read_text())
    rows = []
    for case in cases:
        count = len(case['candidates'])
        before = list(range(count)); after = before; status = 'unconfigured'; detail = None
        start = time.perf_counter()
        if snapshot:
            env = {k:v for k,v in os.environ.items() if k in ('PATH','LANG','LD_LIBRARY_PATH')}
            env.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_IMPLICIT_TOKEN='1', HF_HUB_DISABLE_TELEMETRY='1', TOKENIZERS_PARALLELISM='false', OMP_NUM_THREADS='4', MKL_NUM_THREADS='4')
            command = [sys.executable, str(Path(__file__).resolve()), '--worker', snapshot, '--repeats', str(repeats)]
            if manifest: command.extend(['--manifest', manifest])
            try:
                run = subprocess.run(command, input=json.dumps(case), capture_output=True, text=True, timeout=timeout, env=env, check=True)
                detail = json.loads(run.stdout)
                if detail.get('refused'):
                    status = detail['refused']; detail = None
                else:
                    after = rank(detail['scores'], count); status = 'measured'
            except subprocess.TimeoutExpired:
                status = 'timeout'
            except (subprocess.CalledProcessError, ValueError, KeyError, TypeError):
                status = 'failed'; detail = None
        rows.append({'id':case['id'],'status':status,'baseline':metrics(case,before),
            'laya':metrics(case,after) if status=='measured' else None,'rank_changed':after != before,
            'order':[case['candidates'][i]['id'] for i in after],
            'cold_process_ms':round((time.perf_counter()-start)*1000,2), 'model_measurement':detail})
    measured = [r for r in rows if r['status']=='measured']
    times=sorted(t for r in measured for t in r['model_measurement']['inference_ms'][1:])
    return {'model':MODEL,'revision':REVISION,'package':'laya==0.4.12','production_ready':False,
        'environment':'selected cloud sandbox, not Oracle server1/server2',
        'latency_scope':'per-case cold process/load; first inference separate from subsequent warm repeats',
        'measured_count':len(measured),'warm_p50_ms':statistics.median(times) if times else None,
        'warm_p95_ms':times[math.ceil(len(times)*.95)-1] if times else None,
        'baseline_mean':{k:statistics.mean(r['baseline'][k] for r in rows) for k in ('top1','mrr','recall_at_3')},
        'laya_mean':{k:statistics.mean(r['laya'][k] for r in measured) for k in ('top1','mrr','recall_at_3')} if measured else None,
        'cases':rows}


if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--snapshot'); parser.add_argument('--worker'); parser.add_argument('--manifest'); parser.add_argument('--timeout',type=float,default=30); parser.add_argument('--repeats',type=int,default=3)
    args=parser.parse_args()
    if not 0 < args.timeout <= 60 or not 2 <= args.repeats <= 10: parser.error('timeout in (0,60], repeats in [2,10] required')
    if args.worker:
        try:
            print(json.dumps(worker(args.worker,args.manifest,json.load(sys.stdin),args.repeats)))
        except Refused as error:
            print(json.dumps({'refused':str(error)}))
    else:
        print(json.dumps(evaluate(args.snapshot,args.timeout,args.manifest,args.repeats),ensure_ascii=False,indent=2))
