import Hero from "@/components/home/Hero";
import ProcessTimeline from "@/components/home/ProcessTimeline";
import ContendersGrid from "@/components/home/ContendersGrid";
import DomainsGrid from "@/components/home/DomainsGrid";
import StatsBar from "@/components/home/StatsBar";

export default function Home() {
  return (
    <>
      <Hero />
      <ProcessTimeline />
      <ContendersGrid />
      <DomainsGrid />
      <StatsBar />
    </>
  );
}
