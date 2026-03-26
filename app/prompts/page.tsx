"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  listPrompts,
  createPrompt,
  updatePrompt,
  setActivePrompt,
  deletePrompt,
} from "@/lib/db";
import type { PromptLibraryItem } from "@/lib/database.types";

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<PromptLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PromptLibraryItem | null>(null);

  // Editor state
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

  // Import from VAPI
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await listPrompts();
      setPrompts(data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function selectPrompt(p: PromptLibraryItem) {
    setSelected(p);
    setEditName(p.name);
    setEditContent(p.content);
    setEditNotes(p.notes);
    setDirty(false);
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      await updatePrompt(selected.id, {
        name: editName,
        content: editContent,
        notes: editNotes,
      });
      const updated = { ...selected, name: editName, content: editContent, notes: editNotes };
      setPrompts((prev) => prev.map((p) => (p.id === selected.id ? updated : p)));
      setSelected(updated);
      setDirty(false);
    } catch {
      // silent
    } finally {
      setSaving(false);
    }
  }

  async function handleSetActive() {
    if (!selected) return;
    setActivating(true);
    try {
      // Update VAPI assistant
      const res = await fetch("/api/vapi-assistant", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemPrompt: editContent }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        throw new Error(json.error ?? "Failed to update VAPI assistant");
      }

      // Mark active in Supabase
      await setActivePrompt(selected.id);
      const updated = prompts.map((p) => ({ ...p, is_active: p.id === selected.id }));
      setPrompts(updated);
      setSelected({ ...selected, is_active: true });
    } catch (e: any) {
      alert(e?.message ?? "Failed to set active prompt");
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
    } catch {
      // silent
    } finally {
      setDeleting(false);
    }
  }

  async function handleAdd() {
    const name = newName.trim();
    const content = newContent.trim();
    if (!name || !content) return;
    setAdding(true);
    try {
      const p = await createPrompt(name, content, newNotes.trim());
      setPrompts((prev) => [p, ...prev]);
      setShowNew(false);
      setNewName("");
      setNewContent("");
      setNewNotes("");
      selectPrompt(p);
    } catch {
      // silent
    } finally {
      setAdding(false);
    }
  }

  async function handleImportFromVapi() {
    setImporting(true);
    setImportError(null);
    try {
      const res = await fetch("/api/vapi-assistant");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Failed to fetch assistant");
      if (!json.systemPrompt) throw new Error("No system prompt found on VAPI assistant");

      setNewContent(json.systemPrompt);
      setNewName("Imported from VAPI");
      setShowNew(true);
    } catch (e: any) {
      setImportError(e?.message ?? "Import failed");
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="flex h-dvh flex-col bg-gray-950 text-white">
      {/* Top bar */}
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-gray-800 px-4 py-3 sm:px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <h1 className="text-lg font-bold tracking-tight">Prompt Library</h1>
        </div>

        <div className="flex items-center gap-2">
          {importError && (
            <span className="text-xs text-red-400">{importError}</span>
          )}
          <button
            onClick={handleImportFromVapi}
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-600 px-3 py-1.5 text-sm font-medium text-gray-300 transition hover:bg-gray-800 disabled:opacity-50"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {importing ? "Importing..." : "Import from VAPI"}
          </button>
          <button
            onClick={() => {
              setShowNew(true);
              setSelected(null);
            }}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-500"
          >
            + New Prompt
          </button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 shrink-0 overflow-y-auto border-r border-gray-800 bg-gray-900/50">
          {loading ? (
            <p className="p-4 text-sm text-gray-500">Loading...</p>
          ) : prompts.length === 0 ? (
            <p className="p-4 text-sm text-gray-500">No prompts yet. Import from VAPI or create a new one.</p>
          ) : (
            <ul className="py-2">
              {prompts.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => selectPrompt(p)}
                    className={`w-full px-4 py-3 text-left transition hover:bg-gray-800 ${
                      selected?.id === p.id ? "bg-gray-800" : ""
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {p.is_active && (
                        <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" title="Active" />
                      )}
                      <span className={`truncate text-sm font-medium ${p.is_active ? "text-emerald-300" : "text-gray-200"}`}>
                        {p.name}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-gray-500">
                      {new Date(p.created_at).toLocaleDateString()}
                    </p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        {/* Main panel */}
        <main className="flex flex-1 flex-col overflow-hidden">
          {showNew ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-6 space-y-4 max-w-3xl w-full mx-auto">
              <h2 className="text-base font-semibold text-gray-200">New Prompt</h2>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">Name</label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Friendly Sales Agent v2"
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
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
                  {adding ? "Saving..." : "Save Prompt"}
                </button>
                <button
                  onClick={() => { setShowNew(false); setNewName(""); setNewContent(""); setNewNotes(""); }}
                  className="rounded-lg border border-gray-600 px-4 py-2 text-sm text-gray-400 transition hover:bg-gray-800"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : selected ? (
            <div className="flex flex-1 flex-col overflow-y-auto p-6 space-y-4 max-w-3xl w-full mx-auto">
              {/* Active badge */}
              {selected.is_active && (
                <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-medium text-emerald-400 self-start">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  Active on VAPI
                </div>
              )}

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">Name</label>
                <input
                  type="text"
                  value={editName}
                  onChange={(e) => { setEditName(e.target.value); setDirty(true); }}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                />
              </div>

              <div className="flex flex-1 flex-col">
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">System Prompt</label>
                <textarea
                  value={editContent}
                  onChange={(e) => { setEditContent(e.target.value); setDirty(true); }}
                  className="flex-1 min-h-[300px] w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none resize-none font-mono"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-gray-400">Notes</label>
                <textarea
                  value={editNotes}
                  onChange={(e) => { setEditNotes(e.target.value); setDirty(true); }}
                  rows={2}
                  className="w-full rounded-lg border border-gray-600 bg-gray-800 px-3 py-2 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none resize-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
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
              </div>
            </div>
          ) : (
            <div className="flex flex-1 items-center justify-center text-gray-600">
              <p className="text-sm">Select a prompt from the sidebar or create a new one</p>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
