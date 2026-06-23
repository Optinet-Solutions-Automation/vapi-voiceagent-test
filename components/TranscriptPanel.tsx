"use client";

import { useEffect, useRef, useState } from "react";
import { TranscriptMessage } from "@/lib/types";
import CommentThread from "./CommentThread";

type DisplayMessage = TranscriptMessage & { id?: string };

type Props = {
  messages: DisplayMessage[];
  title?: string;
  emptyText?: string;
  /** When true, the panel grows to fill its flex container instead of using a fixed max-height */
  fillHeight?: boolean;
  /** When true, use smaller text/padding to match the Listener Monitor */
  dense?: boolean;
};

export default function TranscriptPanel({
  messages,
  title = "Live Transcript",
  emptyText = "Start a voice session to see the conversation here.",
  fillHeight = false,
  dense = false,
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [openCommentId, setOpenCommentId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className={`flex flex-col rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur ${fillHeight ? "flex-1 min-h-0" : ""}`}>
      <div className="border-b border-gray-700 px-4 py-3 sm:px-5">
        <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider sm:text-sm">
          {title}
        </h2>
      </div>

      <div className={`overflow-y-auto ${dense ? "p-3 space-y-2" : "p-3 space-y-3 sm:p-5 sm:space-y-4"} ${fillHeight ? "flex-1 min-h-0" : "min-h-[200px] max-h-[60dvh] sm:min-h-[300px] sm:max-h-[600px]"}`}>
        {messages.length === 0 && (
          <p className={`text-gray-500 text-center py-8 ${dense ? "text-xs" : "text-sm"}`}>{emptyText}</p>
        )}

        {messages.map((msg, i) => {
          const hasDbId = !!msg.id;
          const isCommentOpen = openCommentId === msg.id;

          return (
            <div key={msg.id ?? i} className="space-y-1">
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[92%] space-y-1 sm:max-w-[85%]">
                  <div
                    className={`rounded-lg ${dense ? "px-2.5 py-1.5" : "px-3 py-2 sm:px-4 sm:py-2.5"} ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-700 text-gray-100"
                    }`}
                  >
                    <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                      {msg.role === "user" ? "You" : "Agent"}
                    </div>
                    <p className={`leading-relaxed ${dense ? "text-xs" : "text-sm"}`}>{msg.content}</p>
                  </div>

                  {hasDbId && (
                    <button
                      onClick={() =>
                        setOpenCommentId(isCommentOpen ? null : msg.id!)
                      }
                      className={`text-[11px] transition ${
                        isCommentOpen
                          ? "text-indigo-400"
                          : "text-gray-500 hover:text-gray-300"
                      }`}
                    >
                      {isCommentOpen ? "Hide comments" : "Comment"}
                    </button>
                  )}
                </div>
              </div>

              {hasDbId && isCommentOpen && <CommentThread messageId={msg.id!} />}
            </div>
          );
        })}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}
