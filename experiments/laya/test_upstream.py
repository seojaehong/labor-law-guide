"""Actual installed Laya formatter, synthetic character tokenizer, NO model weights.

This verifies truncation accounting/API behavior, not Korean tokenization or relevance.
"""
import importlib.util
import unittest


class CharacterTokenizer:
    mask_token = '[MASK]'
    mask_token_id = 1
    cls_token_id = 2
    sep_token_id = 3
    def __call__(self, text, **kwargs):
        ids=[ord(char)+10 for char in text]
        if kwargs.get('truncation'): ids=ids[:kwargs['max_length']]
        return {'input_ids':ids}


@unittest.skipUnless(importlib.util.find_spec('laya'), 'pinned Laya environment required')
class UpstreamFormattingTests(unittest.TestCase):
    def test_public_document_tail_loss_reported_at_1024_and_preserved_at_8192(self):
        from laya.common import build_sequence
        tok=CharacterTokenizer()
        q={'t':'choice','ins':'자료 선택','crit':{'1':'자료 1','2':'자료 2'}}
        # Synthetic long Korean text; decisive suffix is intentionally at the tail.
        state='공개 법령 문단. '*250+'주40시간'
        short=build_sequence(tok,state,q,max_len=1024,head_max_len=512,return_stats=True,return_truncation_stats=True)
        long=build_sequence(tok,state,q,max_len=8192,head_max_len=512,return_stats=True,return_truncation_stats=True)
        self.assertTrue(short[3]['truncated'])
        self.assertFalse(long[3]['truncated'])
        self.assertEqual(long[3]['state_tokens_dropped'],0)
        self.assertEqual(long[0][-6:-1],[ord(c)+10 for c in '주40시간'])


if __name__ == '__main__': unittest.main()
