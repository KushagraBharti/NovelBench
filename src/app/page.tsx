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
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-80"
          style={{ backgroundImage: "url('/background.png')" }}
        />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(9,9,11,0.28),rgba(9,9,11,0.88)_65%,#09090B_100%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(9,9,11,0.16)_0%,rgba(9,9,11,0.42)_26%,rgba(9,9,11,0.84)_100%)]" />
      </div>

      <Hero />
      <ProcessTimeline />
      <ContendersGrid />
      <DomainsGrid />
      <StatsBar />
    </div>
  );
}
