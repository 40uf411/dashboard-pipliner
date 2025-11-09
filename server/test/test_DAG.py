"""Regression tests for DAG pipeline execution utilities with profiling."""

from __future__ import annotations

import json
import os
import statistics
import sys
import unittest
from collections import defaultdict
from pathlib import Path
from time import perf_counter
from typing import Any, Dict, List, Tuple

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

import numpy as np

from app.dag import (
    ExecutionResult,
    execute_simplified_graph,
    simplify_reactflow_json,
)

TEST_DIR = Path(__file__).parent
FIXTURE_PATH = TEST_DIR / "test_DAG.json"
# Verbose flag defaults to on for test runs but can be disabled via env.
VERBOSE_MODE = bool(int(os.environ.get("DAG_TEST_VERBOSE", "1")))

PROFILE_DATA = {
    "node_type": defaultdict(list),
    "strategy": defaultdict(list),
}


def load_fixture_graph() -> Dict[str, Any]:
    with FIXTURE_PATH.open("r", encoding="utf-8") as fh:
        payload = json.load(fh)
    return simplify_reactflow_json(payload)


def summarize_value(value: Any) -> str:
    if value is None:
        return "None"
    if isinstance(value, np.ndarray):
        shape = "x".join(str(dim) for dim in value.shape)
        try:
            min_v = float(value.min())
            max_v = float(value.max())
        except ValueError:
            min_v = max_v = float("nan")
        return (
            f"ndarray(shape={shape}, dtype={value.dtype}, "
            f"min={min_v:.4f}, max={max_v:.4f})"
        )
    if isinstance(value, list):
        preview = ", ".join(summarize_value(v) for v in value[:3])
        suffix = ", ..." if len(value) > 3 else ""
        return f"list(len={len(value)} [{preview}{suffix}])"
    if isinstance(value, dict):
        keys = list(value.keys())
        preview = ", ".join(keys[:4])
        suffix = ", ..." if len(keys) > 4 else ""
        return f"dict(keys=[{preview}{suffix}])"
    return f"{type(value).__name__}({value})"


def emit_verbose_report(
    simplified: Dict[str, Any],
    trace: List[Dict[str, Any]],
    strategy: str,
    total_seconds: float,
) -> None:
    print(
        f"\n[Pipeline] strategy={strategy} nodes={len(simplified.get('nodes', []))} "
        f"edges={len(simplified.get('edges', []))} total={total_seconds * 1000:.3f}ms"
    )
    for entry in trace:
        print(
            f"  - {entry['node_id']} ({entry['kind']}): "
            f"inputs={entry['n_inputs']} "
            f"{entry['input_summary']} -> {entry['output_summary']} "
            f"[{entry['duration_ms']:.3f} ms]"
        )
    print("")


def render_bar(value: float, max_value: float, width: int = 40) -> str:
    if max_value <= 0:
        return ""
    filled = int((value / max_value) * width)
    return "#" * max(filled, 1)


def report_profile() -> None:
    if not PROFILE_DATA["node_type"]:
        return

    print("\n[Profiling] Average execution time per node type (ms)")
    node_avgs = {
        kind: statistics.mean(times) * 1000 for kind, times in PROFILE_DATA["node_type"].items()
    }
    max_node = max(node_avgs.values())
    for kind, avg_ms in sorted(node_avgs.items(), key=lambda item: item[1], reverse=True):
        print(f"  {kind:24s} {avg_ms:8.3f} ms {render_bar(avg_ms, max_node)}")

    print("\n[Profiling] Average total execution time per strategy (ms)")
    strategy_avgs = {
        strat: statistics.mean(times) * 1000
        for strat, times in PROFILE_DATA["strategy"].items()
    }
    max_strategy = max(strategy_avgs.values())
    for strat, avg_ms in sorted(strategy_avgs.items(), key=lambda item: item[1]):
        print(f"  {strat:8s} {avg_ms:8.3f} ms {render_bar(avg_ms, max_strategy)}")
    print("")


class DAGPipelineTests(unittest.TestCase):
    fixture_graph: Dict[str, Any]
    VERBOSE = VERBOSE_MODE

    @classmethod
    def setUpClass(cls) -> None:
        cls.fixture_graph = load_fixture_graph()

    @classmethod
    def tearDownClass(cls) -> None:
        report_profile()
        print(
            "\nDAG regression summary:\n"
            " • Reference pipeline executes with detailed per-node timing.\n"
            " • Filter nodes preserve tensor shapes and value constraints.\n"
            " • DFS and Kahn strategies yield identical sink outputs.\n"
        )

    def _run_graph(
        self,
        simplified: Dict[str, Any],
        *,
        strategy: str = "kahn",
        verbose: bool | None = None,
    ) -> Tuple[ExecutionResult, List[Dict[str, Any]], float]:
        trace: List[Dict[str, Any]] = []
        verbose_flag = self.VERBOSE if verbose is None else verbose

        def observer(node_id, node, node_input, output, duration, predecessors) -> None:
            entry = {
                "node_id": node_id,
                "kind": node.node_type.kind,
                "n_inputs": len(predecessors),
                "duration_ms": duration * 1000,
                "input_summary": summarize_value(node_input),
                "output_summary": summarize_value(output),
            }
            trace.append(entry)
            PROFILE_DATA["node_type"][node.node_type.kind].append(duration)

        start = perf_counter()
        result = execute_simplified_graph(
            simplified,
            strategy=strategy,
            verbose=verbose_flag,
            observer=observer,
        )
        total = perf_counter() - start
        PROFILE_DATA["strategy"][strategy].append(total)
        if verbose_flag:
            emit_verbose_report(simplified, trace, strategy, total)
        return result, trace, total

    def test_fixture_pipeline_executes(self) -> None:
        """Ensure the sample React Flow export runs end-to-end."""
        result, trace, _ = self._run_graph(self.fixture_graph, strategy="kahn")
        self.assertGreaterEqual(len(trace), len(self.fixture_graph["nodes"]))

        # Expected sinks exist
        self.assertIn("fig", result.outputs)
        self.assertIn("log", result.outputs)

        figure_payload = result.outputs["fig"]
        self.assertIsInstance(figure_payload, dict)
        self.assertIn("data", figure_payload)
        self.assertIn("channel_stats", figure_payload["data"])

        log_payload = result.outputs["log"]
        self.assertIsInstance(log_payload, str)
        self.assertIn("LOG:", log_payload)

    def test_filter_node_preserves_shape(self) -> None:
        """A dedicated graph exercising the filter node keeps spatial shape."""
        simplified = {
            "nodes": [
                {
                    "id": "ds",
                    "kind": "dataset",
                    "params": {"shape": (1, 3, 3), "seed": 7},
                },
                {
                    "id": "flt",
                    "kind": "filter",
                    "params": {"kernelSize": 3},
                },
            ],
            "edges": [{"source": "ds", "target": "flt"}],
        }
        result, trace, _ = self._run_graph(simplified, verbose=False)
        filtered = result.outputs["flt"]
        self.assertIsInstance(filtered, np.ndarray)
        self.assertEqual(filtered.shape, (1, 3, 3))
        self.assertTrue(np.all(filtered >= 0.0))
        self.assertEqual(len(trace), 2)

    def test_dfs_strategy_matches_kahn(self) -> None:
        """The alternative DFS strategy should produce identical sink outputs."""
        kahn, *_ = self._run_graph(self.fixture_graph, strategy="kahn")
        dfs, *_ = self._run_graph(self.fixture_graph, strategy="dfs")

        self.assertEqual(kahn.outputs["log"], dfs.outputs["log"])
        self.assertEqual(kahn.outputs["fig"], dfs.outputs["fig"])


if __name__ == "__main__":
    unittest.main()
