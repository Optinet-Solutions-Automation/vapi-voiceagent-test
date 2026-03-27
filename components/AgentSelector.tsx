"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAgent } from "@/lib/agent-context";

type Assistant = { id: string; name: string };
type Step = "list" | "password" | "set-password";

export default function AgentSelector() {
  const router = useRouter();
  const { setSession } = useAgent();

  function login(session: Parameters<typeof setSession>[0]) {
    setSession(session);
    router.push("/");
  }
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Assistant | null>(null);
  const [step, setStep] = useState<Step>("list");
  const [hasPassword, setHasPassword] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    fetch("/api/vapi-assistants")
      .then((r) => r.json())
      .then((data) => setAssistants(Array.isArray(data) ? data : []))
      .catch(() => setAssistants([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleSelectAgent(a: Assistant) {
    setSelected(a);
    setError("");
    setPasswordInput("");
    setChecking(true);
    try {
      const res = await fetch(`/api/agent-config?id=${a.id}`);
      const { has_password } = await res.json();
      setHasPassword(has_password);
      setStep(has_password ? "password" : "set-password");
    } catch {
      setError("Failed to check agent config.");
    } finally {
      setChecking(false);
    }
  }

  async function handleEnterOwner() {
    if (!selected) return;
    setError("");
    setChecking(true);
    try {
      const res = await fetch("/api/agent-config/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId: selected.id, password: passwordInput }),
      });
      const { valid } = await res.json();
      if (valid) {
        login({ assistantId: selected.id, assistantName: selected.name, isOwner: true });
      } else {
        setError("Incorrect password.");
      }
    } catch {
      setError("Failed to verify password.");
    } finally {
      setChecking(false);
    }
  }

  function handleViewOnly() {
    if (!selected) return;
    setSession({ assistantId: selected.id, assistantName: selected.name, isOwner: false });
  }

  async function handleSetPassword() {
    if (!selected) return;
    if (newPassword !== confirmPassword) { setError("Passwords do not match."); return; }
    setError("");
    setChecking(true);
    try {
      const res = await fetch("/api/agent-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ assistantId: selected.id, assistantName: selected.name, password: newPassword || null }),
      });
      if (!res.ok) {
        const j = await res.json();
        throw new Error(j.error ?? "Failed to save");
      }
      login({ assistantId: selected.id, assistantName: selected.name, isOwner: true });
    } catch (e: any) {
      setError(e?.message ?? "Failed to set password.");
    } finally {
      setChecking(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-950/95 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 shadow-2xl">

        {/* Header */}
        <div className="border-b border-gray-800 px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600">
              <svg className="h-5 w-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div>
              <h2 className="text-base font-bold text-white">VOIZO Testing Tool</h2>
              <p className="text-xs text-gray-500">
                {step === "list" ? "Select your agent to continue" : `${selected?.name}`}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-5">

          {/* Step: List */}
          {step === "list" && (
            <>
              {loading && <p className="py-6 text-center text-sm text-gray-500">Loading agents...</p>}
              {!loading && assistants.length === 0 && (
                <p className="py-6 text-center text-sm text-red-400">No agents found. Check your VAPI key.</p>
              )}
              <div className="space-y-2">
                {assistants.map((a) => (
                  <button
                    key={a.id}
                    onClick={() => handleSelectAgent(a)}
                    disabled={checking}
                    className="flex w-full items-center gap-3 rounded-xl border border-gray-700 px-4 py-3.5 text-left transition hover:border-indigo-500 hover:bg-indigo-500/10 disabled:opacity-50"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gray-700 text-xs font-bold text-gray-300">
                      {a.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm font-medium text-gray-200">{a.name}</span>
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step: Password entry (agent already has a password) */}
          {step === "password" && selected && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                This agent has an owner password. Enter it to edit prompts and voice settings, or continue without it — you can still run voice tests and view all conversations.
              </p>
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">Password</label>
                <input
                  type="password"
                  value={passwordInput}
                  onChange={(e) => { setPasswordInput(e.target.value); setError(""); }}
                  onKeyDown={(e) => e.key === "Enter" && handleEnterOwner()}
                  placeholder="Enter password..."
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={handleEnterOwner}
                disabled={!passwordInput || checking}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {checking ? "Checking..." : "Login as Owner"}
              </button>
              <button onClick={() => { setStep("list"); setSelected(null); setError(""); }} className="w-full text-xs text-gray-600 hover:text-gray-400">
                ← Back
              </button>
            </div>
          )}

          {/* Step: Set password (first time, no password yet) */}
          {step === "set-password" && selected && (
            <div className="space-y-4">
              <p className="text-sm text-gray-400">
                You&apos;re the first to claim this agent. Set a password to become its owner — others will need it to edit prompts and voice settings.
              </p>
              <div>
                <label className="mb-1.5 block text-xs text-gray-500">Password</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => { setNewPassword(e.target.value); setError(""); }}
                  placeholder="Set a password..."
                  className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  autoFocus
                />
              </div>
              {newPassword && (
                <div>
                  <label className="mb-1.5 block text-xs text-gray-500">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => { setConfirmPassword(e.target.value); setError(""); }}
                    onKeyDown={(e) => e.key === "Enter" && handleSetPassword()}
                    placeholder="Confirm password..."
                    className="w-full rounded-lg border border-gray-700 bg-gray-800 px-3 py-2.5 text-sm text-gray-200 placeholder-gray-500 focus:border-indigo-500 focus:outline-none"
                  />
                </div>
              )}
              {error && <p className="text-xs text-red-400">{error}</p>}
              <button
                onClick={handleSetPassword}
                disabled={checking || !newPassword || newPassword !== confirmPassword}
                className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-500 disabled:opacity-40"
              >
                {checking ? "Saving..." : "Set Password & Claim Ownership"}
              </button>
              <button onClick={() => { setStep("list"); setSelected(null); setError(""); }} className="w-full text-xs text-gray-600 hover:text-gray-400">
                ← Back
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
