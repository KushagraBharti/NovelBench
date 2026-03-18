import { Category } from "@/types";

export const categories: Category[] = [
  {
    id: "venture",
    name: "Venture",
    description: "Startup concepts, business models, and entrepreneurial ventures",
    examplePrompts: [
      "Create a startup concept for a sustainable fashion marketplace",
      "Design a new SaaS product for remote team collaboration",
      "Propose a disruptive business model for the education industry",
    ],
  },
  {
    id: "frontier",
    name: "Frontier",
    description: "Novel research directions, scientific hypotheses, and academic proposals",
    examplePrompts: [
      "Propose a novel approach to carbon capture using synthetic biology",
      "Design a research study on the cognitive effects of AI-assisted learning",
      "Suggest a new framework for understanding dark matter distribution",
    ],
  },
  {
    id: "story",
    name: "Story",
    description: "Short fiction premises, plot twists, poetry, and narrative concepts",
    examplePrompts: [
      "Write a compelling premise for a sci-fi novel set in 2150",
      "Create an unexpected plot twist for a mystery thriller",
      "Design a unique magic system for a fantasy world",
    ],
  },
  {
    id: "cinema",
    name: "Cinema",
    description: "Movie pitches, screenplay concepts, and film loglines",
    examplePrompts: [
      "Pitch a psychological thriller set entirely inside a space station",
      "Create a logline for an animated film about sentient ocean currents",
      "Design a documentary concept exploring forgotten ancient civilizations",
    ],
  },
  {
    id: "folio",
    name: "Folio",
    description: "Novel premises, nonfiction book concepts, and plot structures",
    examplePrompts: [
      "Pitch a nonfiction book about the hidden history of color",
      "Create a premise for a multi-generational family saga spanning 200 years",
      "Design the structure for a choose-your-own-adventure novel for adults",
    ],
  },
  {
    id: "canvas",
    name: "Canvas",
    description: "Visual art directions, game world concepts, and album themes",
    examplePrompts: [
      "Design an art installation concept that responds to viewers' emotions",
      "Create a video game world inspired by bioluminescent deep-sea creatures",
      "Propose an album concept that tells a story across 12 tracks",
    ],
  },
  {
    id: "stage",
    name: "Stage",
    description: "Theater productions, musical concepts, and live performance ideas",
    examplePrompts: [
      "Pitch a one-person stage show about the life of a time traveler",
      "Design a musical concept set in a post-apocalyptic underground city",
      "Create an immersive theater experience based on a classic myth",
    ],
  },
  {
    id: "blueprint",
    name: "Blueprint",
    description: "Inventions, engineering concepts, and innovative technical solutions",
    examplePrompts: [
      "Design a device that converts ambient sound into usable energy",
      "Propose an invention that makes vertical farming accessible to apartments",
      "Create a concept for a new type of transportation for dense urban areas",
    ],
  },
  {
    id: "anthem",
    name: "Anthem",
    description: "Song concepts, music composition ideas, and sonic experiments",
    examplePrompts: [
      "Create a concept for a song that blends classical orchestration with electronic beats",
      "Design a musical piece that evolves based on the time of day",
      "Pitch an album concept where each track represents a different emotion",
    ],
  },
];

export function getCategoryById(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function getAllCategories(): Category[] {
  return categories;
}
