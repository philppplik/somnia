import importlib.util
import os
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('native_sampler', Path(__file__).with_name('native-process.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class NativeSamplerTest(unittest.TestCase):
    def test_reads_actual_test_process_not_somnia(self):
        snapshot = module.tree_snapshot(os.getpid())
        self.assertIn(os.getpid(), snapshot['pids'])
        self.assertGreater(snapshot['rssBytes'], 0)
        self.assertGreater(snapshot['clockTicksPerSecond'], 0)

    def test_missing_pid_is_not_a_zero_memory_sample(self):
        with self.assertRaises(RuntimeError):
            module.tree_snapshot(999999999)


if __name__ == '__main__':
    unittest.main()
