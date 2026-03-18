import type { Metadata } from "next";
import { Instrument_Serif, Figtree, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/layout/Navbar";
import Footer from "@/components/layout/Footer";
import { EasterEggProvider } from "@/components/effects/EasterEggProvider";
import { Toaster } from "sonner";

const instrumentSerif = Instrument_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-instrument-serif",
  display: "swap",
});

const figtree = Figtree({
  subsets: ["latin"],
  variable: "--font-figtree",
  display: "swap",
});

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-ibm-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "NovelBench — Where AI Creativity Competes",
  description:
    "Four AI models compete across eight creative domains. They generate, critique, revise, and vote — revealing which model is the most creative.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${instrumentSerif.variable} ${figtree.variable} ${ibmPlexMono.variable}`}
    >
      <body className="antialiased min-h-screen flex flex-col">
        <EasterEggProvider>
          <Navbar />
          <main className="flex-1 pt-16">{children}</main>
          <Footer />
          <Toaster
            theme="dark"
            toastOptions={{
              style: {
                background: "#111114",
                border: "1px solid rgba(255,255,255,0.06)",
                color: "#E8E4DE",
                fontFamily: "var(--font-body)",
              },
            }}
          />
        </EasterEggProvider>
      </body>
    </html>
  );
}
