import unittest
from evaluate import rank, evaluate

class EvaluationTests(unittest.TestCase):
    def test_stable_ties(self):
        self.assertEqual(rank([.2,.8,.8],3),[1,2,0])
    def test_invalid_vector(self):
        for value in ([float('nan'),.1], [float('inf'),.1], [-.1,.1], ['.9',.1], [True,.1], [.1]):
            with self.assertRaises(ValueError): rank(value,2)
    def test_no_model_is_not_reported_as_accuracy(self):
        report=evaluate(None,1)
        self.assertEqual(report['measured_count'],0)
        self.assertTrue(all(row['laya'] is None and not row['rank_changed'] for row in report['cases']))

if __name__ == '__main__': unittest.main()
