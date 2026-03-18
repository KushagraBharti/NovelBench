import Link from "next/link";
import { categories } from "@/lib/categories";
import { models } from "@/lib/models";

export default function Home() {
  return (
    <div className="min-h-screen p-8 max-w-4xl mx-auto">
      <header className="mb-12 text-center">
        <h1 className="text-4xl font-bold text-foreground mb-3">
          CreateLLM
        </h1>
        <p className="text-lg text-gray-600 max-w-2xl mx-auto">
          Benchmark LLM creativity by having models generate ideas, critique
          each other, revise, and vote. See which AI is the most creative.
        </p>
      </header>

      <div className="flex gap-4 justify-center mb-12">
        <Link
          href="/benchmark"
          className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors"
        >
          Run a Benchmark
        </Link>
        <Link
          href="/results"
          className="px-6 py-3 border border-gray-300 hover:bg-gray-50 text-foreground font-medium rounded-lg transition-colors"
        >
          View Past Results
        </Link>
      </div>

      {/* How it works */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-6 text-center">
          How It Works
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[
            {
              step: "1",
              title: "Generate",
              desc: "All models generate creative ideas from your prompt",
            },
            {
              step: "2",
              title: "Critique & Vote",
              desc: "Each model critiques and ranks all other ideas",
            },
            {
              step: "3",
              title: "Revise",
              desc: "Models improve their ideas based on critiques",
            },
            {
              step: "4",
              title: "Final Vote",
              desc: "Models rank the revised ideas for final standings",
            },
          ].map((item) => (
            <div
              key={item.step}
              className="border border-gray-200 rounded-lg p-4 text-center"
            >
              <div className="text-2xl font-bold text-blue-600 mb-2">
                {item.step}
              </div>
              <h3 className="font-semibold text-foreground mb-1">
                {item.title}
              </h3>
              <p className="text-sm text-gray-500">{item.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Models */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold text-foreground mb-4 text-center">
          Competing Models
        </h2>
        <div className="flex flex-wrap gap-3 justify-center">
          {models.map((model) => (
            <div
              key={model.id}
              className="px-4 py-2 border border-gray-200 rounded-lg text-sm"
            >
              <span className="font-medium">{model.name}</span>
              <span className="text-gray-400 ml-2">{model.provider}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Categories */}
      <section>
        <h2 className="text-2xl font-semibold text-foreground mb-4 text-center">
          Categories
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((cat) => (
            <Link
              key={cat.id}
              href={`/benchmark?category=${cat.id}`}
              className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition-colors"
            >
              <h3 className="font-semibold text-foreground mb-1">
                {cat.name}
              </h3>
              <p className="text-sm text-gray-500">{cat.description}</p>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
