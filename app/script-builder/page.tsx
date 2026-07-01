"use client";

import { useRouter } from "next/navigation";
import ScriptBuilder from "@/components/lab/ScriptBuilder";

export default function ScriptBuilderPage() {
  const router = useRouter();
  return <ScriptBuilder onClose={() => router.push("/listener-lab")} />;
}
