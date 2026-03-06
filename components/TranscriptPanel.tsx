"use client";

import { useEffect, useRef, useState } from "react";
import { TranscriptMessage } from "@/lib/types";
import CommentThread from "./CommentThread";

type DisplayMessage = TranscriptMessage & { id?: string };

type Props = {
  messages: DisplayMessage[];
  title?: string;
  emptyText?: string;
};

export default function TranscriptPanel({
  messages,
  title = "Live Transcript",
  emptyText = "Start a voice session to see the conversation here.",
}: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [openCommentId, setOpenCommentId] = useState<string | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex flex-col rounded-xl border border-gray-700 bg-gray-800/50 backdrop-blur">
      <div className="border-b border-gray-700 px-4 py-3 sm:px-5">
        <h2 className="text-xs font-semibold text-gray-300 uppercase tracking-wider sm:text-sm">
          {title}
        </h2>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 min-h-[200px] max-h-[60dvh] sm:p-5 sm:space-y-4 sm:min-h-[300px] sm:max-h-[600px]">
        {messages.length === 0 && (
          <p className="text-gray-500 text-sm text-center py-8">{emptyText}</p>
        )}

        {messages.map((msg, i) => {
          const hasDbId = !!msg.id;
          const isCommentOpen = openCommentId === msg.id;

          return (
            <div key={msg.id ?? i} className="space-y-1">
              <div className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className="max-w-[92%] space-y-1 sm:max-w-[85%]">
                  <div
                    className={`rounded-lg px-3 py-2 sm:px-4 sm:py-2.5 ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white"
                        : "bg-gray-700 text-gray-100"
                    }`}
                  >
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider opacity-70">
                      {msg.role === "user" ? "You" : "Agent"}
                    </div>
                    <p className="text-sm leading-relaxed">{msg.content}</p>
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
