"use client";

import { useCallback, useEffect, useState } from "react";
import { useAgent } from "@/lib/agent-context";
import {
  listPrompts,
  createPrompt,
  updatePrompt,
  setActivePrompt,
  deletePrompt,
} from "@/lib/db";
import type { PromptLibraryItem } from "@/lib/database.types";

export default function PromptsPage() {
  const { session } = useAgent();
  const assistantId = session?.assistantId ?? "";
  const assistantName = session?.assistantName ?? "";
  const isOwner = session?.isOwner ?? false;

  const [prompts, setPrompts] = useState<PromptLibraryItem[]>([]);
  const [agentNames, setAgentNames] = useState<Record<string, string>>({});
  const [agentsWithoutPrompts, setAgentsWithoutPrompts] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PromptLibraryItem | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Edit form
  const [editName, setEditName] = useState("");
  const [editContent, setEditContent] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activating, setActivating] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // New prompt form
  const [showNew, setShowNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [allPrompts, vapiAgentsRes] = await Promise.all([
        listPrompts(), // no filter = all agents
        fetch("/api/vapi-assistants").then((r) => r.json()).catch(() => []),
      ]);

      // Filter out prompts not linked to any agent
      const linked = (allPrompts as PromptLibraryItem[]).filter((p) => p.assistant_id);

      // Sort: own agent first, then others; within each group active first then newest
      linked.sort((a, b) => {
        const aOwn = a.assistant_id === assistantId ? 1 : 0;
        const bOwn = b.assistant_id === assistantId ? 1 : 0;
        if (aOwn !== bOwn) return bOwn - aOwn;
        const aAct = a.is_active ? 1 : 0;
        const bAct = b.is_active ? 1 : 0;
        if (aAct !== bAct) return bAct - aAct;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });

      setPrompts(linked);

      // Build agent name map from VAPI (authoritative source for all agents)
      const nameMap: Record<string, string> = {};
      if (Array.isArray(vapiAgentsRes)) {
        for (const a of vapiAgentsRes) {
          if (a.id && a.name) nameMap[a.id] = a.name;
        }
      }
      // Ensure current agent is always in the map
      if (assistantId && assistantName) nameMap[assistantId] = assistantName;
      setAgentNames(nameMap);

      // Track which agents have DB prompts vs are using VAPI defaults
      const agentsWithPrompts = new Set(linked.map((p) => p.assistant_id));
      const allAgentIds = Object.keys(nameMap);
      setAgentsWithoutPrompts(allAgentIds.filter((id) => !agentsWithPrompts.has(id)));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [assistantId, assistantName]);

  useEffect(() => { load(); }, [load]);

  function selectPrompt(p: PromptLibraryItem) {
    setShowNew(false);
    setSelected(p);
    setEditName(p.name);
    setEditContent(p.content);
    setEditNotes(p.notes ?? "");
    setDirty(false);
    setActionError(null);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    setActionError(null);
    try {
      await updatePrompt(selected.id, { name: editName, content: editContent, notes: editNotes });
      const updated = { ...selected, name: editName, content: editContent, notes: editNotes };
      setPrompts((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
      setSelected(updated);
      setDirty(false);
    } catch (e: any) {
      setActionError(e?.message ?? "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive() {
    if (!selected) return;
    setActivating(true);
    setActionError(null);
    try {
      const res = await fetch("/api/vapi-assistant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId, systemPrompt: editContent }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update VAPI assistant");
      }
      await setActivePrompt(selected.id, assistantId);
      setPrompts((prev) =>
        prev.map((p) => ({
          ...p,
          is_active: p.assistant_id === assistantId ? p.id === selected.id : p.is_active,
        }))
      );
      setSelected((s) => (s ? { ...s, is_active: true } : s));
    } catch (e: any) {
      setActionError(e?.message ?? "Failed to set active");
    } finally {
      setActivating(false);
    }
  }

  async function handleDelete() {
    if (!selected) return;
    if (!window.confirm(`Delete "${selected.name}"? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      await deletePrompt(selected.id);
      setPrompts((prev) => prev.filter((p) => p.id !== selected.id));
      setSelected(null);
    } catch (e: any) {
      setActionError(e?.message ?? "Failed to delete");
    } finally {
      setDeleting(false);
    }
  }

  // Create new prompt → save to DB + push to VAPI + set active
  async function handleAdd() {
    const name = newName.trim();
    const content = newContent.trim();
    if (!name || !content) return;
    setAdding(true);
    setActionError(null);
    try {
      const p = await createPrompt(name, content, newNotes.trim(), assistantId);

      const res = await fetch("/api/vapi-assistant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId, systemPrompt: content }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update VAPI assistant");
      }

      await setActivePrompt(p.id, assistantId);
      const activePrompt = { ...p, is_active: true };

      setPrompts((prev) => [
        activePrompt,
        ...prev.map((x) => (x.assistant_id === assistantId ? { ...x, is_active: false } : x)),
      ]);
      setShowNew(false);
      setNewName("");
      setNewContent("");
      setNewNotes("");
      selectPrompt(activePrompt);
    } catch (e: any) {
      setActionError(e?.message ?? "Failed to create prompt");
    } finally {
      setAdding(false);
    }
  }

  // Copy another agent's prompt to own agent, push to VAPI, set active
  async function handleUseOnMyAgent() {
    if (!selected || !isOwner) return;
    setActivating(true);
    setActionError(null);
    try {
      const copy = await createPrompt(selected.name, selected.content, selected.notes ?? "", assistantId);

      const res = await fetch("/api/vapi-assistant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId, systemPrompt: selected.content }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update VAPI assistant");
      }

      await setActivePrompt(copy.id, assistantId);
      const activeCopy = { ...copy, is_active: true };

      setPrompts((prev) => [
        activeCopy,
        ...prev.map((x) => (x.assistant_id === assistantId ? { ...x, is_active: false } : x)),
      ]);
      selectPrompt(activeCopy);
    } catch (e: any) {
      setActionError(e?.message ?? "Failed to apply prompt");
    } finally {
      setActivating(false);
    }
  }

  // Group prompts
  const ownPrompts = prompts.filter((p) => p.assistant_id === assistantId);
  const otherPrompts = prompts.filter((p) => p.assistant_id !== assistantId);
  const otherGroups: Record<string, PromptLibraryItem[]> = {};
  for (const p of otherPrompts) {
    const aid = p.assistant_id!;
    if (!otherGroups[aid]) otherGroups[aid] = [];
    otherGroups[aid].push(p);
  }

  const isOwnPrompt = selected?.assistant_id === assistantId;

  return (
    <div className="flex h-full flex-col bg-gray-950 text-white">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-800 px-4 py-3 sm:px-6">
        <div>
          <h1 className="text-lg font-bold tracking-tight text-white">Prompt Library</h1>
          <p className="text-xs text-gray-500">All prompts across agents</p>
        </div>
        {isOwner && (
          <button
            onClick={() => { setShowNew(true); setSelected(null); setActionError(null); }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            + New Prompt
          </button>
        )}
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-900/50">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Loading...</p>
          ) : (
            <>
              {/* Own agent prompts */}
              <div className="px-3 pb-1 pt-3">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-400">
                  {assistantName}
                </p>
              </div>
              {ownPrompts.length === 0 ? (
                <p className="px-3 py-2 text-xs text-gray-600">No prompts yet.</p>
              ) : (
                <ul>
                  {ownPrompts.map((p) => (
                    <li key={p.id}>
                      <button
                        onClick={() => selectPrompt(p)}
                        className={`w-full px-3 py-2.5 text-left transition ${
                          p.is_active
                            ? "border-l-2 border-emerald-400 bg-emerald-950/40 hover:bg-emerald-950/60"
                            : selected?.id === p.id
                            ? "bg-gray-800"
                            : "hover:bg-gray-800"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className={`truncate text-sm font-medium ${p.is_active ? "text-emerald-300" : "text-gray-200"}`}>
                            {p.name}
                          </span>
                          {p.is_active && (
                            <span className="shrink-0 rounded-full bg-emerald-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-400">
                              Active
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 text-[11px] text-gray-500">
                          {new Date(p.created_at).toLocaleDateString()}
                        </p>
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* Other agents with saved prompts */}
              {Object.entries(otherGroups).map(([agentId, agentPrompts]) => (
                <div key={agentId}>
                  <div className="mt-4 px-3 pb-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      {agentNames[agentId] ?? agentId.slice(0, 8) + "…"}
                    </p>
                  </div>
                  <ul>
                    {agentPrompts.map((p) => (
                      <li key={p.id}>
                        <button
                          onClick={() => selectPrompt(p)}
                          className={`w-full px-3 py-2.5 text-left transition ${
                            selected?.id === p.id ? "bg-gray-800" : "hover:bg-gray-800"
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-medium text-gray-400">{p.name}</span>
                            {p.is_active && (
                              <span className="shrink-0 rounded-full bg-gray-700 px-1.5 py-0.5 text-[10px] text-gray-400">
                                Active
                              </span>
                            )}
                          </div>
                          <p className="mt-0.5 text-[11px] text-gray-600">
                            {new Date(p.created_at).toLocaleDateString()}
                          </p>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              {/* Agents with no saved prompts — using VAPI default */}
              {agentsWithoutPrompts.filter((id) => id !== assistantId).map((agentId) => (
                <div key={agentId}>
                  <div className="mt-4 px-3 pb-1">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-gray-500">
                      {agentNames[agentId] ?? agentId.slice(0, 8) + "…"}
                    </p>
                  </div>
                  <div className="px-3 py-2">
                    <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-800 px-2 py-1 text-[11px] text-gray-500">
                      <span className="h-1.5 w-1.5 rounded-full bg-gray-600" />
                      Using VAPI default
                    </span>
                  </div>
                </div>
              ))}

              {/* Own agent using VAPI default (no saved prompts) */}
              {agentsWithoutPrompts.includes(assistantId) && ownPrompts.length === 0 && (
                <div className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md bg-gray-800 px-2 py-1 text-[11px] text-gray-500">
                    <span className="h-1.5 w-1.5 rounded-full bg-gray-600" />
                    Using VAPI default
                  </span>
                </div>
              )}
            </>
          )}
        </aside>

        {/* Main panel */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {showNew ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-6 space-y-4 max-w-3xl w-full mx-auto">
              <div>
                <h2 className="text-base font-semibold text-gray-200">New Prompt</h2>
                <p className="mt-0.5 text-xs text-gray-500">
                  Will be saved and immediately set as active on <span className="text-gray-300 font-medium">{assistantName}</span>.
                </p>
              </div>
              {actionError && <p className="text-xs text-red-400">{actionError}</p>}
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Friendly Sales Agent v2"
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
              <div className="flex flex-1 flex-col">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">System Prompt</label>
                <textarea
                  value={newContent}
                  onChange={(e) => setNewContent(e.target.value)}
                  placeholder="You are a helpful voice agent..."
                  className="flex-1 min-h-[300px] w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none font-mono"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">Notes (optional)</label>
                <textarea
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  placeholder="What changed, why this variant exists..."
                  rows={2}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
                />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleAdd}
                  disabled={adding || !newName.trim() || !newContent.trim()}
                  className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
                >
                  {adding ? "Saving..." : "Save & Set Active"}
                </button>
                <button
                  onClick={() => { setShowNew(false); setNewName(""); setNewContent(""); setNewNotes(""); setActionError(null); }}
                  className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-400 transition hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-6 space-y-4 max-w-3xl w-full mx-auto">
              {/* Status badges */}
              <div className="flex items-center gap-2 flex-wrap">
                {selected.is_active && isOwnPrompt && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-medium text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    Active on {assistantName}
                  </span>
                )}
                {!isOwnPrompt && (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-gray-700/50 border border-gray-600 px-3 py-1 text-xs text-gray-400">
                    From: {agentNames[selected.assistant_id!] ?? selected.assistant_id}
                  </span>
                )}
              </div>

              {actionError && <p className="text-xs text-red-400">{actionError}</p>}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => { setEditName(e.target.value); setDirty(true); }}
                  disabled={!isOwner || !isOwnPrompt}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="flex flex-1 flex-col">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">System Prompt</label>
                <textarea
                  value={editContent}
                  onChange={(e) => { setEditContent(e.target.value); setDirty(true); }}
                  disabled={!isOwner || !isOwnPrompt}
                  className="flex-1 min-h-[300px] w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none resize-none font-mono disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => { setEditNotes(e.target.value); setDirty(true); }}
                  disabled={!isOwner || !isOwnPrompt}
                  rows={2}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {isOwner && isOwnPrompt && (
                  <>
                    <button
                      onClick={handleSave}
                      disabled={saving || !dirty}
                      className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
                    >
                      {saving ? "Saving..." : "Save Changes"}
                    </button>
                    <button
                      onClick={handleSetActive}
                      disabled={activating || selected.is_active}
                      className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:opacity-40"
                    >
                      {activating ? "Activating..." : selected.is_active ? "Active on VAPI" : "Set Active on VAPI"}
                    </button>
                    <button
                      onClick={handleDelete}
                      disabled={deleting}
                      className="ml-auto text-xs text-gray-500 transition hover:text-red-400 disabled:opacity-40"
                    >
                      {deleting ? "Deleting..." : "Delete"}
                    </button>
                  </>
                )}
                {isOwner && !isOwnPrompt && (
                  <button
                    onClick={handleUseOnMyAgent}
                    disabled={activating}
                    className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-40"
                  >
                    {activating ? "Applying..." : `Use on ${assistantName}`}
                  </button>
                )}
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-600">
              <p className="text-sm">Select a prompt or create a new one</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
