"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAgent } from "@/lib/agent-context";

const NAV = [
  {
    label: "Call Dashboard",
    href: "/",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
      </svg>
    ),
  },
  {
    label: "Prompt Library",
    href: "/prompts",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h7" />
      </svg>
    ),
  },
  {
    label: "Conversations",
    href: "/conversations",
    icon: (
      <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const { session, setSession } = useAgent();
  function isActive(href: string) {
    if (href === "/") return pathname === "/";
    // Tracker item pages are reached from Conversations, so highlight that tab
    if (href === "/conversations") return pathname.startsWith("/conversations") || pathname.startsWith("/tracker");
    return pathname.startsWith(href);
  }

  const navItems = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((item) => {
        const active = isActive(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all ${
              active
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-gray-400 hover:bg-gray-800 hover:text-gray-100"
            }`}
          >
            <span className="shrink-0">{item.icon}</span>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-gray-800 bg-gray-900/60">
        <div className="border-b border-gray-800 px-4 py-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-indigo-600">
              <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
              </svg>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold text-white truncate">{session?.assistantName ?? "VOIZO"}</p>
              {session && (
                <p className={`text-[10px] ${session.isOwner ? "text-emerald-400" : "text-gray-500"}`}>
                  {session.isOwner ? "Owner" : "View only"}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={() => setSession(null)}
            className="mt-2 w-full rounded-md border border-gray-700 px-2 py-1 text-[11px] text-gray-400 transition hover:border-gray-600 hover:text-gray-200"
          >
            Switch Agent
          </button>
        </div>
        <div className="flex-1">{navItems}</div>
      </aside>

      {/* Mobile top bar */}
      <div className="flex lg:hidden shrink-0 items-center justify-between border-b border-gray-800 bg-gray-900/80 px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-indigo-600">
            <svg className="h-4 w-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-white">{session?.assistantName ?? "VOIZO"}</p>
            {session && <p className={`text-[10px] ${session.isOwner ? "text-emerald-400" : "text-gray-500"}`}>{session.isOwner ? "Owner" : "View only"}</p>}
          </div>
        </div>
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded-lg p-2 text-gray-400 transition hover:bg-gray-800 hover:text-white"
        >
          {open ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          )}
        </button>
      </div>

      {/* Mobile dropdown menu */}
      {open && (
        <div className="lg:hidden absolute inset-x-0 top-[49px] z-50 border-b border-gray-800 bg-gray-900 shadow-xl">
          {navItems}
          <div className="border-t border-gray-800 p-3">
            <button
              onClick={() => { setSession(null); setOpen(false); }}
              className="w-full rounded-lg border border-gray-700 py-2 text-sm text-gray-400 transition hover:text-gray-200"
            >
              Switch Agent
            </button>
          </div>
        </div>
      )}
    </>
  );
}
