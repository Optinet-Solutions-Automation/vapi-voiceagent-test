"use client";

import { useEffect, useState } from "react";
import {
  listHandlers,
  createHandler,
  updateHandler,
  deleteHandler,
  renameGroup,
  clearGroup,
} from "@/lib/lab-db";
import type { ListenerHandler } from "@/lib/database.types";

const inputCls =
  "w-full rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none";

const ACTION_COLORS: Record<string, string> = {
  answer: "bg-indigo-500/15 text-indigo-300",
  give_offer: "bg-emerald-500/15 text-emerald-300",
  send_sms: "bg-amber-500/15 text-amber-300",
  end_call: "bg-rose-500/15 text-rose-300",
  ignore: "bg-gray-700 text-gray-400",
};

const STARTER_HANDLERS = [
  {
    name: "Greeting",
    intent_key: "greeting",
    description: "The customer says hello, hi, good morning, or asks who's calling.",
    response_template: "Greet them warmly and briefly say why you're calling.",
    action_type: "answer" as const,
    delivery: "reword" as const,
    group_name: "Greeting",
    priority: 10,
  },
  {
    name: "Pricing Question",
    intent_key: "pricing_question",
    description: "Questions about price, cost, fees, how much something is.",
    response_template: "The standard plan is forty-nine dollars a month, with no setup fee.",
    action_type: "answer" as const,
    delivery: "verbatim" as const,
    group_name: "Q&A",
    priority: 20,
  },
  {
    name: "Give Offer",
    intent_key: "give_offer",
    description: "The customer shows interest, asks what you can do for them, or asks about deals/promotions.",
    response_template: "We've got a special three hundred percent deposit bonus available today only.",
    action_type: "give_offer" as const,
    delivery: "verbatim" as const,
    group_name: "Promotions",
    priority: 30,
  },
  {
    name: "Send SMS",
    intent_key: "send_sms",
    description: "The customer agrees to receive details by text/SMS, or asks you to text them.",
    response_template: "Perfect — I'll text you the details right now.",
    action_type: "send_sms" as const,
    delivery: "verbatim" as const,
    group_name: "SMS",
    priority: 40,
  },
  {
    name: "Goodbye / Not Interested",
    intent_key: "goodbye",
    description: "The customer says goodbye, asks to end the call, or firmly says they're not interested after the offer was presented.",
    response_template: "Thanks so much for your time today. Have a great day. Goodbye!",
    action_type: "end_call" as const,
    delivery: "verbatim" as const,
    group_name: "Closing",
    priority: 50,
  },
];

type Draft = {
  id?: string;
  name: string;
  intent_key: string;
  description: string;
  response_template: string;
  action_type: ListenerHandler["action_type"];
  delivery: ListenerHandler["delivery"];
  group_name: string;
  mode: ListenerHandler["mode"];
  priority: number;
  enabled: boolean;
};

const EMPTY_DRAFT: Draft = {
  name: "",
  intent_key: "",
  description: "",
  response_template: "",
  action_type: "answer",
  delivery: "verbatim",
  group_name: "",
  mode: "both",
  priority: 100,
  enabled: true,
};

const PAGE_SIZE = 8;

export default function OrganizerTable() {
  const [handlers, setHandlers] = useState<ListenerHandler[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [saving, setSaving] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState("");
  const [groupFilter, setGroupFilter] = useState("");
  const [page, setPage] = useState(1);
  const [addingGroup, setAddingGroup] = useState(false);
  const [showGroups, setShowGroups] = useState(false);

  async function reload() {
    try {
      setHandlers(await listHandlers());
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? "Failed to load handlers");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, groupFilter]);

  const groups = Array.from(
    new Set(handlers.map((h) => h.group_name).filter(Boolean))
  ).sort();

  const q = search.trim().toLowerCase();
  const filtered = handlers.filter((h) => {
    if (groupFilter && h.group_name !== groupFilter) return false;
    if (
      q &&
      !`${h.name} ${h.intent_key} ${h.description} ${h.response_template} ${h.action_type} ${h.delivery} ${h.group_name}`
        .toLowerCase()
        .includes(q)
    )
      return false;
    return true;
  });
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageClamped = Math.min(page, totalPages);
  const paginated = filtered.slice((pageClamped - 1) * PAGE_SIZE, pageClamped * PAGE_SIZE);

  async function handleSeed() {
    setSeeding(true);
    try {
      for (const h of STARTER_HANDLERS) {
        await createHandler(h);
      }
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Failed to seed handlers");
    } finally {
      setSeeding(false);
    }
  }

  async function handleSaveDraft() {
    if (!draft || !draft.name.trim() || !draft.intent_key.trim()) return;
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        intent_key: draft.intent_key.trim().toLowerCase().replace(/\s+/g, "_"),
        description: draft.description,
        response_template: draft.response_template,
        action_type: draft.action_type,
        delivery: draft.delivery,
        group_name: draft.group_name.trim(),
        mode: draft.mode,
        priority: draft.priority,
        enabled: draft.enabled,
      };
      if (draft.id) {
        await updateHandler(draft.id, payload);
      } else {
        await createHandler(payload);
      }
      setDraft(null);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Failed to save handler");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    if (!window.confirm("Delete this handler?")) return;
    try {
      await deleteHandler(id);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete handler");
    }
  }

  async function handleRenameGroup(oldName: string, newName: string) {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    try {
      await renameGroup(oldName, trimmed);
      if (groupFilter === oldName) setGroupFilter(trimmed);
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Failed to rename group");
    }
  }

  async function handleDeleteGroup(name: string) {
    if (!window.confirm(`Remove the group "${name}"? Handlers stay but become ungrouped.`)) return;
    try {
      await clearGroup(name);
      if (groupFilter === name) setGroupFilter("");
      await reload();
    } catch (e: any) {
      setError(e?.message ?? "Failed to delete group");
    }
  }

  async function handleToggle(h: ListenerHandler) {
    try {
      await updateHandler(h.id, { enabled: !h.enabled });
      setHandlers((hs) =>
        hs.map((x) => (x.id === h.id ? { ...x, enabled: !x.enabled } : x))
      );
    } catch (e: any) {
      setError(e?.message ?? "Failed to toggle handler");
    }
  }

  return (
    <div className="rounded-xl border border-gray-700 bg-gray-800/50 overflow-hidden">
      <div className="flex items-center gap-2 border-b border-gray-700 px-4 py-3">
        <div className="relative flex-1">
          <svg className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search handlers…"
            className="w-full rounded-lg border border-gray-700 bg-gray-800 py-1.5 pl-8 pr-3 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
          />
        </div>
        {groups.length > 0 && (
          <select
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            className="shrink-0 rounded-lg border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none [color-scheme:dark]"
          >
            <option value="">All groups</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        )}
        {groups.length > 0 && (
          <button
            onClick={() => setShowGroups(true)}
            className="shrink-0 rounded-lg border border-gray-700 px-3 py-1.5 text-xs font-medium text-gray-300 transition hover:bg-gray-700"
          >
            Manage Groups
          </button>
        )}
        <button
          onClick={() => {
            setAddingGroup(false);
            setDraft({ ...EMPTY_DRAFT });
          }}
          className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
        >
          + Add Handler
        </button>
      </div>

      {error && <p className="px-4 py-2 text-xs text-red-400">{error}</p>}

      {loading && <p className="px-4 py-8 text-center text-sm text-gray-500">Loading handlers...</p>}

      {!loading && handlers.length === 0 && !draft && (
        <div className="px-4 py-8 text-center">
          <p className="mb-3 text-sm text-gray-500">No handlers yet.</p>
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-700 disabled:opacity-40"
          >
            {seeding ? "Adding..." : "Add starter handlers (greeting, pricing, offer, SMS, goodbye)"}
          </button>
        </div>
      )}

      {!loading && handlers.length > 0 && filtered.length === 0 && (
        <p className="px-4 py-8 text-center text-sm text-gray-500">No handlers match &ldquo;{search}&rdquo;.</p>
      )}

      {paginated.map((h) => (
        <div
          key={h.id}
          className={`flex flex-wrap items-center gap-3 border-b border-gray-700/50 px-4 py-3 last:border-b-0 ${
            h.enabled ? "" : "opacity-50"
          }`}
        >
          <button
            onClick={() => handleToggle(h)}
            title={h.enabled ? "Disable" : "Enable"}
            className={`relative h-5 w-9 shrink-0 rounded-full transition ${
              h.enabled ? "bg-emerald-600" : "bg-gray-600"
            }`}
          >
            <span
              className={`absolute top-0.5 h-4 w-4 rounded-full bg-white transition-all ${
                h.enabled ? "left-[18px]" : "left-0.5"
              }`}
            />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-gray-200">{h.name}</span>
              {h.group_name && (
                <span className="rounded-full bg-purple-500/15 px-2 py-0.5 text-[10px] font-medium text-purple-300">
                  {h.group_name}
                </span>
              )}
              <code className="rounded bg-gray-700/60 px-1.5 py-0.5 text-[10px] text-gray-400">
                {h.intent_key}
              </code>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  ACTION_COLORS[h.action_type] ?? "bg-gray-700 text-gray-300"
                }`}
              >
                {h.action_type}
              </span>
              <span className="rounded-full bg-gray-700/60 px-2 py-0.5 text-[10px] text-gray-400">
                {h.mode}
              </span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  h.delivery === "verbatim"
                    ? "bg-sky-500/15 text-sky-300"
                    : "bg-amber-500/15 text-amber-300"
                }`}
                title={
                  h.delivery === "verbatim"
                    ? "Spoken word-for-word"
                    : "Reworded by the agent in its own voice"
                }
              >
                {h.delivery === "verbatim" ? "verbatim" : "reword"}
              </span>
              <span className="text-[10px] text-gray-600">p{h.priority}</span>
            </div>
            {h.description && (
              <p className="mt-0.5 truncate text-xs text-gray-500">{h.description}</p>
            )}
            {h.response_template && (
              <p className="mt-0.5 truncate text-xs text-gray-400 italic">
                → {h.response_template}
              </p>
            )}
          </div>

          <div className="flex shrink-0 gap-1">
            <button
              onClick={() => {
                setAddingGroup(false);
                setDraft({
                  id: h.id,
                  name: h.name,
                  intent_key: h.intent_key,
                  description: h.description,
                  response_template: h.response_template,
                  action_type: h.action_type,
                  delivery: h.delivery,
                  group_name: h.group_name,
                  mode: h.mode,
                  priority: h.priority,
                  enabled: h.enabled,
                });
              }}
              className="rounded p-1.5 text-gray-500 transition hover:bg-gray-700 hover:text-gray-200"
              title="Edit"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
            </button>
            <button
              onClick={() => handleDelete(h.id)}
              className="rounded p-1.5 text-gray-500 transition hover:bg-gray-700 hover:text-rose-400"
              title="Delete"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* Pagination */}
      {!loading && filtered.length > PAGE_SIZE && (
        <div className="flex items-center justify-between gap-2 border-t border-gray-700 px-4 py-2.5">
          <p className="text-[11px] text-gray-500">
            {(pageClamped - 1) * PAGE_SIZE + 1}–{Math.min(pageClamped * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={pageClamped === 1}
              className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 transition hover:bg-gray-700 disabled:opacity-40"
            >
              Prev
            </button>
            <span className="px-1 py-1 text-xs text-gray-500">
              {pageClamped} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={pageClamped === totalPages}
              className="rounded-lg border border-gray-700 px-2.5 py-1 text-xs text-gray-300 transition hover:bg-gray-700 disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}

      {/* Manage Groups modal */}
      {showGroups && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setShowGroups(false)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85vh] w-full max-w-md overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl space-y-3"
          >
            <div>
              <h3 className="text-base font-bold text-white">Manage Groups</h3>
              <p className="text-[11px] text-gray-500">
                Rename or remove a group across all its handlers. To add a group, assign it on a handler.
              </p>
            </div>
            {groups.length === 0 && <p className="text-sm text-gray-500">No groups yet.</p>}
            {groups.map((g) => {
              const count = handlers.filter((h) => h.group_name === g).length;
              return (
                <div key={g} className="flex items-center gap-2">
                  <input
                    defaultValue={g}
                    onBlur={(e) => handleRenameGroup(g, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="flex-1 rounded-md border border-gray-700 bg-gray-800 px-2.5 py-1.5 text-sm text-gray-200 focus:border-indigo-500 focus:outline-none"
                  />
                  <span className="shrink-0 text-[11px] text-gray-500">{count}</span>
                  <button
                    onClick={() => handleDeleteGroup(g)}
                    className="shrink-0 rounded p-1.5 text-gray-500 transition hover:bg-gray-700 hover:text-rose-400"
                    title="Remove group"
                  >
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              );
            })}
            <p className="text-[10px] text-gray-600">Tip: editing a name and clicking away renames the group everywhere.</p>
            <button
              onClick={() => setShowGroups(false)}
              className="w-full rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Add/Edit modal */}
      {draft && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" onClick={() => setDraft(null)}>
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-gray-700 bg-gray-900 p-5 shadow-2xl space-y-3"
          >
            <h3 className="text-base font-bold text-white">
              {draft.id ? "Edit Handler" : "New Handler"}
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-400">Name</label>
                <input
                  className={inputCls}
                  value={draft.name}
                  onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                  placeholder="Pricing Question"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Intent Key</label>
                <input
                  className={inputCls}
                  value={draft.intent_key}
                  onChange={(e) => setDraft({ ...draft, intent_key: e.target.value })}
                  placeholder="pricing_question"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-400">
                Group <span className="text-gray-600">(category for organizing &amp; filtering)</span>
              </label>
              <select
                className={inputCls + " [color-scheme:dark]"}
                value={addingGroup ? "__new__" : draft.group_name}
                onChange={(e) => {
                  if (e.target.value === "__new__") {
                    setAddingGroup(true);
                    setDraft({ ...draft, group_name: "" });
                  } else {
                    setAddingGroup(false);
                    setDraft({ ...draft, group_name: e.target.value });
                  }
                }}
              >
                <option value="">(no group)</option>
                {groups.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
                <option value="__new__">+ New group…</option>
              </select>
              {addingGroup && (
                <input
                  className={inputCls + " mt-2"}
                  value={draft.group_name}
                  onChange={(e) => setDraft({ ...draft, group_name: e.target.value })}
                  placeholder="New group name (e.g. Promotions)"
                  autoFocus
                />
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-400">
                Match Guidance <span className="text-gray-600">(fed to the router LLM — when should this fire?)</span>
              </label>
              <textarea
                className={inputCls + " resize-none"}
                rows={2}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
                placeholder="Questions about price, cost, fees, how much something is."
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-400">
                Response{" "}
                <span className="text-gray-600">
                  {draft.delivery === "verbatim"
                    ? "(spoken word-for-word — write the exact line)"
                    : "(briefing — the agent rewords this in its own voice)"}
                </span>
              </label>
              <textarea
                className={inputCls + " resize-none"}
                rows={3}
                value={draft.response_template}
                onChange={(e) => setDraft({ ...draft, response_template: e.target.value })}
                placeholder={
                  draft.delivery === "verbatim"
                    ? "The wagering requirement is forty times the deposit."
                    : "Acknowledge kindly and offer to text the details."
                }
              />
            </div>

            <div>
              <label className="mb-1 block text-xs text-gray-400">Delivery</label>
              <div className="flex gap-2">
                {(["verbatim", "reword"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDraft({ ...draft, delivery: d })}
                    className={`flex-1 rounded-md border px-3 py-1.5 text-xs font-medium transition ${
                      draft.delivery === d
                        ? d === "verbatim"
                          ? "border-sky-500 bg-sky-500/15 text-sky-300"
                          : "border-amber-500 bg-amber-500/15 text-amber-300"
                        : "border-gray-700 text-gray-400 hover:bg-gray-800"
                    }`}
                  >
                    {d === "verbatim" ? "Verbatim (say exactly)" : "Reword (agent rephrases)"}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="mb-1 block text-xs text-gray-400">Action</label>
                <select
                  className={inputCls + " [color-scheme:dark]"}
                  value={draft.action_type}
                  onChange={(e) =>
                    setDraft({ ...draft, action_type: e.target.value as Draft["action_type"] })
                  }
                >
                  <option value="answer">answer</option>
                  <option value="give_offer">give_offer</option>
                  <option value="send_sms">send_sms</option>
                  <option value="end_call">end_call</option>
                  <option value="ignore">ignore</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Mode</label>
                <select
                  className={inputCls + " [color-scheme:dark]"}
                  value={draft.mode}
                  onChange={(e) => setDraft({ ...draft, mode: e.target.value as Draft["mode"] })}
                >
                  <option value="both">both</option>
                  <option value="tool">tool only</option>
                  <option value="listener">listener only</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs text-gray-400">Priority</label>
                <input
                  className={inputCls}
                  type="number"
                  value={draft.priority}
                  onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 100 })}
                />
              </div>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                onClick={() => setDraft(null)}
                disabled={saving}
                className="flex-1 rounded-lg border border-gray-700 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800 disabled:opacity-40"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveDraft}
                disabled={saving || !draft.name.trim() || !draft.intent_key.trim()}
                className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {saving ? "Saving..." : draft.id ? "Save Changes" : "Add Handler"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
