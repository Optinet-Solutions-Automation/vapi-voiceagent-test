"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  Handle,
  Position,
  MarkerType,
  addEdge,
  reconnectEdge,
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
  updateScript,
  deleteScript,
  getScriptGraph,
  saveScriptGraph,
  listHandlers,
  createHandler,
  updateHandler,
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
  note?: string | null;
};

const snip = (t: string, n: number) => {
  const s = t.trim().replace(/\s+/g, " ");
  return s.length > n ? s.slice(0, n) + "…" : s;
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
      {!isStart && (
        <Handle
          type="target"
          position={Position.Top}
          style={{ width: 13, height: 13, top: 4, background: "#94a3b8", border: "2px solid #0f172a" }}
        />
      )}
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-300">{meta.label}</p>
      <p className="truncate text-sm font-medium text-white">{d.label || meta.label}</p>
      {d.subtitle && <p className="mt-0.5 truncate text-[11px] text-gray-400">{d.subtitle}</p>}
      {d.note && <p className="mt-0.5 line-clamp-2 text-[10px] italic text-gray-500">{d.note}</p>}
      {handles.map((h, i) => {
        const left = handles.length === 2 ? (i === 0 ? "30%" : "70%") : "50%";
        return (
          <span key={h.id}>
            <Handle
              id={h.id}
              type="source"
              position={Position.Bottom}
              style={{ left, width: 13, height: 13, bottom: 4, background: h.color ?? "#818cf8", border: "2px solid #0f172a" }}
            />
            {h.label && (
              <span
                className="absolute bottom-1 -translate-x-1/2 text-[8px] font-semibold text-gray-300"
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

// Inline-authored line for a Scenario/End box — the scenario is created or
// updated in the Playbook automatically when the script is saved.
type LineDraft = { text: string; delivery: ListenerHandler["delivery"]; hint: string };

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

  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lineDrafts, setLineDrafts] = useState<Record<string, LineDraft>>({});
  // Plain-language "expected reply" drafts for If/Else boxes, keyed by node id.
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});

  // Keep the editable title in sync with the loaded script.
  useEffect(() => {
    setName(scripts.find((s) => s.id === scriptId)?.name ?? "");
  }, [scriptId, scripts]);

  async function handleRename() {
    const trimmed = name.trim();
    if (!scriptId || !trimmed || trimmed === scripts.find((s) => s.id === scriptId)?.name) return;
    try {
      await updateScript(scriptId, { name: trimmed });
      setScripts((ss) => ss.map((s) => (s.id === scriptId ? { ...s, name: trimmed } : s)));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to rename");
    }
  }

  const allTags = useMemo(
    () => Array.from(new Set(scenarios.flatMap((s) => s.tags ?? []).filter(Boolean))).sort(),
    [scenarios]
  );

  const scenarioName = useCallback(
    (id: string | null) => (id ? scenarios.find((s) => s.id === id)?.name ?? null : null),
    [scenarios]
  );
  // Short preview of a scenario's line, for box subtitles on the canvas.
  const scenarioLine = useCallback(
    (id: string | null) => {
      if (!id) return null;
      const s = scenarios.find((x) => x.id === id);
      if (!s) return null;
      const t = (s.response_template || "").trim().replace(/\s+/g, " ");
      if (!t) return s.name;
      return t.length > 42 ? t.slice(0, 42) + "…" : t;
    },
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
    if (c === "scenario") return scenarioLine(d.scenarioId) ? `“${scenarioLine(d.scenarioId)}”` : "(click to write the line)";
    if (c === "collection") return collectionName(d.config.collectionId as string) ? `▣ ${collectionName(d.config.collectionId as string)}` : "(pick a collection)";
    if (c === "subworkflow") return scriptName(d.config.subworkflowId as string) ? `⤳ ${scriptName(d.config.subworkflowId as string)}` : "(pick a workflow)";
    if (c === "transfer") return (d.config.number as string) || "(phone number)";
    if (c === "return") return `↩ ${(d.config.resultName as string) || "result"}`;
    if (c === "ifelse") {
      const by = (d.config.condBy as string) ?? "intent";
      const val = (d.config.condValue as string) ?? "";
      if (by === "result") return `if result = ${val || "?"}`;
      if (by === "tag") return `if reply tagged ${val || "?"}`;
      const scn = scenarios.find((s) => s.intent_key === val);
      return `if reply ≈ ${scn ? snip(scn.name, 30) : val || "?"}`;
    }
    if (c === "loop") return `up to ${(d.config.maxLoops as number) ?? 3}×`;
    if (c === "wait") return "wait for caller";
    if (c === "end") return scenarioLine(d.scenarioId) ? `“${scenarioLine(d.scenarioId)}”` : null;
    return null;
  }

  // Scenario description shown on the box — says WHEN this line/branch fires.
  function noteFor(d: NodeData): string | null {
    if (d.kind !== "step") return null;
    const c = (d.config.contentType as Content) ?? "scenario";
    if (c === "ifelse") {
      if (((d.config.condBy as string) ?? "intent") !== "intent") return null;
      const scn = scenarios.find((s) => s.intent_key === ((d.config.condValue as string) ?? ""));
      return scn?.description ? snip(`Then when: ${scn.description}`, 72) : null;
    }
    if (c !== "scenario" && c !== "end") return null;
    const s = d.scenarioId ? scenarios.find((x) => x.id === d.scenarioId) : undefined;
    const t = (s?.description ?? "").trim();
    return t ? snip(t, 64) : null;
  }
  function annotate(d: NodeData): NodeData {
    d.subtitle = subtitleFor(d);
    d.note = noteFor(d);
    return d;
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

  // Refresh node subtitles/notes when reference data loads.
  useEffect(() => {
    setNodes((ns) => ns.map((n) => ({ ...n, data: annotate({ ...(n.data as NodeData) }) })));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scenarios, collections, scripts]);

  function graphToFlow(g: Awaited<ReturnType<typeof getScriptGraph>>): { rfNodes: Node[]; rfEdges: Edge[] } {
    const rfNodes: Node[] = g.nodes.map((n) => {
      const isStart = n.type === "start";
      const cfg = (n.config ?? {}) as Record<string, unknown>;
      if (!isStart && !cfg.contentType) cfg.contentType = legacyToContent(n.type) ?? "scenario";
      const data: NodeData = { kind: isStart ? "start" : "step", label: n.label, scenarioId: n.scenario_id, config: cfg };
      annotate(data);
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
    setLineDrafts({});
    setReplyDrafts({});
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

  // Reconnecting an existing arrow's endpoint — if it's dropped on nothing, delete it.
  const reconnectOk = useRef(true);
  function onReconnectStart() {
    reconnectOk.current = false;
  }
  function onReconnect(oldEdge: Edge, c: Connection) {
    reconnectOk.current = true;
    setEdges((els) =>
      reconnectEdge(oldEdge, c, els).map((e) =>
        e.id === oldEdge.id
          ? {
              ...e,
              ...edgeVisualByHandle(c.sourceHandle ?? undefined),
              data: { condition: { kind: "plain", handle: c.sourceHandle ?? "out" } },
            }
          : e
      )
    );
  }
  function onReconnectEnd(_: unknown, edge: Edge) {
    if (!reconnectOk.current) setEdges((eds) => eds.filter((e) => e.id !== edge.id));
    reconnectOk.current = true;
  }

  // ── Add / drag nodes ──
  function dropNode(data: NodeData, position?: { x: number; y: number }) {
    const id = crypto.randomUUID();
    annotate(data);
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
    const config: Record<string, unknown> = { contentType: content };
    if (content === "ifelse") config.condBy = "intent"; // default: branch on the customer's reply
    dropNode({ kind: "step", label: CONTENT_META[content].label, scenarioId: null, config }, position);
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
        const merged = annotate({ ...(n.data as NodeData), ...patch });
        return { ...n, data: merged };
      })
    );
  }
  function patchConfig(id: string, patch: Record<string, unknown>) {
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== id) return n;
        const d = n.data as NodeData;
        const merged = annotate({ ...d, config: { ...d.config, ...patch } });
        return { ...n, data: merged };
      })
    );
  }
  function deleteSelected() {
    if (selNodeId) {
      setNodes((ns) => ns.filter((n) => n.id !== selNodeId));
      setEdges((es) => es.filter((e) => e.source !== selNodeId && e.target !== selNodeId));
      setLineDrafts((m) => {
        const next = { ...m };
        delete next[selNodeId];
        return next;
      });
      setReplyDrafts((m) => {
        const next = { ...m };
        delete next[selNodeId];
        return next;
      });
      setSelNodeId(null);
    } else if (selEdgeId) {
      setEdges((es) => es.filter((e) => e.id !== selEdgeId));
      setSelEdgeId(null);
    }
  }

  // Create/update the Playbook entries behind inline-authored content:
  // spoken lines on Scenario/End boxes, and "expected reply" matchers on
  // If/Else boxes (speak-nothing scenarios the router classifies against).
  // Returns nodeId → new scenario id (lines) and nodeId → intent key (replies).
  async function persistInlineLines(): Promise<{ created: Map<string, string>; replies: Map<string, string> }> {
    const created = new Map<string, string>();
    const replies = new Map<string, string>();
    const scriptNm = (scripts.find((s) => s.id === scriptId)?.name ?? name).trim() || "Script";
    const takenKeys = new Set(scenarios.map((s) => s.intent_key));
    const makeKey = (label: string) => {
      const base = label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || "line";
      let key = base;
      for (let i = 2; takenKeys.has(key); i++) key = `${base}_${i}`;
      takenKeys.add(key);
      return key;
    };
    for (const n of nodes) {
      const d = n.data as NodeData;
      const ct = (d.config.contentType as Content) ?? "scenario";
      if (d.kind !== "step") continue;

      if (ct === "ifelse") {
        if (((d.config.condBy as string) ?? "intent") === "result") continue;
        const draft = replyDrafts[n.id];
        if (draft === undefined) continue; // untouched box
        const desc = draft.trim();
        if (!desc) continue;
        const cur = scenarios.find((s) => s.intent_key === ((d.config.condValue as string) ?? ""));
        if (cur) {
          // Only expected-reply entries are editable from here; real scenarios
          // keep their description (edit it in the Playbook or its own box).
          if (cur.action_type === "ignore" && desc !== (cur.description ?? "").trim()) {
            await updateHandler(cur.id, { description: desc });
          }
        } else {
          const label = d.label.trim() || snip(desc, 40);
          const key = makeKey(label);
          await createHandler({
            name: label,
            intent_key: key,
            description: desc,
            response_template: "", // matcher only — never spoken
            action_type: "ignore",
            delivery: "verbatim",
            tags: [scriptNm, "Reply detector"],
            mode: "listener",
            priority: 100,
            enabled: true,
          });
          replies.set(n.id, key);
        }
        continue;
      }

      if (ct !== "scenario" && ct !== "end") continue;
      const draft = lineDrafts[n.id];
      if (!draft) continue; // untouched box
      const text = draft.text.trim();
      if (!text) continue; // never wipe a line via an emptied box
      if (d.scenarioId) {
        const scn = scenarios.find((s) => s.id === d.scenarioId);
        if (!scn) continue;
        const hint = draft.hint.trim();
        const delivery = ct === "end" ? "verbatim" : draft.delivery;
        if (text === scn.response_template && delivery === scn.delivery && hint === (scn.description ?? "").trim()) continue;
        await updateHandler(d.scenarioId, {
          response_template: text,
          delivery,
          description: hint || scn.description,
        });
      } else {
        const label = d.label.trim() || text.slice(0, 40);
        const h = await createHandler({
          name: label,
          intent_key: makeKey(label),
          description: draft.hint.trim() || `Step "${label}" of the "${scriptNm}" script.`,
          response_template: text,
          action_type: ct === "end" ? "end_call" : "answer",
          delivery: ct === "end" ? "verbatim" : draft.delivery,
          tags: [scriptNm],
          mode: "both",
          priority: 100,
          enabled: true,
        });
        created.set(n.id, h.id);
      }
    }
    return { created, replies };
  }

  async function handleSave() {
    if (!scriptId) return;
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const { created, replies } = await persistInlineLines();
      const scenarioIdFor = (n: Node) => created.get(n.id) ?? (n.data as NodeData).scenarioId;
      const configFor = (n: Node) => {
        const d = n.data as NodeData;
        return replies.has(n.id) ? { ...d.config, condBy: "intent", condValue: replies.get(n.id) } : d.config ?? {};
      };
      const nodeRows = nodes.map((n) => {
        const d = n.data as NodeData;
        const ct = (d.config.contentType ?? "scenario") as string;
        return {
          id: n.id,
          type: d.kind, // 'start' | 'step'
          scenario_id: ct === "scenario" || ct === "end" ? scenarioIdFor(n) : null,
          label: d.label,
          config: configFor(n),
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
      // Reflect newly created scenarios/reply matchers on their boxes, refresh
      // the Playbook list, and drop drafts so they reseed from saved data.
      if (created.size || replies.size) {
        setNodes((ns) =>
          ns.map((n) => {
            if (!created.has(n.id) && !replies.has(n.id)) return n;
            const d = { ...(n.data as NodeData) };
            if (created.has(n.id)) d.scenarioId = created.get(n.id)!;
            if (replies.has(n.id)) d.config = { ...d.config, condBy: "intent", condValue: replies.get(n.id) };
            return { ...n, data: d };
          })
        );
      }
      setScenarios(await listHandlers());
      setLineDrafts({});
      setReplyDrafts({});
      setNotice("Script saved.");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteScript() {
    if (!scriptId || !window.confirm("Delete this script and its flow?")) return;
    try {
      await deleteScript(scriptId);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to delete");
    }
  }
  async function toggleActive() {
    if (!scriptId) return;
    const next = activeScriptId === scriptId ? null : scriptId;
    try {
      await saveLabSettings({ active_script_id: next });
      setActiveScriptId(next);
      setNotice(next ? "Active for test calls." : null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed");
    }
  }

  const selNode = nodes.find((n) => n.id === selNodeId) ?? null;
  const sd = selNode ? (selNode.data as NodeData) : null;
  const selEdge = edges.find((e) => e.id === selEdgeId) ?? null;
  const content = (sd?.config.contentType as Content) ?? "scenario";

  // Inline line editing: drafts are seeded from the box's scenario and only
  // written back to the Playbook on Save.
  function seedDraft(d: NodeData): LineDraft {
    const scn = d.scenarioId ? scenarios.find((s) => s.id === d.scenarioId) : undefined;
    return {
      text: scn?.response_template ?? "",
      delivery: scn?.delivery ?? "verbatim",
      hint: scn?.description ?? "",
    };
  }
  const draft =
    selNode && sd && sd.kind === "step" && (content === "scenario" || content === "end")
      ? lineDrafts[selNode.id] ?? seedDraft(sd)
      : null;
  function patchDraft(nodeId: string, base: LineDraft, patch: Partial<LineDraft>) {
    setLineDrafts((m) => ({ ...m, [nodeId]: { ...(m[nodeId] ?? base), ...patch } }));
    // Live-preview the line and description on the canvas box while typing.
    const next = { ...base, ...patch };
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const d = { ...(n.data as NodeData) };
        d.subtitle = next.text.trim() ? `“${snip(next.text, 42)}”` : subtitleFor(d);
        d.note = next.hint.trim() ? snip(next.hint, 64) : null;
        return { ...n, data: d };
      })
    );
  }
  // Switching the underlying scenario reseeds the draft from the new pick.
  function pickScenario(nodeId: string, scenarioId: string | null) {
    patchNodeData(nodeId, { scenarioId });
    setLineDrafts((m) => {
      const next = { ...m };
      delete next[nodeId];
      return next;
    });
  }

  // If/Else "expected reply": the scenario the condition currently points at,
  // and the plain-language draft describing what counts as a match.
  const condScn =
    sd && content === "ifelse"
      ? scenarios.find((s) => s.intent_key === ((sd.config.condValue as string) ?? "")) ?? null
      : null;
  const replyEditable = !condScn || condScn.action_type === "ignore";
  const replyDraft = selNode && sd && content === "ifelse" ? replyDrafts[selNode.id] ?? condScn?.description ?? "" : "";
  function patchReplyDraft(nodeId: string, value: string) {
    setReplyDrafts((m) => ({ ...m, [nodeId]: value }));
    // Live-preview the matching rule on the canvas box.
    setNodes((ns) =>
      ns.map((n) => {
        if (n.id !== nodeId) return n;
        const d = { ...(n.data as NodeData) };
        d.note = value.trim() ? snip(`Then when: ${value}`, 72) : null;
        return { ...n, data: d };
      })
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-950">
      {/* Top bar */}
      <div className="flex flex-wrap items-center gap-3 border-b border-gray-800 px-4 py-2.5">
        {/* Editable workflow name */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={handleRename}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          placeholder="Untitled workflow"
          title="Click to rename"
          className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 text-sm font-bold text-white hover:border-gray-700 focus:border-indigo-500 focus:bg-gray-900 focus:outline-none"
        />

        <div className="flex items-center gap-3">
          {notice && <span className="text-xs text-emerald-400">{notice}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}

          {/* Active toggle (off by default) */}
          <label className="flex items-center gap-2 text-xs text-gray-400" title="Use this script for test calls">
            <span>Active</span>
            <button
              type="button"
              onClick={toggleActive}
              disabled={!scriptId}
              className={`relative h-5 w-9 shrink-0 rounded-full transition disabled:opacity-40 ${
                activeScriptId === scriptId ? "bg-emerald-600" : "bg-gray-600"
              }`}
            >
              <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${activeScriptId === scriptId ? "left-[18px]" : "left-0.5"}`} />
            </button>
          </label>

          {/* Save */}
          <button onClick={handleSave} disabled={!scriptId || busy} title="Save" className="rounded-lg bg-indigo-600 p-2 text-white transition hover:bg-indigo-500 disabled:opacity-40">
            {busy ? (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" strokeDasharray="42" strokeLinecap="round" /></svg>
            ) : (
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 5a2 2 0 012-2h9l3 3v11a2 2 0 01-2 2H7a2 2 0 01-2-2V5z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v5h6" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 13h8v6H8z" />
              </svg>
            )}
          </button>

          {/* Delete */}
          <button onClick={handleDeleteScript} disabled={!scriptId} title="Delete script" className="rounded-lg border border-gray-700 p-2 text-gray-300 transition hover:bg-gray-800 hover:text-rose-400 disabled:opacity-40">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
          </button>

          {/* Close */}
          <button onClick={onClose} title="Close" className="rounded-lg border border-gray-700 p-2 text-gray-300 transition hover:bg-gray-800">
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
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
              onReconnect={onReconnect}
              onReconnectStart={onReconnectStart}
              onReconnectEnd={onReconnectEnd}
              connectionRadius={45}
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
                {sd ? (sd.kind === "start" ? "Start call" : `${CONTENT_META[content]?.label ?? "Step"} box`) : "Connection"}
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
                    {content === "scenario" && draft && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">What the agent says</label>
                          <textarea
                            className={inputCls + " min-h-[110px] resize-y"}
                            value={draft.text}
                            onChange={(e) => patchDraft(selNode.id, draft, { text: e.target.value })}
                            placeholder="Type the line for this step — it's saved to the Playbook automatically."
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">Delivery</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {(
                              [
                                ["verbatim", "Exact words"],
                                ["reword", "Just the gist"],
                              ] as const
                            ).map(([val, lbl]) => (
                              <button
                                key={val}
                                onClick={() => patchDraft(selNode.id, draft, { delivery: val })}
                                className={`rounded-md border px-2 py-1.5 text-xs font-medium transition ${
                                  draft.delivery === val
                                    ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
                                    : "border-gray-700 text-gray-400 hover:bg-gray-800"
                                }`}
                              >
                                {lbl}
                              </button>
                            ))}
                          </div>
                          <p className="mt-1 text-[10px] text-gray-600">
                            Exact words are spoken word-for-word; with the gist, the agent rephrases it naturally.
                          </p>
                        </div>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">
                            Description <span className="text-gray-600">(when does this fit?)</span>
                          </label>
                          <input
                            className={inputCls}
                            value={draft.hint}
                            onChange={(e) => patchDraft(selNode.id, draft, { hint: e.target.value })}
                            placeholder="e.g. the customer asks about price"
                          />
                          <p className="mt-1 text-[10px] text-gray-600">
                            Shown on the box, and helps the agent pick this line when the customer goes off script.
                          </p>
                        </div>

                        <details className="rounded-lg border border-gray-800">
                          <summary className="cursor-pointer px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300">
                            Advanced
                          </summary>
                          <div className="space-y-3 p-2.5">
                            <div>
                              <label className="mb-1 block text-xs text-gray-400">Reuse an existing line</label>
                              <select
                                className={inputCls + " [color-scheme:dark]"}
                                value={sd.scenarioId ?? ""}
                                onChange={(e) => pickScenario(selNode.id, e.target.value || null)}
                              >
                                <option value="">(new line for this box)</option>
                                {scenarios.filter((s) => s.action_type !== "ignore").map((s) => (
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
                                {scenarios.filter((s) => s.action_type !== "ignore" && s.id !== sd.scenarioId && !((sd.config.candidateScenarioIds as string[]) ?? []).includes(s.id)).map((s) => (
                                  <option key={s.id} value={s.id}>{s.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <label className="mb-1 block text-xs text-gray-400">
                                Active tags at this step <span className="text-gray-600">(blank = all)</span>
                              </label>
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
                          </div>
                        </details>
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
                          <label className="mb-1 block text-xs text-gray-400">Branch on</label>
                          <select
                            className={inputCls + " [color-scheme:dark]"}
                            value={((sd.config.condBy as string) ?? "intent") === "result" ? "result" : "intent"}
                            onChange={(e) => patchConfig(selNode.id, { condBy: e.target.value, condValue: "" })}
                          >
                            <option value="intent">The customer&rsquo;s reply</option>
                            <option value="result">The last sub-workflow&rsquo;s result</option>
                          </select>
                        </div>

                        {((sd.config.condBy as string) ?? "intent") !== "result" ? (
                          <>
                            {replyEditable ? (
                              <div>
                                <label className="mb-1 block text-xs text-gray-400">When the customer&rsquo;s reply is…</label>
                                <textarea
                                  className={inputCls + " min-h-[70px] resize-y"}
                                  value={replyDraft}
                                  onChange={(e) => patchReplyDraft(selNode.id, e.target.value)}
                                  placeholder={'e.g. they agree — "yes", "sure", "text me", "sounds good"'}
                                />
                                <p className="mt-1 text-[10px] text-gray-600">
                                  Describe the reply in plain words — replies that fit go down <strong>Then</strong>.
                                </p>
                              </div>
                            ) : (
                              <div>
                                <label className="mb-1 block text-xs text-gray-400">When the customer&rsquo;s reply is…</label>
                                <p className="rounded-md bg-gray-900/60 p-1.5 text-[10px] italic text-gray-500">
                                  {condScn?.description || condScn?.name}
                                </p>
                                <p className="mt-1 text-[10px] text-gray-600">
                                  Matching comes from &ldquo;{condScn?.name}&rdquo; — edit that scenario&rsquo;s description
                                  to change what counts.
                                </p>
                              </div>
                            )}

                            <details className="rounded-lg border border-gray-800">
                              <summary className="cursor-pointer px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300">
                                Advanced
                              </summary>
                              <div className="p-2.5">
                                <label className="mb-1 block text-xs text-gray-400">Match an existing scenario instead</label>
                                <select
                                  className={inputCls + " [color-scheme:dark]"}
                                  value={(sd.config.condValue as string) ?? ""}
                                  onChange={(e) => {
                                    patchConfig(selNode.id, { condBy: "intent", condValue: e.target.value });
                                    setReplyDrafts((m) => {
                                      const next = { ...m };
                                      delete next[selNode.id];
                                      return next;
                                    });
                                  }}
                                >
                                  <option value="">(new expected reply for this box)</option>
                                  <optgroup label="Expected replies">
                                    {scenarios.filter((s) => s.action_type === "ignore").map((s) => (
                                      <option key={s.id} value={s.intent_key}>{s.name}</option>
                                    ))}
                                  </optgroup>
                                  <optgroup label="All scenarios (matched by their description)">
                                    {scenarios.filter((s) => s.action_type !== "ignore" && s.intent_key !== "first_message").map((s) => (
                                      <option key={s.id} value={s.intent_key}>{s.name}</option>
                                    ))}
                                  </optgroup>
                                </select>
                              </div>
                            </details>

                            <p className="rounded-lg border border-gray-700 bg-gray-900/50 p-2 text-[10px] text-gray-500">
                              Replies that fit the description follow the green <strong>Then</strong> dot; anything else
                              follows the red <strong>Else</strong> dot. One-off questions with a Playbook answer are
                              answered in place and re-checked on the next reply.
                            </p>
                          </>
                        ) : (
                          <>
                            <div>
                              <label className="mb-1 block text-xs text-gray-400">If the result equals</label>
                              <input
                                className={inputCls}
                                value={(sd.config.condValue as string) ?? ""}
                                onChange={(e) => patchConfig(selNode.id, { condBy: "result", condValue: e.target.value })}
                                placeholder="e.g. interested"
                              />
                            </div>
                            <p className="rounded-lg border border-gray-700 bg-gray-900/50 p-2 text-[10px] text-gray-500">
                              Checks the result returned by the last sub-workflow&rsquo;s <strong>Return</strong> box
                              (e.g. a pitch phase returning <strong>interested</strong>). Green <strong>Then</strong> dot
                              for a match, red <strong>Else</strong> dot for everything else.
                            </p>
                          </>
                        )}
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

                    {content === "end" && draft && (
                      <>
                        <div>
                          <label className="mb-1 block text-xs text-gray-400">
                            Goodbye line <span className="text-gray-600">(optional)</span>
                          </label>
                          <textarea
                            className={inputCls + " min-h-[80px] resize-y"}
                            value={draft.text}
                            onChange={(e) => patchDraft(selNode.id, draft, { text: e.target.value })}
                            placeholder="e.g. Thanks for your time today — have a great day!"
                          />
                          <p className="mt-1 text-[10px] text-gray-600">
                            Spoken word-for-word before hanging up. Leave blank for the default goodbye.
                          </p>
                        </div>
                        <details className="rounded-lg border border-gray-800">
                          <summary className="cursor-pointer px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-300">
                            Advanced
                          </summary>
                          <div className="p-2.5">
                            <label className="mb-1 block text-xs text-gray-400">Reuse an existing line</label>
                            <select
                              className={inputCls + " [color-scheme:dark]"}
                              value={sd.scenarioId ?? ""}
                              onChange={(e) => pickScenario(selNode.id, e.target.value || null)}
                            >
                              <option value="">(new line for this box)</option>
                              {scenarios.filter((s) => s.action_type !== "ignore").map((s) => (
                                <option key={s.id} value={s.id}>{s.name}</option>
                              ))}
                            </select>
                          </div>
                        </details>
                      </>
                    )}

                    {/* Tag scope for collection (scenario boxes have it under Advanced) */}
                    {content === "collection" && (
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
