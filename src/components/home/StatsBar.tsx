import AnimatedNumber from "@/components/ui/AnimatedNumber";
import { getHomeStats } from "@/lib/results";

export default async function StatsBar() {
  const stats = await getHomeStats();

  const items = [
    { value: stats.totalRuns, label: "Benchmarks" },
    { value: stats.totalIdeas, label: "Ideas Generated" },
    { value: stats.totalCritiques, label: "Critiques Written" },
    { value: stats.totalModels, label: "Tracked Models" },
  ];

  return (
    <section className="py-16 px-6 border-t border-border/60 bg-bg-deep/78 backdrop-blur-sm">
      <div className="max-w-6xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px bg-border border border-border">
        {items.map((item) => (
          <div key={item.label} className="text-center bg-bg-deep px-4 py-6">
            <AnimatedNumber
              value={item.value}
              className="font-mono text-3xl sm:text-4xl text-text-primary font-medium"
            />
            <p className="label mt-2">{item.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
