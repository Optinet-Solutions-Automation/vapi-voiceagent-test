"use client";

import { useEffect, useState } from "react";

const STORAGE_KEY = "vapi-onboarding-complete";
const NICKNAME_KEY = "vapi-nickname";

export function useOnboarding() {
  const [ready, setReady] = useState(false);
  const [complete, setComplete] = useState(false);

  useEffect(() => {
    setComplete(localStorage.getItem(STORAGE_KEY) === "true");
    setReady(true);
  }, []);

  function markComplete() {
    localStorage.setItem(STORAGE_KEY, "true");
    setComplete(true);
  }

  return { showOnboarding: ready && !complete, markComplete };
}

export function getNickname(): string {
  if (typeof window === "undefined") return "reviewer";
  return localStorage.getItem(NICKNAME_KEY) || "reviewer";
}

export function setNickname(name: string) {
  localStorage.setItem(NICKNAME_KEY, name);
}

const STEPS = [
  {
    title: "Start a Voice Session",
    description:
      'Click "Start Voice Test" to connect. Your browser will ask for microphone permission — allow it so the assistant can hear you. Speak naturally and the assistant will respond.',
    icon: (
      <svg className="h-10 w-10 text-emerald-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    title: "Review the Transcript",
    description:
      "Watch the live transcript panel as you talk. Both your messages and the agent's responses appear in real time so you can debug the conversation flow.",
    icon: (
      <svg className="h-10 w-10 text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
      </svg>
    ),
  },
  {
    title: "Save & Comment",
    description:
      'After a session, click "Save Conversation" to store it. Reopen saved conversations anytime, click on any message to add comments, and start threaded discussions for your team.',
    icon: (
      <svg className="h-10 w-10 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
      </svg>
    ),
  },
];

export default function Onboarding({ onComplete }: { onComplete: () => void }) {
  // step -1 = nickname screen, 0..N = walkthrough steps
  const [step, setStep] = useState(-1);
  const [nickname, setLocalNickname] = useState("");

  function handleNicknameSubmit() {
    const name = nickname.trim() || "reviewer";
    setNickname(name);
    setStep(0);
  }

  function handleSkip() {
    if (step === -1) {
      setNickname(nickname.trim() || "reviewer");
    }
    onComplete();
  }

  // Nickname screen
  if (step === -1) {
    return (
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-3 sm:items-center sm:p-4">
        <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl sm:p-8">
          <div className="mb-4 flex justify-center sm:mb-5">
            <svg className="h-8 w-8 text-indigo-400 sm:h-10 sm:w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
            </svg>
          </div>

          <h2 className="mb-2 text-center text-base font-semibold text-white sm:text-lg">
            Hey there! What should we call you?
          </h2>
          <p className="mb-6 text-center text-sm text-gray-400">
            This name will appear on your comments and reviews.
          </p>

          <input
            type="text"
            value={nickname}
            onChange={(e) => setLocalNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleNicknameSubmit()}
            placeholder="Enter your nickname..."
            autoFocus
            className="mb-6 w-full rounded-lg border border-gray-600 bg-gray-800 px-4 py-3.5 text-center text-sm text-white placeholder-gray-500 focus:border-indigo-500 focus:outline-none sm:py-3"
          />

          <div className="flex items-center justify-between">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 transition hover:text-gray-300"
            >
              Skip
            </button>
            <button
              onClick={handleNicknameSubmit}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Walkthrough steps
  const current = STEPS[step];
  const isLast = step === STEPS.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm p-3 sm:items-center sm:p-4">
      <div className="w-full max-w-md rounded-2xl border border-gray-700 bg-gray-900 p-6 shadow-2xl sm:p-8">
        {/* Progress dots */}
        <div className="mb-5 flex justify-center gap-2 sm:mb-6">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all ${
                i === step ? "w-6 bg-indigo-500" : i < step ? "w-1.5 bg-indigo-500/50" : "w-1.5 bg-gray-600"
              }`}
            />
          ))}
        </div>

        {/* Icon */}
        <div className="mb-4 flex justify-center sm:mb-5">{current.icon}</div>

        {/* Content */}
        <h2 className="mb-2 text-center text-base font-semibold text-white sm:mb-3 sm:text-lg">
          {current.title}
        </h2>
        <p className="mb-6 text-center text-sm leading-relaxed text-gray-400 sm:mb-8">
          {current.description}
        </p>

        {/* Actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={handleSkip}
            className="text-sm text-gray-500 transition hover:text-gray-300"
          >
            Skip
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => setStep((s) => s - 1)}
              className="rounded-lg border border-gray-600 px-4 py-2 text-sm font-medium text-gray-300 transition hover:bg-gray-800"
            >
              Back
            </button>
            <button
              onClick={() => {
                if (isLast) {
                  onComplete();
                } else {
                  setStep((s) => s + 1);
                }
              }}
              className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white transition hover:bg-indigo-500"
            >
              {isLast ? "Get Started" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
