"use client";

import { ReactNode, useEffect } from "react";

type Props = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  /** Tailwind max-width class for the panel, e.g. "max-w-xl", "max-w-4xl" */
  width?: string;
  children: ReactNode;
};

export default function Drawer({ open, onClose, title, subtitle, width = "max-w-xl", children }: Props) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-40 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        onClick={(e) => e.stopPropagation()}
        className={`relative flex h-full w-full ${width} flex-col border-l border-gray-700 bg-gray-900 shadow-2xl`}
      >
        <div className="shrink-0 flex items-start justify-between gap-4 border-b border-gray-800 px-5 py-4">
          <div className="min-w-0">
            <h2 className="text-base font-bold text-white">{title}</h2>
            {subtitle && <p className="truncate text-xs text-gray-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="shrink-0 rounded p-1 text-gray-400 hover:text-white">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}
