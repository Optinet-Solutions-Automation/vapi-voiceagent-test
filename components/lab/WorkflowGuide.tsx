"use client";

import { useState } from "react";
import Link from "next/link";

// The campaign workflow as clickable steps: the strip shows the order, and
// each step expands into how-to details with concrete example inputs.
type HowItem = { text: string; example?: string };
type Step = {
  chip: string;
  title: string;
  what: string;
  how: HowItem[];
  tip?: string;
  action?: { label: string; href?: string; act?: "config" | "logs" };
};

const STEPS: Step[] = [
  {
    chip: "Fill the Playbook",
    title: "Step 1 — Fill the Playbook (scenarios & collection)",
    what:
      "The Playbook is everything the agent can say or recognize. A Scenario is one move: when it fits, what to say, and how to deliver it. A Collection bundles the scenarios one campaign uses — the active collection is what the router matches replies against on a call.",
    how: [
      {
        text: "Open the Playbook → Scenarios → “+ New scenario”. One scenario = one situation. Example — a price question:",
        example:
          "Name:         Price question\nDescription:  Customer asks what it costs, the price after the\n              discount, or what they'd be paying.\nLine:         With the welcome discount it's thirty-six dollars for\n              your first month instead of forty-nine — cancel anytime.\nDelivery:     Exact words   (facts and prices stay word-for-word)",
      },
      {
        text: "Add the messy-reality ones too — suspicion, brush-offs, compliance. Write those as briefings the agent rephrases:",
        example:
          "Name:         Where did you get my number?\nDescription:  Customer asks how you got their number or why\n              they specifically are being called.\nLine:         Explain their number comes from this week's registration,\n              reassure them their details aren't shared, then steer\n              back to the welcome promo.\nDelivery:     Just the gist   (agent says it in its own words)",
      },
      {
        text: "Switch to the Collections tab → create one per campaign (e.g. “Welcome Promo — Full Playbook”), tick its scenarios, and set it Active.",
      },
    ],
    tip: "Lines you type directly into script boxes are saved to the Playbook automatically, tagged with the script's name — you don't have to start here.",
    action: { label: "Open the Playbook", href: "/playbook" },
  },
  {
    chip: "Build the call flow",
    title: "Step 2 — Build the call flow (Script Builder)",
    what:
      "The script is the spine of the call: what the agent says, in what order, and where it branches on the customer's reply. Off-script questions are answered by the Playbook automatically while the script keeps its place.",
    how: [
      { text: "Script Builder → type a name (e.g. “Welcome Call — October signups”) → + New Script." },
      {
        text: "Click the Start box and give this campaign its own opening line:",
        example:
          "Hi {{name}}! This is Alex from the customer team — you signed\nup with us this week, so I'm just giving you a quick welcome\ncall. Have I caught you at an okay moment?",
      },
      {
        text: "Drag a Scenario box onto the canvas and type what the agent says:",
        example:
          "Since you signed up this week, there's a welcome promo on your\naccount — twenty-five percent off your first month. Want me to\ntext you the link?",
      },
      {
        text: "Drag an If/Else box and describe the reply that counts as a yes, in plain words:",
        example: 'they agree — "yes", "sure", "text me", "sounds good"',
      },
      {
        text: "Wire the green Then dot to a Send SMS box and the red Else dot to a gentle-nudge Scenario; finish with an End call box. Save — anything missing shows up as a warning.",
      },
    ],
    tip: "Open “Demo — Basic Welcome Call” to see a finished one. “Sales Call — Phased (example)” splits it into reusable phases, and “Welcome Call — Stage Collections (example)” shows the stage pattern: a Collection box holds a whole set of expected answers, so you don't nest If/Else per reply.",
    action: { label: "Open the Script Builder", href: "/script-builder" },
  },
  {
    chip: "Push the persona",
    title: "Step 3 — Push persona & webhook (Configuration)",
    what:
      "The persona prompt is who the agent is between scripted lines — tone, honesty, how it handles briefings. Nothing here reaches the live agent until you click Save Configuration, which pushes the prompt, voice, tools and webhook onto the VAPI assistant.",
    how: [
      { text: "Open Configuration and pick your assistant." },
      {
        text: "Write the short prompt as identity + behaviour — never offer details (those come from the Playbook). The demo persona starts like this:",
        example:
          "[Identity] You are Alex — a warm, natural-sounding voice agent\nfor the customer team, calling clients who created an account\nthis week to welcome them and share the welcome promo…",
      },
      {
        text: "Pick a voice, leave the router model and threshold at their defaults, and click Save Configuration. Repeat the save after every prompt change — this is the step everyone forgets.",
      },
    ],
    action: { label: "Open Configuration", act: "config" },
  },
  {
    chip: "Pick the script & call",
    title: "Step 4 — Run a test call (this page)",
    what:
      "The Script dropdown below decides which flow drives the next call; the Collection chip shows what the router is allowed to match. Both should belong to the same campaign.",
    how: [
      {
        text: "Set the two selectors to the same campaign, e.g.:",
        example: "Script:      Demo — Basic Welcome Call\nCollection:  Welcome Promo — Full Playbook",
      },
      { text: "Type a Client Name (it fills {{name}} in the opening line), hit Start Call, and allow the microphone." },
      {
        text: "Watch the monitor: heard → classified → injected. Try going off script — ask “how did you get my number?” — and watch the flow park, answer from the Playbook, and resume where it was.",
      },
    ],
  },
  {
    chip: "Review in Logs",
    title: "Step 5 — Review the run (Logs)",
    what: "Every test call is recorded with its full transcript and the listener timeline side by side.",
    how: [
      { text: "Open Logs and click a run — the transcript appears next to the timeline." },
      {
        text: "Read the “classified” rows: did each reply match the right scenario? A wrong match means that scenario's Description needs sharpening in the Playbook. A healthy run looks like:",
        example:
          'classified  "not sure really"   →  promo_not_interested\nskipped     reason: deferred_to_playbook   (flow parked, Q&A answered)\ninjected    flow:send_sms   ·   latency 900 ms',
      },
      {
        text: "Then tune: wrong branch → adjust the If/Else expected reply; robotic phrasing → flip that line's delivery to “Just the gist”; slow injections → try a faster router model in Configuration.",
      },
    ],
    action: { label: "Open Logs", act: "logs" },
  },
];

type Props = { onOpenConfig: () => void; onOpenLogs: () => void };

export default function WorkflowGuide({ onOpenConfig, onOpenLogs }: Props) {
  const [open, setOpen] = useState<number | null>(null);
  const step = open !== null ? STEPS[open] : null;

  function runAction(a: NonNullable<Step["action"]>) {
    if (a.act === "config") onOpenConfig();
    if (a.act === "logs") onOpenLogs();
  }

  return (
    <div className="space-y-3">
      {/* The strip: click a step for the how-to */}
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2 text-[11px]">
        {STEPS.map((s, i) => (
          <li key={i} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-gray-700">→</span>}
            <button
              onClick={() => setOpen(open === i ? null : i)}
              className={`rounded-full border px-2.5 py-1 transition ${
                open === i
                  ? "border-indigo-500 bg-indigo-500/15 text-indigo-200"
                  : "border-gray-700 text-gray-400 hover:border-gray-500 hover:text-gray-200"
              }`}
            >
              <span className="font-bold text-indigo-400">{i + 1}.</span> {s.chip}
            </button>
          </li>
        ))}
      </ol>

      {/* Expanded how-to with example inputs */}
      {step && (
        <div className="rounded-xl border border-indigo-500/30 bg-indigo-500/5 p-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-sm font-bold text-white">{step.title}</h3>
            <button onClick={() => setOpen(null)} className="text-xs text-gray-500 hover:text-gray-300">
              close
            </button>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-relaxed text-gray-400">{step.what}</p>
          <ol className="mt-3 max-w-3xl list-decimal space-y-3 pl-5 text-xs leading-relaxed text-gray-300">
            {step.how.map((h, i) => (
              <li key={i}>
                {h.text}
                {h.example && (
                  <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap rounded-lg border border-gray-700 bg-gray-900/70 p-2.5 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                    {h.example}
                  </pre>
                )}
              </li>
            ))}
          </ol>
          {step.tip && <p className="mt-3 max-w-3xl text-[11px] text-gray-500">💡 {step.tip}</p>}
          {step.action && (
            <div className="mt-3">
              {step.action.href ? (
                <Link
                  href={step.action.href}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                >
                  {step.action.label} →
                </Link>
              ) : (
                <button
                  onClick={() => runAction(step.action!)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white transition hover:bg-indigo-500"
                >
                  {step.action.label} →
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
