import hashlib
import json
from pathlib import Path
from tempfile import TemporaryDirectory
from types import SimpleNamespace
import unittest
from unittest.mock import Mock, patch
from evaluate import REVISION, MODEL, rank, evaluate, score_case, validate_snapshot


CASE = {'query':'근로시간', 'candidates':[{'id':'a','text':'공개 조문'}, {'id':'b','text':'공개 판례'}], 'relevant':['a']}


def fake_agent(usage=None, probabilities=None, tokens=100):
    return SimpleNamespace(tok=SimpleNamespace(encode=lambda _:range(tokens)), system_one=Mock(return_value={
        'usage':usage if usage is not None else {'truncated':False,'state_tokens_dropped':0},
        'answers':{'pick':{'probabilities':probabilities if probabilities is not None else {'1':.3,'2':.7}}}}))


class EvaluationTests(unittest.TestCase):
    def test_stable_ties(self):
        self.assertEqual(rank([.2,.8,.8],3),[1,2,0])

    def test_invalid_vector(self):
        for value in ([float('nan'),.1], [float('inf'),.1], [-.1,.1], ['.9',.1], [True,.1], [.1]):
            with self.assertRaises(ValueError): rank(value,2)

    def test_no_model_is_not_reported_as_accuracy(self):
        report=evaluate(None,1)
        self.assertEqual(report['measured_count'],0)
        self.assertIsNone(report['laya_mean'])
        self.assertTrue(all(row['laya'] is None and not row['rank_changed'] for row in report['cases']))

    def test_long_document_rejected_before_inference(self):
        agent=fake_agent(tokens=8000)
        with self.assertRaisesRegex(ValueError,'context-overflow'):
            score_case(agent,CASE)
        agent.system_one.assert_not_called()

    def test_actual_usage_truncation_or_option_collapse_rejected(self):
        for usage in ({'truncated':True,'state_tokens_dropped':12}, {},
                      {'truncated':False,'state_tokens_dropped':0,'options':{'pick':{'distinct':1}}}):
            with self.subTest(usage=usage), self.assertRaisesRegex(ValueError,'context-truncated'):
                score_case(fake_agent(usage=usage),CASE)

    def test_multilingual_budget_and_source_text_preserved(self):
        agent=fake_agent()
        self.assertEqual(score_case(agent,CASE),[.3,.7])
        args,kwargs=agent.system_one.call_args
        self.assertIn('공개 판례',args[0])
        self.assertEqual(kwargs,{'lang':'ko','max_len':8192,'head_max_len':512})
        self.assertIn('instructions',args[1]['pick'])

    def test_malformed_choice_ids_and_probabilities_refused(self):
        for probs in ({'01':.2,'2':.8},{'1':.8},{'1':float('nan'),'2':.8},{'1':0,'2':0},{'1':1,'2':1}):
            with self.assertRaises(ValueError): score_case(fake_agent(probabilities=probs),CASE)

    def test_timeout_preserves_original_order_and_removes_credentials(self):
        import subprocess
        with patch.dict('os.environ',{'HF_TOKEN':'synthetic-secret','TYPESAFE_API_KEY':'synthetic-secret'}), patch('evaluate.subprocess.run',side_effect=subprocess.TimeoutExpired('worker',.1)) as run:
            report=evaluate('/synthetic/snapshot',.1)
        self.assertTrue(all(r['status']=='timeout' and r['laya'] is None and not r['rank_changed'] for r in report['cases']))
        env=run.call_args.kwargs['env']
        self.assertNotIn('HF_TOKEN',env);self.assertNotIn('TYPESAFE_API_KEY',env)
        self.assertEqual(env['HF_HUB_OFFLINE'],'1')

    def test_snapshot_requires_manifest_and_verifies_content(self):
        with TemporaryDirectory() as tmp:
            root=Path(tmp)/'snapshots'/REVISION;root.mkdir(parents=True)
            with self.assertRaisesRegex(ValueError,'reviewed-manifest-required'):
                validate_snapshot(str(root),None)
            files={'model.safetensors':b'synthetic test bytes, never loaded','rl_agent_config.json':b'{}',
                   'tokenizer/tokenizer_config.json':b'{}','encoder/config.json':b'{}'}
            for rel,body in files.items():
                target=root/rel;target.parent.mkdir(exist_ok=True);target.write_bytes(body)
            manifest=Path(tmp)/'manifest.json'
            manifest.write_text(json.dumps({'repository':MODEL,'revision':REVISION,
                'files':{rel:hashlib.sha256(body).hexdigest() for rel,body in files.items()}}))
            self.assertEqual(validate_snapshot(str(root),str(manifest))[0],root)
            (root/'model.safetensors').write_bytes(b'changed')
            with self.assertRaisesRegex(ValueError,'artifact-digest-mismatch'):
                validate_snapshot(str(root),str(manifest))


if __name__ == '__main__': unittest.main()
