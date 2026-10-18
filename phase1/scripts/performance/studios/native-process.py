#!/usr/bin/env python3
"""Linux process-tree sampler. Run next to native Somnia; no per-studio attribution."""
import argparse
import json
import os
import time
from pathlib import Path


def tree_snapshot(pid, proc=Path('/proc')):
    rows = {}
    for directory in proc.iterdir():
        if not directory.name.isdigit():
            continue
        try:
            # comm may contain spaces or parentheses, so split after its final ')'.
            stat = (directory / 'stat').read_text().rsplit(')', 1)[1].split()
            rows[int(directory.name)] = (int(stat[1]), int(stat[11]) + int(stat[12]),
                                         int(stat[21]) * os.sysconf('SC_PAGE_SIZE'))
        except (OSError, ValueError, IndexError):
            continue
    if pid not in rows:
        raise RuntimeError('Root PID is absent; refusing an empty memory result')
    owners = {pid}
    while True:
        before = len(owners)
        owners.update(p for p, (parent, _, _) in rows.items() if parent in owners)
        if len(owners) == before:
            break
    return {'pids': sorted(owners), 'rssBytes': sum(rows[p][2] for p in owners),
            'cpuTicks': sum(rows[p][1] for p in owners),
            'clockTicksPerSecond': os.sysconf('SC_CLK_TCK')}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pid', type=int, required=True)
    parser.add_argument('--studio', required=True, choices=['code', 'documents', 'sheets', 'slides',
                         'photos', 'sound', 'video', 'design', 'vector', 'vibespace', 'shell'])
    parser.add_argument('--seconds', type=int, default=60)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    if not 1 <= args.seconds <= 3600:
        parser.error('seconds must be 1-3600')
    samples = []
    for _ in range(args.seconds + 1):
        samples.append({'monotonicSeconds': time.monotonic(), **tree_snapshot(args.pid)})
        if len(samples) <= args.seconds:
            time.sleep(1)
    # The process tree can lose children between samples: negative counter deltas are
    # unknown, never zero idle CPU. This is not an exclusive studio/RSS quota.
    cpu = []
    for a, b in zip(samples, samples[1:]):
        same_owners = a['pids'] == b['pids']
        delta = b['cpuTicks'] - a['cpuTicks']
        cpu.append(100 * delta / b['clockTicksPerSecond'] / (b['monotonicSeconds'] - a['monotonicSeconds'])
                   if same_owners and delta >= 0 else None)
    report = {'schemaVersion': 1, 'studioLabel': args.studio, 'rootPid': args.pid,
              'scope': 'Linux whole native PID tree RSS; shared pages may repeat, not exclusive studio/private/GPU memory',
              'cpuScope': 'Percent of one logical core, null if PID ownership changes',
              'samples': samples, 'cpuPercentOneCore': cpu}
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, indent=2) + '\n')


if __name__ == '__main__':
    main()
