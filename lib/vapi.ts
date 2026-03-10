// Do NOT import @vapi-ai/web at the top level — it uses browser-only APIs
// (AudioContext, RTCPeerConnection, etc.) that crash during Next.js SSR.
// We lazy-load it at call time so it only runs in the browser (inside useEffect).

const VAPI_PUBLIC_API_KEY = "d1e4c135-6dde-433c-b2c1-154dbd0947d3";
export const VAPI_ASSISTANT_ID = "509156f5-78b7-4644-901a-acbc3415472d";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let vapiInstance: any | null = null;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getVapi(): any {
  if (!vapiInstance) {
    // require() defers the load to call-time (browser only, inside useEffect)
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Vapi = require("@vapi-ai/web").default;
    vapiInstance = new Vapi(VAPI_PUBLIC_API_KEY);
  }
  return vapiInstance;
}
