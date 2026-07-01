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
type Content =
  | "scenario"
  | "collection"
  | "subworkflow"
  | "wait"
  | "ifelse"
  | "loop"
  | "noop"
  | "send_sms"
  | "transfer"
  | "return"
  | "end";

const CONTENT_META: Record<Content, { label: string; color: string; terminal?: boolean }> = {
  scenario: { label: "Scenario", color: "border-indigo-500 bg-indigo-500/10" },
  collection: { label: "Collection", color: "border-fuchsia-500 bg-fuchsia-500/10" },
  subworkflow: { label: "Sub-workflow", color: "border-teal-500 bg-teal-500/10" },
  wait: { label: "Wait", color: "border-sky-500 bg-sky-500/10" },
  ifelse: { label: "If / Else", color: "border-yellow-500 bg-yellow-500/10" },
  loop: { label: "Loop", color: "border-amber-500 bg-amber-500/10" },
  noop: { label: "No-op", color: "border-gray-500 bg-gray-500/10" },
  send_sms: { label: "Send SMS", color: "border-amber-500 bg-amber-500/10" },
  transfer: { label: "Transfer", color: "border-orange-500 bg-orange-500/10", terminal: true },
  return: { label: "Return result", color: "border-lime-500 bg-lime-500/10", terminal: true },
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

// Source handles a box exposes (id used as edge.sourceHandle for routing).
function sourceHandlesFor(isStart: boolean, content: Content): { id: string; label?: string; color?: string }[] {
  if (isStart) return [{ id: "out" }];
  if (CONTENT_META[content].terminal) return [];
  if (content === "ifelse")
    return [
      { id: "then", label: "Then", color: "#34d399" },
      { id: "else", label: "Else", color: "#f87171" },
    ];
  if (content === "loop")
    return [
      { id: "loop", label: "Repeat", color: "#f59e0b" },
      { id: "exit", label: "Exit", color: "#9ca3af" },
    ];
  return [{ id: "out" }];
}

// ── Custom node ───────────────────────────────────────────────
function FlowNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  const isStart = d.kind === "start";
  const content = (d.config.contentType as Content) ?? "scenario";
  const meta = isStart ? { label: "Start call", color: "border-emerald-500 bg-emerald-500/10" } : CONTENT_META[content];
  const handles = sourceHandlesFor(isStart, content);
  return (
    <div
      className={`min-w-[160px] max-w-[230px] rounded-lg border-2 px-3 ${handles.length === 2 ? "pb-5 pt-2" : "py-2"} text-left shadow ${meta.color} ${
        selected ? "ring-2 ring-white/60" : ""
      }`}
    >
      {!isStart && <Handle type="target" position={Position.Top} />}
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-300">{meta.label}</p>
      <p className="truncate text-sm font-medium text-white">{d.label || meta.label}</p>
      {d.subtitle && <p className="mt-0.5 truncate text-[11px] text-gray-400">{d.subtitle}</p>}
      {handles.map((h, i) => {
        const left = handles.length === 2 ? (i === 0 ? "30%" : "70%") : "50%";
        return (
          <span key={h.id}>
            <Handle id={h.id} type="source" position={Position.Bottom} style={{ left, background: h.color }} />
            {h.label && (
              <span
                className="absolute bottom-0.5 -translate-x-1/2 text-[8px] font-semibold text-gray-300"
                style={{ left }}
              >
                {h.label}
              </span>
            )}
          </span>
        );
      })}
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

type Props = { onClose: () => void; initialScriptId?: string | null };

export default function ScriptBuilder({ onClose, initialScriptId }: Props) {
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
    if (c === "return") return `↩ ${(d.config.resultName as string) || "result"}`;
    if (c === "ifelse") {
      const by = (d.config.condBy as string) ?? "intent";
      const val = (d.config.condValue as string) ?? "";
      return `if ${by}: ${val || "?"}`;
    }
    if (c === "loop") return `up to ${(d.config.maxLoops as number) ?? 3}×`;
    if (c === "wait") return "wait for caller";
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
        if (initialScriptId) loadScript(initialScriptId);
        else if (scs.length && !scriptId) loadScript(scs[0].id);
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
      const condRaw = (e.condition ?? {}) as Record<string, unknown>;
      const cond = normalizeCondition(condRaw);
      const handle = (condRaw.handle as string | undefined) ?? legacyHandle(cond);
      return {
        id: e.id,
        source: e.source_node_id,
        target: e.target_node_id,
        sourceHandle: handle && handle !== "out" ? handle : undefined,
        ...edgeVisualByHandle(handle),
        data: { condition: { ...cond, handle } },
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

  // Legacy condition edges → a handle name so old graphs still render sensibly.
  function legacyHandle(c: EdgeCond): string {
    if (c.kind === "loop") return "loop";
    if (c.kind === "branch") return c.by === "else" ? "else" : "then";
    return "out";
  }
  function edgeVisualByHandle(handle?: string): Partial<Edge> {
    switch (handle) {
      case "then":
        return { label: "Then", style: { stroke: "#34d399" } };
      case "else":
        return { label: "Else", style: { stroke: "#f87171" } };
      case "loop":
        return { label: "Repeat", animated: true, style: { stroke: "#f59e0b", strokeDasharray: "5 4" } };
      case "exit":
        return { label: "Exit", style: { stroke: "#9ca3af" } };
      default:
        return { label: "", style: { stroke: "#6b7280" } };
    }
  }

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...c,
            ...edgeVisualByHandle(c.sourceHandle ?? undefined),
            data: { condition: { kind: "plain", handle: c.sourceHandle ?? "out" } },
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        )
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setEdges]
  );

  // ── Add / drag nodes ──
  function dropNode(data: NodeData, position?: { x: number; y: number }) {
    const id = crypto.randomUUID();
    data.subtitle = subtitleFor(data);
    setNodes((ns) => [...ns, { id, type: "lab", position: position ?? { x: 140 + ns.length * 30, y: 80 + ns.length * 30 }, data }]);
    setSelNodeId(id);
    setSelEdgeId(null);
  }
  // payload is "start" or a Content type ("scenario","collection","subworkflow","wait","ifelse","loop","end").
  function createBox(payload: string, position?: { x: number; y: number }) {
    if (payload === "start") {
      dropNode({ kind: "start", label: "Start call", scenarioId: null, config: { mode: "agent_first" } }, position);
      return;
    }
    const content = payload as Content;
    if (!CONTENT_META[content]) return;
    dropNode({ kind: "step", label: CONTENT_META[content].label, scenarioId: null, config: { contentType: content } }, position);
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
    createBox(payload, rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
  }

  const PALETTE: { payload: string; label: string; cls: string }[] = [
    { payload: "start", label: "Start call", cls: "border-emerald-500 bg-emerald-500/10" },
    { payload: "scenario", label: "Scenario", cls: "border-indigo-500 bg-indigo-500/10" },
    { payload: "collection", label: "Collection", cls: "border-fuchsia-500 bg-fuchsia-500/10" },
    { payload: "subworkflow", label: "Sub-workflow", cls: "border-teal-500 bg-teal-500/10" },
    { payload: "wait", label: "Wait", cls: "border-sky-500 bg-sky-500/10" },
    { payload: "ifelse", label: "If / Else", cls: "border-yellow-500 bg-yellow-500/10" },
    { payload: "loop", label: "Loop", cls: "border-amber-500 bg-amber-500/10" },
    { payload: "end", label: "End call", cls: "border-rose-500 bg-rose-500/10" },
  ];

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
        const ct = (d.config.contentType ?? "scenario") as string;
        return {
          id: n.id,
          type: d.kind, // 'start' | 'step'
          scenario_id: ct === "scenario" || ct === "end" ? d.scenarioId : null,
          label: d.label,
          config: d.config ?? {},
          pos_x: n.position.x,
          pos_y: n.position.y,
        };
      });
      const edgeRows = edges.map((e) => {
        const cond = ((e.data as { condition?: Record<string, unknown> })?.condition ?? { kind: "plain" }) as Record<string, unknown>;
        return {
          id: e.id,
          source_node_id: e.source,
          target_node_id: e.target,
          // Persist which output handle the arrow leaves from (then/else/loop/exit) inside condition.
          condition: { ...cond, handle: e.sourceHandle ?? cond.handle ?? "out" },
          label: typeof e.label === "string" ? e.label : "",
        };
      });
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
        <div className="flex w-44 shrink-0 flex-col border-r border-gray-800">
          <p className="shrink-0 border-b border-gray-800 px-3 py-2 text-[10px] font-semibold uppercase tracking-wider text-gray-500">Boxes</p>
          <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
            {PALETTE.map((b) => (
              <button
                key={b.payload}
                draggable={!!scriptId}
                onDragStart={(e) => onDragStartPalette(e, b.payload)}
                onClick={() => scriptId && createBox(b.payload)}
                disabled={!scriptId}
                title={`Drag onto the canvas`}
                className={`flex w-full cursor-grab items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-left text-xs font-medium text-gray-200 hover:brightness-125 active:cursor-grabbing disabled:opacity-40 ${b.cls}`}
              >
                {b.label}
              </button>
            ))}
          </div>
          <p className="shrink-0 border-t border-gray-800 p-2 text-[10px] text-gray-600">
            Drag a box onto the canvas, then click it to configure. Connect boxes dot-to-dot — arrows are just
            connectors. Branching lives in the If/Else and Loop boxes (drag from their Then / Else / Repeat / Exit dots).
          </p>
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
                        <option value="wait">Wait for the customer</option>
                        <option value="ifelse">If / Else (branch)</option>
                        <option value="loop">Loop</option>
                        <option value="send_sms">Send SMS</option>
                        <option value="transfer">Transfer to human</option>
                        <option value="return">Return to parent (with result)</option>
                        <option value="end">End call (hang up)</option>
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

                    {content === "wait" && (
                      <p className="rounded-lg border border-gray-700 bg-gray-900/50 p-2 text-[11px] text-gray-500">
                        Pauses here and waits for the customer to speak before following its arrow. Speaks nothing.
                      </p>
                    )}

                    {content === "ifelse" && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">Check the customer&rsquo;s reply by</label>
                          <select
                            className={inputCls + " [color-scheme:dark]"}
                            value={(sd.config.condBy as string) ?? "intent"}
                            onChange={(e) => patchConfig(selNode.id, { condBy: e.target.value, condValue: "" })}
                          >
                            <option value="intent">Intent</option>
                            <option value="tag">Tag</option>
                            <option value="result">Sub-workflow result</option>
                          </select>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">Equals</label>
                          {(sd.config.condBy as string) === "tag" ? (
                            <select className={inputCls + " [color-scheme:dark]"} value={(sd.config.condValue as string) ?? ""} onChange={(e) => patchConfig(selNode.id, { condValue: e.target.value })}>
                              <option value="">(pick a tag)</option>
                              {allTags.map((t) => (<option key={t} value={t}>{t}</option>))}
                            </select>
                          ) : (sd.config.condBy as string) === "result" ? (
                            <input className={inputCls} value={(sd.config.condValue as string) ?? ""} onChange={(e) => patchConfig(selNode.id, { condValue: e.target.value })} placeholder="e.g. qualified" />
                          ) : (
                            <select className={inputCls + " [color-scheme:dark]"} value={(sd.config.condValue as string) ?? ""} onChange={(e) => patchConfig(selNode.id, { condValue: e.target.value })}>
                              <option value="">(pick an intent)</option>
                              {scenarios.map((s) => (<option key={s.id} value={s.intent_key}>{s.intent_key}</option>))}
                            </select>
                          )}
                        </div>
                        <p className="rounded-lg border border-gray-700 bg-gray-900/50 p-2 text-[10px] text-gray-500">
                          Connect the green <strong>Then</strong> dot to the box used when this is true, and the red
                          <strong> Else</strong> dot to the fallback.
                        </p>
                      </>
                    )}

                    {content === "loop" && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">Max repeats</label>
                          <input
                            type="number"
                            className={inputCls}
                            value={(sd.config.maxLoops as number) ?? 3}
                            onChange={(e) => patchConfig(selNode.id, { maxLoops: Number(e.target.value) || 1 })}
                          />
                        </div>
                        <p className="rounded-lg border border-gray-700 bg-gray-900/50 p-2 text-[10px] text-gray-500">
                          Connect the <strong>Repeat</strong> dot back to the box(es) to repeat, and the
                          <strong> Exit</strong> dot to where the call continues once the limit is hit.
                        </p>
                      </>
                    )}

                    {content === "return" && (
                      <div>
                        <label className="mb-1 block text-xs text-gray-400">Result <span className="text-gray-600">(handed back to the parent workflow)</span></label>
                        <input className={inputCls} value={(sd.config.resultName as string) ?? ""} onChange={(e) => patchConfig(selNode.id, { resultName: e.target.value })} placeholder="e.g. qualified" />
                        <p className="mt-1 text-[10px] text-gray-600">The parent can branch its next arrow on this result. Use this (not End Call) as a sub-workflow&rsquo;s normal exit.</p>
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

            {/* Edge config — arrows are plain connectors; branching lives in If/Else & Loop boxes */}
            {selEdge && (
              <p className="rounded-lg border border-gray-700 bg-gray-900/50 p-2 text-[11px] text-gray-400">
                {(() => {
                  const h = (selEdge.data as { condition?: { handle?: string } } | undefined)?.condition?.handle;
                  if (h === "then") return "This is the Then path of an If/Else box.";
                  if (h === "else") return "This is the Else (fallback) path of an If/Else box.";
                  if (h === "loop") return "This is the Repeat path of a Loop box.";
                  if (h === "exit") return "This is the Exit path of a Loop box.";
                  return "A plain connector — the call moves to the next box.";
                })()}
                <br />
                <span className="text-gray-600">Use Delete above to remove it.</span>
              </p>
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
