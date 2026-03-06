import Vapi from "@vapi-ai/web";

const VAPI_PUBLIC_API_KEY = "d1e4c135-6dde-433c-b2c1-154dbd0947d3";
export const VAPI_ASSISTANT_ID = "509156f5-78b7-4644-901a-acbc3415472d";

let vapiInstance: Vapi | null = null;

export function getVapi(): Vapi {
  if (!vapiInstance) {
    vapiInstance = new Vapi(VAPI_PUBLIC_API_KEY);
  }
  return vapiInstance;
}
