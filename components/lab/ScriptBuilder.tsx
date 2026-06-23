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
  updateScript,
  deleteScript,
  getScriptGraph,
  saveScriptGraph,
  listHandlers,
  getLabSettings,
  saveLabSettings,
} from "@/lib/lab-db";
import type { ListenerScript, ListenerHandler } from "@/lib/database.types";

// ── Node kinds ────────────────────────────────────────────────
type Kind = "start" | "say" | "switch" | "send_sms" | "set_variable" | "transfer" | "end";

const KIND_META: Record<Kind, { label: string; color: string; hasTarget: boolean; hasSource: boolean }> = {
  start: { label: "Start", color: "border-emerald-500 bg-emerald-500/10", hasTarget: false, hasSource: true },
  say: { label: "Say", color: "border-indigo-500 bg-indigo-500/10", hasTarget: true, hasSource: true },
  switch: { label: "Branch", color: "border-fuchsia-500 bg-fuchsia-500/10", hasTarget: true, hasSource: true },
  send_sms: { label: "Send SMS", color: "border-amber-500 bg-amber-500/10", hasTarget: true, hasSource: true },
  set_variable: { label: "Set Variable", color: "border-cyan-500 bg-cyan-500/10", hasTarget: true, hasSource: true },
  transfer: { label: "Transfer to Human", color: "border-orange-500 bg-orange-500/10", hasTarget: true, hasSource: false },
  end: { label: "End Call", color: "border-rose-500 bg-rose-500/10", hasTarget: true, hasSource: false },
};

type NodeData = {
  kind: Kind;
  label: string;
  scenarioId: string | null;
  scenarioName?: string | null;
  config: Record<string, unknown>;
};

function FlowNode({ data, selected }: NodeProps) {
  const d = data as NodeData;
  const meta = KIND_META[d.kind];
  return (
    <div
      className={`min-w-[150px] max-w-[220px] rounded-lg border-2 px-3 py-2 text-left shadow ${meta.color} ${
        selected ? "ring-2 ring-white/60" : ""
      }`}
    >
      {meta.hasTarget && <Handle type="target" position={Position.Top} />}
      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-300">{meta.label}</p>
      <p className="truncate text-sm font-medium text-white">{d.label || meta.label}</p>
      {d.scenarioName && <p className="mt-0.5 truncate text-[11px] text-gray-400">▶ {d.scenarioName}</p>}
      {meta.hasSource && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}

const nodeTypes = { lab: FlowNode };

const inputCls =
  "w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none";

type Props = { onClose: () => void };

export default function ScriptBuilder({ onClose }: Props) {
  const [scripts, setScripts] = useState<ListenerScript[]>([]);
  const [scriptId, setScriptId] = useState<string | null>(null);
  const [scenarios, setScenarios] = useState<ListenerHandler[]>([]);
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

  useEffect(() => {
    (async () => {
      try {
        const [scs, hs, settings] = await Promise.all([listScripts(), listHandlers(), getLabSettings()]);
        setScripts(scs);
        setScenarios(hs);
        setActiveScriptId(settings?.active_script_id ?? null);
        if (scs.length && !scriptId) loadScript(scs[0].id, hs);
      } catch (e: any) {
        setError(e?.message ?? "Failed to load — did you run the scripts migration?");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scenarioName(id: string | null, list = scenarios): string | null {
    if (!id) return null;
    return list.find((s) => s.id === id)?.name ?? null;
  }

  async function loadScript(id: string, scenariosList = scenarios) {
    setScriptId(id);
    setSelNodeId(null);
    setSelEdgeId(null);
    try {
      const g = await getScriptGraph(id);
      setNodes(
        g.nodes.map((n) => ({
          id: n.id,
          type: "lab",
          position: { x: n.pos_x, y: n.pos_y },
          data: {
            kind: n.type as Kind,
            label: n.label,
            scenarioId: n.scenario_id,
            scenarioName: scenarioName(n.scenario_id, scenariosList),
            config: n.config ?? {},
          } as NodeData,
        }))
      );
      setEdges(
        g.edges.map((e) => ({
          id: e.id,
          source: e.source_node_id,
          target: e.target_node_id,
          label: e.label || conditionLabel(e.condition),
          data: { condition: e.condition },
          markerEnd: { type: MarkerType.ArrowClosed },
        }))
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to load script");
    }
  }

  function conditionLabel(cond: Record<string, unknown> | undefined): string {
    if (!cond) return "";
    const kind = cond.kind as string;
    if (kind === "always") return "always";
    if (kind === "else") return "otherwise";
    if (kind === "intent") return `intent: ${cond.value ?? "?"}`;
    if (kind === "tag") return `tag: ${cond.value ?? "?"}`;
    return kind ?? "";
  }

  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((eds) =>
        addEdge(
          {
            ...c,
            label: "always",
            data: { condition: { kind: "always" } },
            markerEnd: { type: MarkerType.ArrowClosed },
          },
          eds
        )
      ),
    [setEdges]
  );

  function addNode(kind: Kind, position?: { x: number; y: number }) {
    const id = crypto.randomUUID();
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "lab",
        position: position ?? { x: 120 + ns.length * 30, y: 80 + ns.length * 30 },
        data: { kind, label: KIND_META[kind].label, scenarioId: null, scenarioName: null, config: {} } as NodeData,
      },
    ]);
    setSelNodeId(id);
    setSelEdgeId(null);
  }

  function onDragStartPalette(e: React.DragEvent, kind: Kind) {
    e.dataTransfer.setData("application/reactflow", kind);
    e.dataTransfer.effectAllowed = "move";
  }
  function onDragOver(e: React.DragEvent) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    const kind = e.dataTransfer.getData("application/reactflow") as Kind;
    if (!kind || !KIND_META[kind] || !rf) return;
    const position = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(kind, position);
  }

  function patchNodeData(id: string, patch: Partial<NodeData>) {
    setNodes((ns) =>
      ns.map((n) => (n.id === id ? { ...n, data: { ...(n.data as NodeData), ...patch } } : n))
    );
  }

  function patchEdge(id: string, condition: Record<string, unknown>) {
    setEdges((es) =>
      es.map((e) =>
        e.id === id ? { ...e, data: { condition }, label: conditionLabel(condition) } : e
      )
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
        return {
          id: n.id,
          type: d.kind,
          scenario_id: d.scenarioId,
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
        condition: (e.data as { condition?: Record<string, unknown> })?.condition ?? { kind: "always" },
        label: typeof e.label === "string" ? e.label : "",
      }));
      await saveScriptGraph(scriptId, nodeRows, edgeRows);
      setNotice("Script saved.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to save");
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
    } catch (e: any) {
      setError(e?.message ?? "Failed to create");
    }
  }

  async function handleDeleteScript() {
    if (!scriptId) return;
    if (!window.confirm("Delete this script and its flow?")) return;
    try {
      await deleteScript(scriptId);
      const left = await listScripts();
      setScripts(left);
      setScriptId(left[0]?.id ?? null);
      if (left[0]) loadScript(left[0].id);
      else {
        setNodes([]);
        setEdges([]);
      }
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete");
    }
  }

  async function handleSetActive() {
    if (!scriptId) return;
    try {
      await saveLabSettings({ active_script_id: scriptId });
      setActiveScriptId(scriptId);
      setNotice("This script is now active for test calls.");
    } catch (e: any) {
      setError(e?.message ?? "Failed to set active");
    }
  }
  async function handleClearActive() {
    try {
      await saveLabSettings({ active_script_id: null });
      setActiveScriptId(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed");
    }
  }

  const selNode = nodes.find((n) => n.id === selNodeId) ?? null;
  const selNodeData = selNode ? (selNode.data as NodeData) : null;
  const selEdge = edges.find((e) => e.id === selEdgeId) ?? null;
  const selEdgeCond = (selEdge?.data as { condition?: Record<string, unknown> } | undefined)?.condition ?? {
    kind: "always",
  };

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
          {(Object.keys(KIND_META) as Kind[]).map((k) => (
            <button
              key={k}
              draggable={!!scriptId}
              onDragStart={(e) => onDragStartPalette(e, k)}
              onClick={() => scriptId && addNode(k)}
              disabled={!scriptId}
              className={`flex w-full cursor-grab items-center gap-1.5 rounded-lg border-2 px-2.5 py-1.5 text-left text-xs font-medium text-gray-200 transition hover:brightness-125 active:cursor-grabbing disabled:opacity-40 ${KIND_META[k].color}`}
            >
              <svg className="h-3 w-3 shrink-0 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" />
                <circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" />
                <circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" />
              </svg>
              {KIND_META[k].label}
            </button>
          ))}
          <p className="pt-2 text-[10px] text-gray-600">Drag a box onto the canvas (or click to drop it). Then drag from a box&rsquo;s bottom dot to another box&rsquo;s top dot to connect.</p>
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
        {(selNodeData || selEdge) && (
          <div className="w-72 shrink-0 space-y-3 overflow-y-auto border-l border-gray-800 p-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">
                {selNodeData ? `${KIND_META[selNodeData.kind].label} box` : "Connection"}
              </p>
              <button onClick={deleteSelected} className="text-[11px] text-rose-400 hover:text-rose-300">
                Delete
              </button>
            </div>

            {/* Node config */}
            {selNode && selNodeData && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Label</label>
                  <input
                    className={inputCls}
                    value={selNodeData.label}
                    onChange={(e) => patchNodeData(selNode.id, { label: e.target.value })}
                  />
                </div>

                {(selNodeData.kind === "say" ||
                  selNodeData.kind === "switch" ||
                  selNodeData.kind === "start" ||
                  selNodeData.kind === "end") && (
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">
                      Scenario {selNodeData.kind === "switch" ? "(line before asking)" : "(line to speak)"}
                    </label>
                    <select
                      className={inputCls + " [color-scheme:dark]"}
                      value={selNodeData.scenarioId ?? ""}
                      onChange={(e) =>
                        patchNodeData(selNode.id, {
                          scenarioId: e.target.value || null,
                          scenarioName: scenarioName(e.target.value || null),
                        })
                      }
                    >
                      <option value="">(none)</option>
                      {scenarios.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                {(selNodeData.kind === "say" || selNodeData.kind === "switch") && (
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">
                      Also consider <span className="text-gray-600">(router picks the best fit at this step)</span>
                    </label>
                    {((selNodeData.config.candidateScenarioIds as string[]) ?? []).length > 0 && (
                      <div className="mb-1.5 flex flex-wrap gap-1.5">
                        {((selNodeData.config.candidateScenarioIds as string[]) ?? []).map((cid) => (
                          <button
                            key={cid}
                            onClick={() =>
                              patchNodeData(selNode.id, {
                                config: {
                                  ...selNodeData.config,
                                  candidateScenarioIds: ((selNodeData.config.candidateScenarioIds as string[]) ?? []).filter(
                                    (x) => x !== cid
                                  ),
                                },
                              })
                            }
                            className="inline-flex items-center gap-1 rounded-full bg-indigo-500/15 px-2 py-0.5 text-[11px] font-medium text-indigo-300 hover:bg-indigo-500/25"
                          >
                            {scenarioName(cid) ?? "scenario"} <span className="text-indigo-400">×</span>
                          </button>
                        ))}
                      </div>
                    )}
                    <select
                      className={inputCls + " [color-scheme:dark]"}
                      value=""
                      onChange={(e) => {
                        const id = e.target.value;
                        if (!id) return;
                        const cur = (selNodeData.config.candidateScenarioIds as string[]) ?? [];
                        if (id === selNodeData.scenarioId || cur.includes(id)) return;
                        patchNodeData(selNode.id, {
                          config: { ...selNodeData.config, candidateScenarioIds: [...cur, id] },
                        });
                      }}
                    >
                      <option value="">+ add candidate scenario…</option>
                      {scenarios
                        .filter(
                          (s) =>
                            s.id !== selNodeData.scenarioId &&
                            !((selNodeData.config.candidateScenarioIds as string[]) ?? []).includes(s.id)
                        )
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.name}
                          </option>
                        ))}
                    </select>
                  </div>
                )}

                {selNodeData.kind === "start" && (
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Opening mode</label>
                    <select
                      className={inputCls + " [color-scheme:dark]"}
                      value={(selNodeData.config.mode as string) ?? "agent_first"}
                      onChange={(e) =>
                        patchNodeData(selNode.id, { config: { ...selNodeData.config, mode: e.target.value } })
                      }
                    >
                      <option value="agent_first">Agent speaks first</option>
                      <option value="wait_for_customer">Wait for the customer to speak</option>
                    </select>
                  </div>
                )}

                {(selNodeData.kind === "say" || selNodeData.kind === "switch") && (
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">
                      Active tags at this step <span className="text-gray-600">(scope — blank = all)</span>
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {allTags.map((t) => {
                        const scope = (selNodeData.config.scopeTags as string[]) ?? [];
                        const on = scope.includes(t);
                        return (
                          <button
                            key={t}
                            onClick={() =>
                              patchNodeData(selNode.id, {
                                config: {
                                  ...selNodeData.config,
                                  scopeTags: on ? scope.filter((x) => x !== t) : [...scope, t],
                                },
                              })
                            }
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition ${
                              on ? "bg-purple-500/25 text-purple-200" : "border border-gray-700 text-gray-400"
                            }`}
                          >
                            {t}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {selNodeData.kind === "transfer" && (
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Transfer to (phone number)</label>
                    <input
                      className={inputCls}
                      value={(selNodeData.config.number as string) ?? ""}
                      onChange={(e) =>
                        patchNodeData(selNode.id, { config: { ...selNodeData.config, number: e.target.value } })
                      }
                      placeholder="+1..."
                    />
                  </div>
                )}

                {selNodeData.kind === "set_variable" && (
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Name</label>
                      <input
                        className={inputCls}
                        value={(selNodeData.config.name as string) ?? ""}
                        onChange={(e) =>
                          patchNodeData(selNode.id, { config: { ...selNodeData.config, name: e.target.value } })
                        }
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs text-gray-400">Value</label>
                      <input
                        className={inputCls}
                        value={(selNodeData.config.value as string) ?? ""}
                        onChange={(e) =>
                          patchNodeData(selNode.id, { config: { ...selNodeData.config, value: e.target.value } })
                        }
                      />
                    </div>
                  </div>
                )}

                {selNodeData.kind === "switch" && (
                  <p className="rounded-lg border border-gray-700 bg-gray-900/50 p-2 text-[11px] text-gray-500">
                    Draw multiple arrows out of this box, then click each arrow to set its condition (by intent or tag).
                  </p>
                )}
              </>
            )}

            {/* Edge config */}
            {selEdge && (
              <>
                <div>
                  <label className="mb-1 block text-xs text-gray-400">Condition type</label>
                  <select
                    className={inputCls + " [color-scheme:dark]"}
                    value={(selEdgeCond.kind as string) ?? "always"}
                    onChange={(e) => {
                      const kind = e.target.value;
                      patchEdge(selEdge.id, kind === "intent" || kind === "tag" ? { kind, value: "" } : { kind });
                    }}
                  >
                    <option value="always">Always</option>
                    <option value="intent">If intent is…</option>
                    <option value="tag">If reply is tagged…</option>
                    <option value="else">Otherwise (fallback)</option>
                  </select>
                </div>
                {selEdgeCond.kind === "intent" && (
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Intent key</label>
                    <select
                      className={inputCls + " [color-scheme:dark]"}
                      value={(selEdgeCond.value as string) ?? ""}
                      onChange={(e) => patchEdge(selEdge.id, { kind: "intent", value: e.target.value })}
                    >
                      <option value="">(pick a scenario intent)</option>
                      {scenarios.map((s) => (
                        <option key={s.id} value={s.intent_key}>
                          {s.intent_key}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                {selEdgeCond.kind === "tag" && (
                  <div>
                    <label className="mb-1 block text-xs text-gray-400">Tag</label>
                    <select
                      className={inputCls + " [color-scheme:dark]"}
                      value={(selEdgeCond.value as string) ?? ""}
                      onChange={(e) => patchEdge(selEdge.id, { kind: "tag", value: e.target.value })}
                    >
                      <option value="">(pick a tag)</option>
                      {allTags.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
