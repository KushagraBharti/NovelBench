import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CreateLLM - LLM Creativity Benchmark",
  description: "Benchmark LLM creativity by having models generate ideas, critique each other, revise, and vote.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}
