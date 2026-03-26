import type { Metadata, Viewport } from "next";
import "./globals.css";
import Sidebar from "@/components/Sidebar";

export const metadata: Metadata = {
  title: "Voice Agent Testing Console",
  description: "Browser-based voice testing console for Vapi assistants",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="bg-gray-950 text-white antialiased">
        <div className="relative flex h-dvh flex-col overflow-hidden lg:flex-row">
          <Sidebar />
          <main className="flex-1 min-h-0 overflow-y-auto">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
