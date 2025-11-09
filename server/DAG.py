from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Dict, List, Literal, Optional, Tuple, Union

import networkx as nx
import numpy as np


# ================================
# Errors
# ================================
class PipelineError(Exception):
    """Raised for invalid graphs, unknown node kinds, arity problems, etc."""


# ================================
# Type system for nodes
# ================================
NodeInput = Union[None, Any, List[Any]]
NodeOutput = Any
NodeFn = Callable[[NodeInput, Dict[str, Any]], NodeOutput]


@dataclass(frozen=True)
class NodeType:
    """Declarative node type (kind) with arity constraints and a callable."""
    kind: str
    fn: NodeFn
    min_inputs: int = 0
    max_inputs: Optional[int] = None  # None = unbounded

    def validate_arity(self, n_inputs: int, node_id: str) -> None:
        if n_inputs < self.min_inputs:
            raise PipelineError(
                f"Node '{node_id}' (kind='{self.kind}') expects >= {self.min_inputs} input(s); "
                f"got {n_inputs}."
            )
        if self.max_inputs is not None and n_inputs > self.max_inputs:
            raise PipelineError(
                f"Node '{node_id}' (kind='{self.kind}') expects <= {self.max_inputs} input(s); "
                f"got {n_inputs}."
            )


@dataclass
class Node:
    """Generic node instance with parameters."""
    node_id: str
    node_type: NodeType
    params: Dict[str, Any]


# ================================
# Built-in node functions (minimal)
# ================================
def _fn_identity(inp: NodeInput, _params: Dict[str, Any]) -> NodeOutput:
    """Pass-through (returns input unchanged)."""
    return inp

def _fn_dataset(_inp: NodeInput, params: Dict[str, Any]) -> np.ndarray:
    """Generate a random 3D volume (default shape: 6x64x64)."""
    shape = tuple(params.get("shape", (6, 64, 64)))
    seed = int(params.get("seed", 0))
    rng = np.random.default_rng(seed)
    return rng.random(shape, dtype=np.float32)

def _fn_concat(inp: NodeInput, _params: Dict[str, Any]) -> np.ndarray:
    """Concat multiple arrays along axis=0."""
    if not isinstance(inp, list) or len(inp) < 2:
        raise PipelineError("concat expects a list of >=2 inputs")
    # Basic consistency checks
    arrs = [np.asarray(a) for a in inp]
    yx = {(a.shape[1], a.shape[2]) for a in arrs if a.ndim >= 3}
    if len(yx) > 1:
        raise PipelineError("concat inputs must share (Y, X) dimensions")
    return np.concatenate(arrs, axis=0)

def _fn_segmentation(inp: NodeInput, params: Dict[str, Any]) -> np.ndarray:
    """Trivial threshold segmentation on a numeric array."""
    if not isinstance(inp, np.ndarray):
        raise PipelineError("segmentation expects a numpy array")
    thr = float(params.get("threshold", 0.5))
    return (inp >= thr).astype(np.uint8)

# Per your request, these just return the input
def _fn_structural_descriptor(inp: NodeInput, _params: Dict[str, Any]) -> NodeOutput:
    return inp

def _fn_simulation(inp: NodeInput, _params: Dict[str, Any]) -> NodeOutput:
    return inp


# ================================
# Registry of node kinds
# ================================
REGISTRY: Dict[str, NodeType] = {
    "identity": NodeType("identity", _fn_identity, min_inputs=1, max_inputs=1),
    "dataset": NodeType("dataset", _fn_dataset, min_inputs=0, max_inputs=0),
    "concat": NodeType("concat", _fn_concat, min_inputs=2, max_inputs=None),
    "segmentation": NodeType("segmentation", _fn_segmentation, min_inputs=1, max_inputs=1),
    "structural-descriptor": NodeType("structural-descriptor", _fn_structural_descriptor, min_inputs=1, max_inputs=1),
    "simulation": NodeType("simulation", _fn_simulation, min_inputs=1, max_inputs=1),
}


# ================================
# Function 1: Simplify React Flow JSON
# ================================
def simplify_reactflow_json(reactflow_json: Dict[str, Any]) -> Dict[str, Any]:
    """
    Convert a React Flow graph to a minimal, NetworkX-friendly form:
      {
        "nodes": [{"id": str, "kind": str, "params": dict}],
        "edges": [{"source": str, "target": str}]
      }

    Supported layouts:
    - Top-level: { "nodes": [...], "edges": [...] }
    - Nested: { "pipeline": { "nodes": [...], "edges": [...] } }
    """
    # Accept both top-level and nested "pipeline"
    container = reactflow_json.get("pipeline", reactflow_json)

    raw_nodes = container.get("nodes", [])
    raw_edges = container.get("edges", [])

    nodes: List[Dict[str, Any]] = []
    edges: List[Dict[str, str]] = []

    def _extract_kind(n: Dict[str, Any]) -> Optional[str]:
        data = n.get("data", {})
        # Common variants people use on the front-end
        return (
            data.get("kind")
            or data.get("type")
            or n.get("kind")
            or n.get("type")
        )

    def _extract_params(n: Dict[str, Any]) -> Dict[str, Any]:
        data = n.get("data", {})
        params = data.get("params", n.get("params", {}))
        if params is None:
            params = {}
        if not isinstance(params, dict):
            raise PipelineError(f"Node '{n.get('id')}' params must be a dict.")
        return params

    # Normalize nodes
    seen_ids = set()
    for n in raw_nodes:
        nid = str(n.get("id"))
        if not nid or nid == "None":
            raise PipelineError("Each node must have a non-empty string 'id'.")
        if nid in seen_ids:
            raise PipelineError(f"Duplicate node id '{nid}'.")
        seen_ids.add(nid)

        kind = _extract_kind(n)
        params = _extract_params(n)

        nodes.append({
            "id": nid,
            "kind": kind,
            "params": params,
        })

    # Normalize edges
    for e in raw_edges:
        src = e.get("source")
        tgt = e.get("target")
        if not src or not tgt:
            raise PipelineError("Each edge must include 'source' and 'target'.")
        edges.append({"source": str(src), "target": str(tgt)})

    return {"nodes": nodes, "edges": edges}


# ================================
# Function 2: Build, validate, execute
# ================================
@dataclass
class ExecutionResult:
    graph: nx.DiGraph
    order: List[str]
    outputs: Dict[str, Any]
    sources: List[str]
    sinks: List[str]
    execution_strategy: str  # human-readable label


def execute_simplified_graph(
    simplified: Dict[str, Any],
    *,
    strategy: Literal["kahn", "dfs"] = "kahn",
    registry: Dict[str, NodeType] = REGISTRY,
) -> ExecutionResult:
    """
    Build a DiGraph from a simplified spec, validate and execute it.

    Validations:
    - unique node ids
    - all edges point to existing nodes
    - graph is a DAG (report a sample cycle if not)
    - every node kind exists in the registry
    - node input arity matches NodeType constraints
    - params are dictionaries

    Execution:
    - topological order; strategy controls *how* we derive the topo order:
        - "kahn" -> breadth-first style (Kahn's algorithm)
        - "dfs"  -> depth-first style (reverse postorder from DFS)
    - each node receives:
        - None if it has 0 predecessors
        - the single predecessor's output if it has 1 predecessor
        - a list of predecessor outputs if >1 predecessors
    """
    # ---- Build graph ----
    G = nx.DiGraph()
    node_ids = [n["id"] for n in simplified.get("nodes", [])]

    # Uniqueness check (already in simplify, but keep it here if caller bypassed simplify)
    if len(set(node_ids)) != len(node_ids):
        raise PipelineError("Duplicate node ids in simplified graph.")

    for n in simplified.get("nodes", []):
        nid = n["id"]
        kind = n.get("kind")
        params = n.get("params", {})
        if params is None or not isinstance(params, dict):
            raise PipelineError(f"Node '{nid}' params must be a dict.")
        G.add_node(nid, kind=kind, params=params)

    for e in simplified.get("edges", []):
        src, tgt = e["source"], e["target"]
        if src not in G or tgt not in G:
            raise PipelineError(f"Edge refers to missing node: {src} -> {tgt}")
        G.add_edge(src, tgt)

    # ---- DAG validation ----
    if not nx.is_directed_acyclic_graph(G):
        try:
            cyc = nx.find_cycle(G, orientation="original")
        except Exception:
            cyc = []
        raise PipelineError(f"Pipeline must be a DAG. Found cycle: {cyc}")

    # ---- Node-type validation ----
    for nid, data in G.nodes(data=True):
        kind = data.get("kind")
        if not kind:
            raise PipelineError(f"Node '{nid}' is missing 'kind'.")
        if kind not in registry:
            raise PipelineError(f"Node '{nid}' has unknown kind '{kind}'.")
        # Pre-validate arity
        n_inputs = G.in_degree(nid)
        registry[kind].validate_arity(n_inputs, nid)

    # ---- Sources / sinks ----
    sources = [n for n in G.nodes if G.in_degree(n) == 0]
    sinks = [n for n in G.nodes if G.out_degree(n) == 0]
    if len(G) == 0:
        raise PipelineError("Graph is empty.")
    if len(sinks) == 0:
        raise PipelineError("Graph has no terminal (sink) nodes.")

    # ---- Choose topological order ----
    if strategy == "kahn":
        order = list(nx.topological_sort(G))  # Kahn-like breadth-y behavior
        strategy_label = "breadth-first topological (Kahn)"
    elif strategy == "dfs":
        # Reverse postorder of DFS over all components gives a valid topo order in a DAG
        order = []
        seen: set = set()
        for src in sources:
            for n in nx.dfs_postorder_nodes(G, source=src):
                if n not in seen:
                    seen.add(n)
                    order.append(n)
        # Include any isolated/remaining nodes not reachable from listed sources
        for n in nx.dfs_postorder_nodes(G):
            if n not in seen:
                seen.add(n)
                order.append(n)
        order = order  # already postorder collection
        strategy_label = "depth-first topological (DFS postorder)"
    else:
        raise PipelineError(f"Unknown execution strategy: {strategy}")

    # ---- Execute in order ----
    # Create Node wrappers bound to the registry
    node_objs: Dict[str, Node] = {}
    for nid in order:
        k = G.nodes[nid]["kind"]
        p = G.nodes[nid]["params"]
        node_objs[nid] = Node(node_id=nid, node_type=registry[k], params=p)

    outputs: Dict[str, Any] = {}
    for nid in order:
        preds = list(G.predecessors(nid))
        node = node_objs[nid]
        # assemble input
        if len(preds) == 0:
            node_input: NodeInput = None
        elif len(preds) == 1:
            node_input = outputs[preds[0]]
        else:
            node_input = [outputs[p] for p in preds]
        # arity already checked, but do a final assert before call
        node.node_type.validate_arity(len(preds), nid)
        outputs[nid] = node.node_type.fn(node_input, node.params)

    return ExecutionResult(
        graph=G,
        order=order,
        outputs=outputs,
        sources=sources,
        sinks=sinks,
        execution_strategy=strategy_label,
    )


# ================================
# (Optional) tiny helper to load JSON and run
# ================================
def load_reactflow_and_run(path: str, strategy: Literal["kahn", "dfs"] = "kahn") -> ExecutionResult:
    with open(path, "r", encoding="utf-8") as f:
        rf = json.load(f)
    simplified = simplify_reactflow_json(rf)
    return execute_simplified_graph(simplified, strategy=strategy)
