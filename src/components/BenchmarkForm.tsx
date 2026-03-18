"use client";

import { useState } from "react";
import { categories } from "@/lib/categories";

interface BenchmarkFormProps {
  onSubmit: (categoryId: string, prompt: string) => void;
  disabled?: boolean;
}

export default function BenchmarkForm({
  onSubmit,
  disabled,
}: BenchmarkFormProps) {
  const [categoryId, setCategoryId] = useState(categories[0].id);
  const [prompt, setPrompt] = useState("");

  const selectedCategory = categories.find((c) => c.id === categoryId);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (prompt.trim()) {
      onSubmit(categoryId, prompt.trim());
    }
  }

  function useExample(example: string) {
    setPrompt(example);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <label
          htmlFor="category"
          className="block text-sm font-medium text-foreground mb-2"
        >
          Category
        </label>
        <select
          id="category"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          disabled={disabled}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          {categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
        {selectedCategory && (
          <p className="mt-1 text-sm text-gray-500">
            {selectedCategory.description}
          </p>
        )}
      </div>

      <div>
        <label
          htmlFor="prompt"
          className="block text-sm font-medium text-foreground mb-2"
        >
          Creative Prompt
        </label>
        <textarea
          id="prompt"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={disabled}
          rows={4}
          placeholder="Enter your creative prompt..."
          className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-background text-foreground focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y"
        />
      </div>

      {selectedCategory && selectedCategory.examplePrompts.length > 0 && (
        <div>
          <p className="text-sm text-gray-500 mb-2">Try an example:</p>
          <div className="flex flex-wrap gap-2">
            {selectedCategory.examplePrompts.map((example, i) => (
              <button
                key={i}
                type="button"
                onClick={() => useExample(example)}
                disabled={disabled}
                className="text-xs px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-full transition-colors disabled:opacity-50"
              >
                {example.length > 50 ? example.slice(0, 50) + "..." : example}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={disabled || !prompt.trim()}
        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {disabled ? "Running Benchmark..." : "Run Benchmark"}
      </button>
    </form>
  );
}
