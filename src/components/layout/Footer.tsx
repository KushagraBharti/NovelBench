"use client";

export default function Footer() {
  return (
    <footer className="border-t border-border mt-auto">
      <div className="max-w-6xl mx-auto px-6 py-8 flex flex-col sm:flex-row items-center justify-between gap-4">
        <span className="font-display text-base text-text-muted">NovelBench</span>
        <p className="text-base text-text-muted">
          Four models. Eight domains. One arena.
        </p>
      </div>
      <div className="text-center pb-4">
        <p className="text-base text-text-muted/10 select-none hover:text-text-muted/50 transition-colors duration-1000">
          you found the bottom. here&apos;s a cookie: 🍪
        </p>
      </div>
    </footer>
  );
}
