"""Public/synthetic fixtures only. No downloads, credentials, API or live app calls."""
import argparse
import json
import math
import os
from pathlib import Path
import statistics
import subprocess
import sys
import time

REVISION = 'e4e9ddf21a7b1903b7acffd8814ad4307bf63a67'
ROOT = Path(__file__).resolve().parent


def rank(scores, count):
    if (not isinstance(scores, list) or len(scores) != count or
        any(type(x) not in (float, int) or not math.isfinite(x) or not 0 <= x <= 1 for x in scores)):
        raise ValueError('invalid-scores')
    return sorted(range(count), key=lambda i: (-scores[i], i))


def worker(snapshot, case):
    # Only a previously reviewed official pinned snapshot, entirely offline.
    path = Path(snapshot).resolve()
    if path.name != REVISION or path.parent.name != 'snapshots':
        raise ValueError('expected-pinned-official-snapshot')
    for required in ['model.safetensors', 'rl_agent_config.json', 'tokenizer', 'encoder']:
        if not (path / required).exists():
            raise ValueError('incomplete-snapshot')
    for config in path.rglob('*.json'):
        if 'auto_map' in json.loads(config.read_text()):
            raise ValueError('remote-code-config-refused')
    from importlib.metadata import version
    if version('laya') != '0.4.12':
        raise ValueError('incorrect-package-version')
    from laya import Agent
    agent = Agent(str(path), device='cpu', backend='eager')
    if not 2 <= len(case['candidates']) <= 32:
        raise ValueError('candidate-budget')
    state = '합성 사용자 질문: ' + case['query'] + '\n공개자료:\n' + '\n'.join(
        f"자료 {i+1}: {c['text']}" for i,c in enumerate(case['candidates']))
    criteria = {str(i+1): f'자료 {i+1}' for i in range(len(case['candidates']))}
    question = '이 질문에 직접 관련된 공개 법령 또는 판례 자료를 고르세요. 법률적 정답 판정이 아닙니다.'
    # Conservative whole-input guard: do not silently truncate long Korean documents.
    # Reserve 512 tokens for format/head markers. Default 1024; explicit max 8192.
    size = len(agent.tok.encode(state + question + json.dumps(criteria, ensure_ascii=False)))
    if size > 8192 - 512:
        raise ValueError('context-overflow-no-truncation')
    result = agent.system_one(state, {'pick': {'type':'choice', 'instructions':question, 'criteria':criteria}}, lang='ko', max_len=8192, head_max_len=512)
    usage = result.get('usage', {})
    if usage.get('truncated') is not False or usage.get('state_tokens_dropped') != 0 or usage.get('options'):
        raise ValueError('context-truncated-or-options-collapsed')
    probabilities = result['answers']['pick']['probabilities']
    if set(probabilities) != set(criteria):
        raise ValueError('invalid-choice-ids')
    return [probabilities[str(i+1)] for i in range(len(criteria))]


def evaluate(snapshot, timeout):
    cases = json.loads((ROOT / 'fixtures.json').read_text())
    rows = []
    for case in cases:
        count = len(case['candidates'])
        before = list(range(count)); after = before; status = 'unconfigured'
        start = time.perf_counter()
        if snapshot:
            # Remove inherited credentials and force offline model loading.
            env = {k:v for k,v in os.environ.items() if k in ('PATH','LANG','LD_LIBRARY_PATH')}
            env.update(HF_HUB_OFFLINE='1', TRANSFORMERS_OFFLINE='1', HF_HUB_DISABLE_IMPLICIT_TOKEN='1', HF_HUB_DISABLE_TELEMETRY='1')
            try:
                run = subprocess.run([sys.executable, str(Path(__file__).resolve()), '--worker', snapshot],
                    input=json.dumps(case), capture_output=True, text=True, timeout=timeout, env=env, check=True)
                after = rank(json.loads(run.stdout), count); status = 'measured'
            except subprocess.TimeoutExpired:
                status = 'timeout'
            except (subprocess.CalledProcessError, ValueError, KeyError):
                status = 'failed'
        relevant = set(case['relevant'])
        def metrics(order):
            hits = [case['candidates'][i]['id'] in relevant for i in order]
            return {'top1': int(hits[0]), 'mrr': next((1/(i+1) for i,x in enumerate(hits) if x),0),
                    'recall_at_3':sum(hits[:3])/len(relevant)}
        rows.append({'id':case['id'],'status':status,'baseline':metrics(before),'laya':metrics(after) if status=='measured' else None,
            'rank_changed':after != before, 'order':[case['candidates'][i]['id'] for i in after],
            'cold_process_ms':round((time.perf_counter()-start)*1000,2)})
    times=sorted(r['cold_process_ms'] for r in rows if r['status']=='measured')
    return {'model':'convaiinnovations/laya-multilingual','revision':REVISION,'package':'laya==0.4.12',
        'production_ready':False,'latency_scope':'cold CPU process including model load; not warm service latency',
        'measured_count':len(times),'p50_ms':statistics.median(times) if times else None,
        'p95_ms':times[math.ceil(len(times)*.95)-1] if times else None,'cases':rows}


if __name__ == '__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--snapshot'); parser.add_argument('--worker'); parser.add_argument('--timeout',type=float,default=30)
    args=parser.parse_args()
    if args.worker:
        print(json.dumps(worker(args.worker,json.load(sys.stdin))))
    else:
        if not 0 < args.timeout <= 60: parser.error('timeout must be in (0,60]')
        print(json.dumps(evaluate(args.snapshot,args.timeout),ensure_ascii=False,indent=2))
