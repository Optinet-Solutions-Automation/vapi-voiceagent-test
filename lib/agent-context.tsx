"use client";

import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export type AgentSession = {
  assistantId: string;
  assistantName: string;
  isOwner: boolean;
};

type AgentContextValue = {
  session: AgentSession | null;
  setSession: (s: AgentSession | null) => void;
};

const AgentContext = createContext<AgentContextValue>({
  session: null,
  setSession: () => {},
});

const STORAGE_KEY = "voizo_agent_session";

export function AgentProvider({ children }: { children: ReactNode }) {
  const [session, setSessionState] = useState<AgentSession | null>(null);
  const [hydrated, setHydrated] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setSessionState(JSON.parse(raw));
    } catch { /* ignore */ }
    setHydrated(true);
  }, []);

  function setSession(s: AgentSession | null) {
    setSessionState(s);
    if (s) localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
    else localStorage.removeItem(STORAGE_KEY);
  }

  if (!hydrated) return null;

  return (
    <AgentContext.Provider value={{ session, setSession }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgent() {
  return useContext(AgentContext);
}
