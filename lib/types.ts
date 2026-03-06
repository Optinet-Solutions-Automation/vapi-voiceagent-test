export type AgentState =
  | "idle"
  | "connecting"
  | "listening"
  | "agent-speaking"
  | "disconnected"
  | "error";

export type TranscriptMessage = {
  role: "user" | "agent";
  content: string;
  timestamp: Date;
};
