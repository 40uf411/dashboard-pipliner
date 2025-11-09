"""Bindings between the Alger server and the DAG execution engine."""

from __future__ import annotations

import json
from typing import Any, Dict, Literal, Tuple

import numpy as np

from .dag import ExecutionResult, PipelineError, execute_simplified_graph, simplify_reactflow_json


def run_graph(
    graph_payload: Dict[str, Any],
    *,
    strategy: Literal["kahn", "dfs"] = "kahn",
) -> Tuple[ExecutionResult, Dict[str, Any]]:
    """Execute a graph payload and return both the raw result and a summary."""
    simplified = simplify_reactflow_json(graph_payload)
    result = execute_simplified_graph(simplified, strategy=strategy)
    summary = summarize_execution(result)
    return result, summary


def summarize_execution(result: ExecutionResult) -> Dict[str, Any]:
    """Produce a JSON-friendly snapshot of the DAG execution."""
    sinks = {
        sink: _describe_value(result.outputs.get(sink)) for sink in result.sinks if sink in result.outputs
    }
    return {
        "strategy": result.execution_strategy,
        "order": result.order,
        "sources": result.sources,
        "sinks": sinks,
    }


def _describe_value(value: Any) -> Dict[str, Any]:
    if value is None:
        return {"type": "none"}
    if isinstance(value, (str, int, float, bool)):
        return {"type": type(value).__name__, "value": value}
    if isinstance(value, dict):
        return {"type": "dict", "keys": list(value.keys()), "size": len(value)}
    if isinstance(value, list):
        return {"type": "list", "length": len(value)}
    if isinstance(value, np.ndarray):
        return {
            "type": "ndarray",
            "shape": list(value.shape),
            "dtype": str(value.dtype),
            "min": float(np.min(value)),
            "max": float(np.max(value)),
            "mean": float(np.mean(value)),
        }
    return {"type": type(value).__name__, "repr": repr(value)[:200]}


def encode_summary(summary: Dict[str, Any]) -> str:
    return json.dumps(summary)


def decode_summary(payload: str | None) -> Dict[str, Any]:
    if not payload:
        return {}
    try:
        return json.loads(payload)
    except json.JSONDecodeError:
        return {"raw": payload}
