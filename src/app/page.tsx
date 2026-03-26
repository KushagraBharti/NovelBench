import Image from "next/image";
import Hero from "@/components/home/Hero";
import ProcessTimeline from "@/components/home/ProcessTimeline";
import ContendersGrid from "@/components/home/ContendersGrid";
import DomainsGrid from "@/components/home/DomainsGrid";
import StatsBar from "@/components/home/StatsBar";

export default function Home() {
  return (
    <div className="relative isolate overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 -z-10 bg-bg-deep"
      >
        <Image
          src="/background.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-contain object-center opacity-90"
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(9,9,11,0.1)_0%,rgba(9,9,11,0.42)_58%,rgba(9,9,11,0.82)_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,9,11,0.08)_0%,rgba(9,9,11,0.28)_18%,rgba(9,9,11,0.72)_100%)]" />
      </div>

      <Hero />
      <ProcessTimeline />
      <ContendersGrid />
      <DomainsGrid />
      <StatsBar />
    </div>
  );
}
