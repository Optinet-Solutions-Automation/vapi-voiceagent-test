"use client";

import { AgentProvider, useAgent } from "@/lib/agent-context";
import Sidebar from "./Sidebar";
import AgentSelector from "./AgentSelector";
import { ReactNode } from "react";

function LayoutInner({ children }: { children: ReactNode }) {
  const { session } = useAgent();

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden lg:flex-row">
      <Sidebar />
      <main className="flex-1 min-h-0 overflow-y-auto">
        {session ? children : null}
      </main>
      {!session && <AgentSelector />}
    </div>
  );
}

export default function ClientLayout({ children }: { children: ReactNode }) {
  return (
    <AgentProvider>
      <LayoutInner>{children}</LayoutInner>
    </AgentProvider>
  );
}
