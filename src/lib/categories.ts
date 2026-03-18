import { Category } from "@/types";

export const categories: Category[] = [
  {
    id: "business",
    name: "Business Ideas",
    description: "Startup concepts, business plans, and entrepreneurial ventures",
    examplePrompts: [
      "Create a business plan for a sustainable fashion marketplace",
      "Design a new SaaS product for remote team collaboration",
      "Propose a disruptive business model for the education industry",
    ],
  },
  {
    id: "research",
    name: "Research Proposals",
    description: "Novel research directions and scientific hypotheses",
    examplePrompts: [
      "Propose a novel approach to carbon capture using synthetic biology",
      "Design a research study on the cognitive effects of AI-assisted learning",
      "Suggest a new framework for understanding dark matter distribution",
    ],
  },
  {
    id: "creative-writing",
    name: "Creative Writing",
    description: "Short story premises, plot twists, and narrative concepts",
    examplePrompts: [
      "Write a compelling premise for a sci-fi novel set in 2150",
      "Create an unexpected plot twist for a mystery thriller",
      "Design a unique magic system for a fantasy world",
    ],
  },
  {
    id: "product-design",
    name: "Product Design",
    description: "Innovative product concepts and user experience ideas",
    examplePrompts: [
      "Design a smart home device for elderly care",
      "Create a new wearable technology concept for mental health",
      "Propose an innovative solution for urban food delivery",
    ],
  },
  {
    id: "problem-solving",
    name: "Problem Solving",
    description: "Creative solutions to real-world challenges",
    examplePrompts: [
      "Propose a creative solution to reduce food waste in cities",
      "Design a system to improve voter turnout in local elections",
      "Create an innovative approach to ocean plastic cleanup",
    ],
  },
  {
    id: "marketing",
    name: "Marketing Campaigns",
    description: "Creative campaign strategies and brand concepts",
    examplePrompts: [
      "Design a viral marketing campaign for a new energy drink",
      "Create a brand identity for an AI-powered tutoring platform",
      "Propose a guerrilla marketing strategy for a local bookstore",
    ],
  },
];

export function getCategoryById(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function getAllCategories(): Category[] {
  return categories;
}
