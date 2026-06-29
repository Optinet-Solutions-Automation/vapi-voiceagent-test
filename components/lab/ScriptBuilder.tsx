"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  MarkerType,
  addEdge,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type Connection,
  type NodeProps,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  listScripts,
  createScript,
  deleteScript,
  getScriptGraph,
  saveScriptGraph,
  listHandlers,
  listCollections,
  getLabSettings,
  saveLabSettings,
} from "@/lib/lab-db";
import type { ListenerScript, ListenerHandler, ListenerCollection } from "@/lib/database.types";

// ── Content types a Step box can hold ─────────────────────────
type Content = "scenario" | "collection" | "subworkflow" | "noop" | "send_sms" | "transfer" | "end";

const CONTENT_META: Record<Content, { label: string; color: string; terminal?: boolean }> = {
  scenario: { label: "Scenario", color: "border-indigo-500 bg-indigo-500/10" },
  collection: { label: "Collection", color: "border-fuchsia-500 bg-fuchsia-500/10" },
  subworkflow: { label: "Sub-workflow", color: "border-teal-500 bg-teal-500/10" },
  noop: { label: "No-op", color: "border-gray-500 bg-gray-500/10" },
  send_sms: { label: "Send SMS", color: "border-amber-500 bg-amber-500/10" },
  transfer: { label: "Transfer", color: "border-orange-500 bg-orange-500/10", terminal: true },
  end: { label: "End Call", color: "border-rose-500 bg-rose-500/10", terminal: true },
};

type Kind = "start" | "step";

type NodeData = {
  kind: Kind;
  label: string;
  scenarioId: string | null;
  config: Record<string, unknown>;
  // display helpers (not persisted directly)
  subtitle?: string | null;
};

// ── Custom node ───────────────────────────────────────────────
function FlowNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  const isStart = d.kind === "start";
  const content = (d.config.contentType as Content) ?? "scenario";
  const meta = isStart
    ? { label: "Start", color: "border-emerald-500 bg-emerald-500/10", terminal: false }
    : CONTENT_META[content];
  return (
    <div
      className={`min-w-[160px] max-w-[230px] rounded-lg border-2 px-3 py-2 text-left shadow ${meta.color} ${
        selected ? "ring-2 ring-white/60" : ""
      }`}
    >
      {!isStart && <Handle type="target" position={Position.Top} />}
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-300">{meta.label}</p>
      <p className="truncate text-sm font-medium text-white">{d.label || meta.label}</p>
      {d.subtitle && <p className="mt-0.5 truncate text-[11px] text-gray-400">{d.subtitle}</p>}
      {!meta.terminal && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
const nodeTypes = { lab: FlowNode };

const inputCls =
  "w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none";

// ── Normalisation: map legacy node/edge shapes to the new model ──
function legacyToContent(type: string): Content | null {
  switch (type) {
    case "say":
    case "switch":
      return "scenario";
    case "send_sms":
      return "send_sms";
    case "transfer":
      return "transfer";
    case "end":
      return "end";
    case "set_variable":
      return "noop";
    default:
      return null;
  }
}

type EdgeCond = { kind: "plain" | "branch" | "loop"; by?: string; value?: string; maxLoops?: number };
function normalizeCondition(c: Record<string, unknown> | undefined): EdgeCond {
  const k = (c?.kind as string) ?? "plain";
  if (k === "plain" || k === "branch" || k === "loop") return c as EdgeCond;
  if (k === "always") return { kind: "plain" };
  if (k === "intent") return { kind: "branch", by: "intent", value: c?.value as string };
  if (k === "tag") return { kind: "branch", by: "tag", value: c?.value as string };
  if (k === "else") return { kind: "branch", by: "else" };
  return { kind: "plain" };
}

type Props = { onClose: () => void };

export default function ScriptBuilder({ onClose }: Props) {
  const [scripts, setScripts] = useState<ListenerScript[]>([]);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ListenerHandler[]>([]);
  const [collections, setCollections] = useState<ListenerCollection[]>([]);
  const [activeScriptId, setActiveScriptId] = useState<string | null>(null);

  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selNodeId, setSelNodeId] = useState<string | null>(null);
  const [selEdgeId, setSelEdgeId] = useState<string | null>(null);
  const [rf, setRf] = useState<ReactFlowInstance<Node, Edge> | null>(null);

  const [newName, setNewName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const allTags = useMemo(
    () => Array.from(new Set(scenarios.flatMap((s) => s.tags ?? []).filter(Boolean))).sort(),
    [scenarios]
  );

  const scenarioName = useCallback(
    (id: string | null) => (id ? scenarios.find((s) => s.id === id)?.name ?? null : null),
    [scenarios]
  );
  const collectionName = useCallback(
    (id: string | undefined) => (id ? collections.find((c) => c.id === id)?.name ?? null : null),
    [collections]
  );
  const scriptName = useCallback(
    (id: string | undefined) => (id ? scripts.find((s) => s.id === id)?.name ?? null : null),
    [scripts]
  );

  function subtitleFor(d: NodeData): string | null {
    if (d.kind === "start") return (d.config.mode as string) === "wait_for_customer" ? "waits for caller" : "agent opens";
    const c = (d.config.contentType as Content) ?? "scenario";
    if (c === "scenario") return scenarioName(d.scenarioId) ? `▶ ${scenarioName(d.scenarioId)}` : "(pick a scenario)";
    if (c === "collection") return collectionName(d.config.collectionId as string) ? `▣ ${collectionName(d.config.collectionId as string)}` : "(pick a collection)";
    if (c === "subworkflow") return scriptName(d.config.subworkflowId as string) ? `⤳ ${scriptName(d.config.subworkflowId as string)}` : "(pick a workflow)";
    if (c === "transfer") return (d.config.number as string) || "(phone number)";
    return null;
  }

  useEffect(() => {
    (async () => {
      try {
        const [scs, hs, cols, settings] = await Promise.all([
          listScripts(),
          listHandlers(),
          listCollections(),
          getLabSettings(),
        ]);
        setScripts(scs);
        setScenarios(hs);
        setCollections(cols);
        setActiveScriptId(settings?.active_script_id ?? null);
        if (scs.length && !scriptId) loadScript(scs[0].id);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : "Failed to load — did you run the scripts migration?");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Refresh node subtitles when reference data loads.
  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, data: { ...(n.data as NodeData), subtitle: subtitleFor(n.data as NodeData) } })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarios, collections, scripts]);

  function graphToFlow(g: Awaited<ReturnType<typeof getScriptGraph>>): { rfNodes: Node[]; rfEdges: Edge[] } {
    const rfNodes: Node[] = g.nodes.map((n) => {
      const isStart = n.type === "start";
      const cfg = (n.config ?? {}) as Record<string, unknown>;
      if (!isStart && !cfg.contentType) cfg.contentType = legacyToContent(n.type) ?? "scenario";
      const data: NodeData = { kind: isStart ? "start" : "step", label: n.label, scenarioId: n.scenario_id, config: cfg };
      data.subtitle = subtitleFor(data);
      return { id: n.id, type: "lab", position: { x: n.pos_x, y: n.pos_y }, data };
    });
    const rfEdges: Edge[] = g.edges.map((e) => {
      const cond = normalizeCondition(e.condition as Record<string, unknown>);
      return {
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        ...edgeStyle(cond),
        data: { condition: cond },
        markerEnd: { type: MarkerType.ArrowClosed },
      };
    });
    return { rfNodes, rfEdges };
  }

  async function loadScript(id: string) {
    setScriptId(id);
    setSelNodeId(null);
    setSelEdgeId(null);
    try {
      const { rfNodes, rfEdges } = graphToFlow(await getScriptGraph(id));
      setNodes(rfNodes);
      setEdges(rfEdges);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to load script");
    }
  }

  // ── Sub-workflow preview (double-click a sub-workflow box) ──
  const [preview, setPreview] = useState<{ id: string; name: string; nodes: Node[]; edges: Edge[] } | null>(null);
  async function openPreview(subId: string) {
    try {
      const { rfNodes, rfEdges } = graphToFlow(await getScriptGraph(subId));
      setPreview({ id: subId, name: scriptName(subId) ?? "Sub-workflow", nodes: rfNodes, edges: rfEdges });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to open sub-workflow");
    }
  }
  function onNodeDoubleClick(_: React.MouseEvent, n: Node) {
    const d = n.data as NodeData;
    if (d.kind === "step" && (d.config.contentType as Content) === "subworkflow" && d.config.subworkflowId) {
      openPreview(d.config.subworkflowId as string);
    }
  }

  function edgeLabel(c: EdgeCond): string {
    if (c.kind === "plain") return "";
    if (c.kind === "loop") return "loop";
    if (c.by === "else") return "otherwise";
    if (c.by === "intent") return `if intent: ${c.value ?? "?"}`;
    if (c.by === "tag") return `if tag: ${c.value ?? "?"}`;
    if (c.by === "result") return `if result: ${c.value ?? "?"}`;
    return "branch";
  }
  function edgeStyle(c: EdgeCond): Partial<Edge> {
    if (c.kind === "loop")
      return { label: edgeLabel(c), animated: true, style: { stroke: "#f59e0b", strokeDasharray: "5 4" } };
    if (c.kind === "branch") return { label: edgeLabel(c), style: { stroke: "#818cf8" } };
    return { label: "", style: { stroke: "#6b7280" } };
  }

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          { ...c, ...edgeStyle({ kind: "plain" }), data: { condition: { kind: "plain" } }, markerEnd: { type: MarkerType.ArrowClosed } },
          eds
        )
      ),
    [setEdges]
  );

  // ── Add / drag nodes ──
  function addNode(kind: Kind, position?: { x: number; y: number }) {
    const id = crypto.randomUUID();
    const config: Record<string, unknown> = kind === "start" ? { mode: "agent_first" } : { contentType: "scenario" };
    const data: NodeData = { kind, label: kind === "start" ? "Start" : "Step", scenarioId: null, config };
    data.subtitle = subtitleFor(data);
    setNodes((ns) => [...ns, { id, type: "lab", position: position ?? { x: 140 + ns.length * 30, y: 80 + ns.length * 30 }, data }]);
    setSelNodeId(id);
    setSelEdgeId(null);
  }
  function addSubworkflow(subId: string, position?: { x: number; y: number }) {
    const id = crypto.randomUUID();
    const name = scriptName(subId);
    const data: NodeData = {
      kind: "step",
      label: name ? `Run ${name}` : "Sub-workflow",
      scenarioId: null,
      config: { contentType: "subworkflow", subworkflowId: subId },
    };
    data.subtitle = subtitleFor(data);
    setNodes((ns) => [...ns, { id, type: "lab", position: position ?? { x: 140 + ns.length * 30, y: 80 + ns.length * 30 }, data }]);
    setSelNodeId(id);
    setSelEdgeId(null);
  }
  function onDragStartPalette(e: React.DragEvent, payload: string) {
    e.dataTransfer.setData("application/reactflow", payload);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const payload = e.dataTransfer.getData("application/reactflow");
    if (!payload || !rf) return;
    const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    if (payload.startsWith("sub:")) {
      addSubworkflow(payload.slice(4), position);
    } else if (payload === "start" || payload === "step") {
      addNode(payload, position);
    }
  }

  function patchNodeData(id: string, patch: Partial<NodeData>) {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const merged = { ...(n.data as NodeData), ...patch };
        merged.subtitle = subtitleFor(merged);
        return { ...n, data: merged };
      })
    );
  }
  function patchConfig(id: string, patch: Record<string, unknown>) {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as NodeData;
        const merged = { ...d, config: { ...d.config, ...patch } };
        merged.subtitle = subtitleFor(merged);
        return { ...n, data: merged };
      })
    );
  }
  function setEdgeCond(id: string, cond: EdgeCond) {
    setEdges((es) => es.map((e) => (e.id === id ? { ...e, ...edgeStyle(cond), data: { condition: cond } } : e)));
  }

  function deleteSelected() {
    if (selNodeId) {
      setNodes((ns) => ns.filter((n) => n.id !== selNodeId));
      setEdges((es) => es.filter((e) => e.source !== selNodeId && e.target !== selNodeId));
      setSelNodeId(null);
    } else if (selEdgeId) {
      setEdges((es) => es.filter((e) => e.id !== selEdgeId));
      setSelEdgeId(null);
    }
  }

  async function handleSave() {
    if (!scriptId) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const nodeRows = nodes.map((n) => {
        const d = n.data as NodeData;
        return {
          id: n.id,
          type: d.kind, // 'start' | 'step'
          scenario_id: (d.config.contentType ?? "scenario") === "scenario" ? d.scenarioId : null,
          label: d.label,
          config: d.config ?? {},
          pos_x: n.position.x,
          pos_y: n.position.y,
        };
      });
      const edgeRows = edges.map((e) => ({
        id: e.id,
        source_node_id: e.source,
        target_node_id: e.target,
        condition: ((e.data as { condition?: EdgeCond })?.condition ?? { kind: "plain" }) as Record<string, unknown>,
        label: typeof e.label === "string" ? e.label : "",
      }));
      await saveScriptGraph(scriptId, nodeRows, edgeRows);
      setNotice("Script saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleCreate() {
    if (!newName.trim()) return;
    try {
      const s = await createScript(newName.trim());
      setNewName("");
      setScripts(await listScripts());
      setNodes([]);
      setEdges([]);
      setScriptId(s.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create");
    }
  }
  async function handleDeleteScript() {
    if (!scriptId || !window.confirm("Delete this script and its flow?")) return;
    try {
      await deleteScript(scriptId);
      const left = await listScripts();
      setScripts(left);
      if (left[0]) loadScript(left[0].id);
      else {
        setScriptId(null);
        setNodes([]);
        setEdges([]);
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }
  async function handleSetActive() {
    if (!scriptId) return;
    try {
      await saveLabSettings({ active_script_id: scriptId });
      setActiveScriptId(scriptId);
      setNotice("This script is now active for test calls.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }
  async function handleClearActive() {
    try {
      await saveLabSettings({ active_script_id: null });
      setActiveScriptId(null);
    } catch {
      /* ignore */
    }
  }

  const selNode = nodes.find((n) => n.id === selNodeId) ?? null;
  const sd = selNode ? (selNode.data as NodeData) : null;
  const selEdge = edges.find((e) => e.id === selEdgeId) ?? null;
  const selCond = (selEdge?.data as { condition?: EdgeCond } | undefined)?.condition ?? { kind: "plain" };
  const content = (sd?.config.contentType as Content) ?? "scenario";

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gray-800 px-4 py-2.5">
        <h2 className="text-sm font-bold text-white">Script Builder</h2>
        <select
          value={scriptId ?? ""}
          onChange={(e) => loadScript(e.target.value)}
          className="rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 [color-scheme:dark]"
        >
          <option value="">— select a script —</option>
          {scripts.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
              {s.id === activeScriptId ? " (active)" : ""}
            </option>
          ))}
        </select>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          placeholder="New script name…"
          className="w-44 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500"
        />
        <button onClick={handleCreate} disabled={!newName.trim()} className="rounded-lg border border-gray-700 px-2.5 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40">
          + New
        </button>
        <div className="ml-auto flex items-center gap-2">
          {notice && <span className="text-xs text-emerald-400">{notice}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
          {scriptId &&
            (activeScriptId === scriptId ? (
              <button onClick={handleClearActive} className="rounded-lg border border-emerald-600 bg-emerald-600/15 px-3 py-1.5 text-xs font-medium text-emerald-300">
                Active ✓ (clear)
              </button>
            ) : (
              <button onClick={handleSetActive} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
                Set active
              </button>
            ))}
          <button onClick={handleDeleteScript} disabled={!scriptId} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800 disabled:opacity-40">
            Delete
          </button>
          <button onClick={handleSave} disabled={!scriptId || busy} className="rounded-lg bg-indigo-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40">
            {busy ? "Saving…" : "Save"}
          </button>
          <button onClick={onClose} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
            Close
          </button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {/* Palette */}
        <div className="w-44 shrink-0 space-y-1.5 border-r border-gray-800 p-3">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Add box</p>
          <button
            draggable={!!scriptId}
            onDragStart={(e) => onDragStartPalette(e, "start")}
            onClick={() => scriptId && addNode("start")}
            disabled={!scriptId}
            className="flex w-full cursor-grab items-center gap-1.5 rounded-lg border-2 border-emerald-500 bg-emerald-500/10 px-2.5 py-1.5 text-left text-xs font-medium text-gray-200 hover:brightness-125 active:cursor-grabbing disabled:opacity-40"
          >
            Start
          </button>
          <button
            draggable={!!scriptId}
            onDragStart={(e) => onDragStartPalette(e, "step")}
            onClick={() => scriptId && addNode("step")}
            disabled={!scriptId}
            className="flex w-full cursor-grab items-center gap-1.5 rounded-lg border-2 border-indigo-500 bg-indigo-500/10 px-2.5 py-1.5 text-left text-xs font-medium text-gray-200 hover:brightness-125 active:cursor-grabbing disabled:opacity-40"
          >
            <svg className="h-3 w-3 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
              <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
              <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
            </svg>
            Step
          </button>
          <p className="pt-2 text-[10px] text-gray-600">
            Drag a <strong>Step</strong> onto the canvas, then click it to choose what it does — a scenario,
            a collection, a sub-workflow, an action, or no-op.
          </p>

          {scripts.filter((s) => s.id !== scriptId).length > 0 && (
            <div className="border-t border-gray-800 pt-2">
              <p className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Sub-workflows</p>
              <div className="space-y-1">
                {scripts
                  .filter((s) => s.id !== scriptId)
                  .map((s) => (
                    <button
                      key={s.id}
                      draggable={!!scriptId}
                      onDragStart={(e) => onDragStartPalette(e, "sub:" + s.id)}
                      onClick={() => scriptId && addSubworkflow(s.id)}
                      disabled={!scriptId}
                      title={`Drop a box that runs "${s.name}"`}
                      className="flex w-full cursor-grab items-center gap-1.5 rounded-lg border-2 border-teal-500/70 bg-teal-500/10 px-2.5 py-1.5 text-left text-[11px] font-medium text-gray-200 hover:brightness-125 active:cursor-grabbing disabled:opacity-40"
                    >
                      <span className="shrink-0 text-teal-300">⤳</span>
                      <span className="truncate">{s.name}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}

          <p className="pt-1 text-[10px] text-gray-600">Connect boxes by dragging dot-to-dot. Click an arrow to make it a branch or a loop.</p>
        </div>

        {/* Canvas */}
        <div className="min-w-0 flex-1" onDrop={onDrop} onDragOver={onDragOver}>
          {scriptId ? (
            <ReactFlow
              nodes={nodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onInit={setRf}
              onNodeClick={(_, n) => {
                setSelNodeId(n.id);
                setSelEdgeId(null);
              }}
              onNodeDoubleClick={onNodeDoubleClick}
              onEdgeClick={(_, e) => {
                setSelEdgeId(e.id);
                setSelNodeId(null);
              }}
              onPaneClick={() => {
                setSelNodeId(null);
                setSelEdgeId(null);
              }}
              nodeTypes={nodeTypes}
              colorMode="dark"
              snapToGrid
              snapGrid={[16, 16]}
              fitView
            >
              <Background variant={BackgroundVariant.Dots} gap={18} size={1.6} color="#3a4256" />
              <Controls />
            </ReactFlow>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-gray-500">
              Select or create a script to start building.
            </div>
          )}
        </div>

        {/* Config panel */}
        {(sd || selEdge) && (
          <div className="w-72 shrink-0 space-y-3 overflow-y-auto border-l border-gray-800 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {sd ? (sd.kind === "start" ? "Start box" : "Step box") : "Connection"}
              </p>
              <button onClick={deleteSelected} className="text-[11px] text-rose-400 hover:text-rose-300">
                Delete
              </button>
            </div>

            {/* Node config */}
            {selNode && sd && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Label</label>
                  <input className={inputCls} value={sd.label} onChange={(e) => patchNodeData(selNode.id, { label: e.target.value })} />
                </div>

                {sd.kind === "start" && (
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Opening mode</label>
                    <select
                      className={inputCls + " [color-scheme:dark]"}
                      value={(sd.config.mode as string) ?? "agent_first"}
                      onChange={(e) => patchConfig(selNode.id, { mode: e.target.value })}
                    >
                      <option value="agent_first">Agent speaks first</option>
                      <option value="wait_for_customer">Wait for the customer to speak</option>
                    </select>
                  </div>
                )}

                {sd.kind === "step" && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">This box does…</label>
                      <select
                        className={inputCls + " [color-scheme:dark]"}
                        value={content}
                        onChange={(e) => patchConfig(selNode.id, { contentType: e.target.value })}
                      >
                        <option value="scenario">Run a Scenario</option>
                        <option value="collection">Use a Collection (agent picks)</option>
                        <option value="subworkflow">Run a Sub-workflow</option>
                        <option value="send_sms">Send SMS</option>
                        <option value="transfer">Transfer to human</option>
                        <option value="end">End call</option>
                        <option value="noop">No-op (do nothing)</option>
                      </select>
                    </div>

                    {content === "scenario" && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">Scenario (line to speak)</label>
                          <select
                            className={inputCls + " [color-scheme:dark]"}
                            value={sd.scenarioId ?? ""}
                            onChange={(e) => patchNodeData(selNode.id, { scenarioId: e.target.value || null })}
                          >
                            <option value="">(none)</option>
                            {scenarios.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.name}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">
                            Also consider <span className="text-gray-600">(router picks best)</span>
                          </label>
                          {((sd.config.candidateScenarioIds as string[]) ?? []).map((cid) => (
                            <button
                              key={cid}
                              onClick={() =>
                                patchConfig(selNode.id, {
                                  candidateScenarioIds: ((sd.config.candidateScenarioIds as string[]) ?? []).filter((x) => x !== cid),
                                })
                              }
                              className="mb-1 mr-1 inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] text-indigo-300 hover:bg-indigo-500/25"
                            >
                              {scenarioName(cid) ?? "scenario"} <span className="text-indigo-400">×</span>
                            </button>
                          ))}
                          <select
                            className={inputCls + " [color-scheme:dark]"}
                            value=""
                            onChange={(e) => {
                              const id = e.target.value;
                              const cur = (sd.config.candidateScenarioIds as string[]) ?? [];
                              if (id && id !== sd.scenarioId && !cur.includes(id)) patchConfig(selNode.id, { candidateScenarioIds: [...cur, id] });
                            }}
                          >
                            <option value="">+ add candidate…</option>
                            {scenarios.filter((s) => s.id !== sd.scenarioId && !((sd.config.candidateScenarioIds as string[]) ?? []).includes(s.id)).map((s) => (
                              <option key={s.id} value={s.id}>{s.name}</option>
                            ))}
                          </select>
                        </div>
                      </>
                    )}

                    {content === "collection" && (
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Collection <span className="text-gray-600">(agent picks among its scenarios)</span></label>
                        <select
                          className={inputCls + " [color-scheme:dark]"}
                          value={(sd.config.collectionId as string) ?? ""}
                          onChange={(e) => patchConfig(selNode.id, { collectionId: e.target.value || null })}
                        >
                          <option value="">(pick a collection)</option>
                          {collections.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {content === "subworkflow" && (
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Sub-workflow <span className="text-gray-600">(another script)</span></label>
                        <select
                          className={inputCls + " [color-scheme:dark]"}
                          value={(sd.config.subworkflowId as string) ?? ""}
                          onChange={(e) => patchConfig(selNode.id, { subworkflowId: e.target.value || null })}
                        >
                          <option value="">(pick a workflow)</option>
                          {scripts.filter((s) => s.id !== scriptId).map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] text-gray-600">When it finishes it returns a result; branch the next arrow on that result. Double-click the box on the canvas to preview its flow.</p>
                      </div>
                    )}

                    {content === "transfer" && (
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Transfer to (phone number)</label>
                        <input className={inputCls} value={(sd.config.number as string) ?? ""} onChange={(e) => patchConfig(selNode.id, { number: e.target.value })} placeholder="+1..." />
                      </div>
                    )}

                    {content === "end" && (
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Goodbye scenario (optional)</label>
                        <select
                          className={inputCls + " [color-scheme:dark]"}
                          value={sd.scenarioId ?? ""}
                          onChange={(e) => patchNodeData(selNode.id, { scenarioId: e.target.value || null })}
                        >
                          <option value="">(none)</option>
                          {scenarios.map((s) => (
                            <option key={s.id} value={s.id}>{s.name}</option>
                          ))}
                        </select>
                      </div>
                    )}

                    {/* Tag scope for scenario/collection */}
                    {(content === "scenario" || content === "collection") && (
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Active tags at this step <span className="text-gray-600">(blank = all)</span></label>
                        <div className="flex flex-wrap gap-1.5">
                          {allTags.map((t) => {
                            const scope = (sd.config.scopeTags as string[]) ?? [];
                            const on = scope.includes(t);
                            return (
                              <button
                                key={t}
                                onClick={() => patchConfig(selNode.id, { scopeTags: on ? scope.filter((x) => x !== t) : [...scope, t] })}
                                className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${on ? "bg-purple-500/25 text-purple-200" : "border border-gray-700 text-gray-400"}`}
                              >
                                {t}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </>
            )}

            {/* Edge config */}
            {selEdge && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Arrow type</label>
                  <select
                    className={inputCls + " [color-scheme:dark]"}
                    value={selCond.kind}
                    onChange={(e) => {
                      const kind = e.target.value as EdgeCond["kind"];
                      if (kind === "branch") setEdgeCond(selEdge.id, { kind, by: "intent", value: "" });
                      else if (kind === "loop") setEdgeCond(selEdge.id, { kind, maxLoops: 3 });
                      else setEdgeCond(selEdge.id, { kind: "plain" });
                    }}
                  >
                    <option value="plain">Plain — just go next</option>
                    <option value="branch">Branch — if/else condition</option>
                    <option value="loop">Loop — go back</option>
                  </select>
                </div>

                {selCond.kind === "branch" && (
                  <>
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Branch on</label>
                      <select
                        className={inputCls + " [color-scheme:dark]"}
                        value={selCond.by ?? "intent"}
                        onChange={(e) => setEdgeCond(selEdge.id, { kind: "branch", by: e.target.value, value: e.target.value === "else" ? undefined : "" })}
                      >
                        <option value="intent">Intent</option>
                        <option value="tag">Tag</option>
                        <option value="result">Sub-workflow result</option>
                        <option value="else">Otherwise (fallback)</option>
                      </select>
                    </div>
                    {selCond.by === "intent" && (
                      <select
                        className={inputCls + " [color-scheme:dark]"}
                        value={selCond.value ?? ""}
                        onChange={(e) => setEdgeCond(selEdge.id, { kind: "branch", by: "intent", value: e.target.value })}
                      >
                        <option value="">(pick an intent)</option>
                        {scenarios.map((s) => (
                          <option key={s.id} value={s.intent_key}>{s.intent_key}</option>
                        ))}
                      </select>
                    )}
                    {selCond.by === "tag" && (
                      <select
                        className={inputCls + " [color-scheme:dark]"}
                        value={selCond.value ?? ""}
                        onChange={(e) => setEdgeCond(selEdge.id, { kind: "branch", by: "tag", value: e.target.value })}
                      >
                        <option value="">(pick a tag)</option>
                        {allTags.map((t) => (
                          <option key={t} value={t}>{t}</option>
                        ))}
                      </select>
                    )}
                    {selCond.by === "result" && (
                      <input
                        className={inputCls}
                        value={selCond.value ?? ""}
                        onChange={(e) => setEdgeCond(selEdge.id, { kind: "branch", by: "result", value: e.target.value })}
                        placeholder="result value, e.g. qualified"
                      />
                    )}
                  </>
                )}

                {selCond.kind === "loop" && (
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Max loops</label>
                    <input
                      type="number"
                      className={inputCls}
                      value={selCond.maxLoops ?? 3}
                      onChange={(e) => setEdgeCond(selEdge.id, { kind: "loop", maxLoops: Number(e.target.value) || 1 })}
                    />
                    <p className="mt-1 text-[10px] text-gray-600">Sends the call back to the target box, up to this many times.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Sub-workflow preview (read-only) */}
      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6" onClick={() => setPreview(null)}>
          <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative flex h-[80vh] w-[85vw] max-w-5xl flex-col overflow-hidden rounded-2xl border border-gray-700 bg-gray-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-gray-800 px-4 py-2.5">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-gray-500">Sub-workflow preview</p>
                <p className="truncate text-sm font-bold text-white">{preview.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const id = preview.id;
                    setPreview(null);
                    loadScript(id);
                  }}
                  className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800"
                >
                  Open for editing
                </button>
                <button onClick={() => setPreview(null)} className="rounded-lg border border-gray-700 px-3 py-1.5 text-xs text-gray-300 hover:bg-gray-800">
                  Close
                </button>
              </div>
            </div>
            <div className="min-h-0 flex-1">
              <ReactFlow
                nodes={preview.nodes}
                edges={preview.edges}
                nodeTypes={nodeTypes}
                colorMode="dark"
                fitView
                nodesDraggable={false}
                nodesConnectable={false}
                elementsSelectable={false}
                proOptions={{ hideAttribution: true }}
              >
                <Background variant={BackgroundVariant.Dots} gap={18} size={1.6} color="#3a4256" />
                <Controls showInteractive={false} />
              </ReactFlow>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
