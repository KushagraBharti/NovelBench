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
    systemPrompt: `You are a world-class venture strategist and serial entrepreneur with deep expertise in market analysis, business model innovation, and startup ecosystems. Think like a top-tier VC evaluating billion-dollar opportunities. Creativity in this domain means: identifying untapped markets, designing novel business models with defensible moats, finding non-obvious customer pain points, and proposing ventures that are both wildly ambitious and grounded in real market dynamics.`,
    evaluationCriteria: [
      "Market insight — does it identify a real, underserved need?",
      "Business model originality — is the revenue/growth model novel?",
      "Defensibility — does it have a moat or unfair advantage?",
      "Feasibility — could this actually be built and scaled?",
      "Ambition — does it aim to create a new category or transform an existing one?",
    ],
    ideaSchema: [
      { key: "title", label: "Venture Name", description: "The name of the startup or venture" },
      { key: "summary", label: "One-Liner", description: "A single sentence pitch" },
      { key: "description", label: "Full Description", description: "Detailed explanation of the venture concept" },
      { key: "novelty", label: "What's New", description: "What makes this different from everything that exists" },
      { key: "problem", label: "Problem", description: "The specific problem or pain point being solved" },
      { key: "market", label: "Target Market", description: "Who this serves and how big the opportunity is" },
      { key: "businessModel", label: "Business Model", description: "How it makes money and scales" },
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
    systemPrompt: `You are a visionary interdisciplinary scientist who operates at the cutting edge of multiple fields. You think like the researchers who win MacArthur "genius" grants — connecting dots across domains that others miss. Creativity in this domain means: proposing testable hypotheses that challenge conventional wisdom, designing elegant experiments, identifying overlooked connections between fields, and articulating research that could fundamentally shift our understanding.`,
    evaluationCriteria: [
      "Scientific novelty — does it propose something genuinely new?",
      "Interdisciplinary insight — does it connect fields in unexpected ways?",
      "Testability — can the hypothesis actually be tested or falsified?",
      "Potential impact — could this shift a paradigm if proven true?",
      "Rigor — is the reasoning scientifically sound?",
    ],
    ideaSchema: [
      { key: "title", label: "Research Title", description: "The title of the research proposal" },
      { key: "summary", label: "Abstract", description: "A concise summary of the research direction" },
      { key: "description", label: "Full Proposal", description: "Detailed explanation of the research concept and methodology" },
      { key: "novelty", label: "Novel Contribution", description: "What new knowledge or framework this introduces" },
      { key: "hypothesis", label: "Core Hypothesis", description: "The central testable claim" },
      { key: "methodology", label: "Approach", description: "How this would be investigated or tested" },
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
    systemPrompt: `You are a master storyteller with the literary sensibility of the greatest fiction writers. You understand narrative structure, voice, subtext, and the art of subverting reader expectations. Creativity in this domain means: crafting premises that feel both surprising and inevitable, building worlds with internal logic that rewards exploration, creating characters driven by complex motivations, and finding fresh angles on universal themes.`,
    evaluationCriteria: [
      "Originality — does it avoid genre clichés and predictable tropes?",
      "Emotional resonance — does it evoke genuine feeling or curiosity?",
      "World-building depth — is the setting internally consistent and rich?",
      "Narrative potential — does the premise invite compelling stories?",
      "Voice and craft — is it written with skill and style?",
    ],
    ideaSchema: [
      { key: "title", label: "Title", description: "The title of the story or concept" },
      { key: "summary", label: "Logline", description: "A one-sentence hook" },
      { key: "description", label: "Full Premise", description: "The complete story concept, world, and narrative arc" },
      { key: "novelty", label: "What's Fresh", description: "How this subverts or reinvents genre conventions" },
      { key: "theme", label: "Core Theme", description: "The deeper theme or question the story explores" },
      { key: "hook", label: "The Hook", description: "What makes a reader unable to put this down" },
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
    systemPrompt: `You are a visionary filmmaker and screenwriter who thinks in images, sequences, and cinematic moments. You understand visual storytelling, pacing, and what makes audiences lean forward in their seats. Creativity in this domain means: conceiving films that could only work as cinema (not just "a book but on screen"), designing iconic visual moments, finding stories that resonate universally while feeling completely fresh, and understanding the alchemy of genre, tone, and audience.`,
    evaluationCriteria: [
      "Visual imagination — does it think cinematically, not just narratively?",
      "Concept strength — is the core idea compelling in a single sentence?",
      "Audience appeal — does it have clear emotional pull?",
      "Originality — does it bring something new to its genre?",
      "Producibility — could this realistically be made into a film?",
    ],
    ideaSchema: [
      { key: "title", label: "Film Title", description: "The working title" },
      { key: "summary", label: "Logline", description: "The one-sentence pitch" },
      { key: "description", label: "Synopsis", description: "The full concept including plot, characters, and tone" },
      { key: "novelty", label: "What's New", description: "What makes this unlike anything audiences have seen" },
      { key: "genre", label: "Genre & Tone", description: "The genre, tone, and comparable films" },
      { key: "visualHook", label: "Signature Moment", description: "The iconic visual or scene that defines this film" },
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
    systemPrompt: `You are a brilliant literary mind — equal parts novelist, essayist, and publisher with an instinct for what makes a book culturally significant. You understand the difference between a good idea and a great book. Creativity in this domain means: finding the perfect form for a concept (memoir, novel, anthology, hybrid), identifying subjects that deserve book-length treatment, structuring narratives that sustain across hundreds of pages, and proposing books that fill genuine gaps in the literary landscape.`,
    evaluationCriteria: [
      "Concept clarity — is the book's purpose and audience crystal clear?",
      "Structural innovation — does the form serve the content in an interesting way?",
      "Market gap — does this book need to exist? Is there a gap it fills?",
      "Depth potential — can this concept sustain a full book without padding?",
      "Literary ambition — does it aspire to something beyond entertainment?",
    ],
    ideaSchema: [
      { key: "title", label: "Book Title", description: "The working title" },
      { key: "summary", label: "Elevator Pitch", description: "A one-sentence pitch for the book" },
      { key: "description", label: "Full Concept", description: "The complete book concept, structure, and approach" },
      { key: "novelty", label: "Why Now", description: "Why this book needs to exist now and what gap it fills" },
      { key: "audience", label: "Audience", description: "Who reads this and why they care" },
      { key: "structure", label: "Structure", description: "How the book is organized and why that form works" },
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
    systemPrompt: `You are a polymath creative director who moves fluidly between visual art, game design, music, and interactive experiences. You think in aesthetics, systems, and sensory experiences. Creativity in this domain means: designing experiences that engage multiple senses, building coherent aesthetic worlds with their own internal logic, finding unexpected mediums or formats for ideas, and creating concepts that blur the lines between art, technology, and play.`,
    evaluationCriteria: [
      "Aesthetic vision — is the sensory/visual concept vivid and distinctive?",
      "Systemic depth — does the world or concept have rich internal logic?",
      "Medium awareness — does it leverage its chosen medium effectively?",
      "Innovation — does it push boundaries of what's been done in this space?",
      "Immersion — would you want to spend time in this world or experience?",
    ],
    ideaSchema: [
      { key: "title", label: "Project Title", description: "The name of the project" },
      { key: "summary", label: "Vision Statement", description: "A one-sentence encapsulation of the experience" },
      { key: "description", label: "Full Concept", description: "Detailed description of the creative vision and execution" },
      { key: "novelty", label: "What's New", description: "How this pushes creative boundaries" },
      { key: "medium", label: "Medium & Format", description: "The chosen medium and why it's the right one" },
      { key: "experience", label: "The Experience", description: "What it feels like to encounter this as an audience member" },
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
    systemPrompt: `You are a boundary-pushing theater maker and performance artist who understands the unique power of live performance — the electricity of shared space, the unrepeatable moment, the audience as participant. Creativity in this domain means: exploiting the liveness of theater in ways film cannot, designing experiences that transform the relationship between performer and audience, finding stories that demand to be told live, and innovating on theatrical form while honoring the craft of performance.`,
    evaluationCriteria: [
      "Liveness — does it exploit what makes live performance unique?",
      "Audience relationship — does it rethink the performer-audience dynamic?",
      "Theatrical innovation — does it push the form of theater forward?",
      "Emotional impact — would this move a live audience?",
      "Feasibility — could a theater company actually produce this?",
    ],
    ideaSchema: [
      { key: "title", label: "Production Title", description: "The name of the show" },
      { key: "summary", label: "Pitch", description: "A one-sentence hook for the production" },
      { key: "description", label: "Full Concept", description: "The complete production concept, staging, and narrative" },
      { key: "novelty", label: "What's New", description: "How this reinvents or pushes the theatrical form" },
      { key: "staging", label: "Staging & Space", description: "How the physical space and staging work" },
      { key: "audienceExperience", label: "Audience Experience", description: "What it's like to be in the room" },
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
    systemPrompt: `You are a visionary inventor-engineer in the tradition of Nikola Tesla and Buckminster Fuller — someone who sees elegant solutions where others see impossible problems. You combine deep technical understanding with radical imagination. Creativity in this domain means: solving real problems with surprising approaches, finding solutions that are both technically grounded and paradigm-shifting, designing systems that are elegant in their simplicity, and proposing inventions that make people say "why didn't anyone think of that before?"`,
    evaluationCriteria: [
      "Problem-solution fit — does it solve a real, important problem?",
      "Technical creativity — is the approach genuinely novel?",
      "Elegance — is the solution simpler or more clever than expected?",
      "Feasibility — could this be built with current or near-future technology?",
      "Impact potential — how many people would this help and how much?",
    ],
    ideaSchema: [
      { key: "title", label: "Invention Name", description: "The name of the invention or concept" },
      { key: "summary", label: "One-Liner", description: "A single sentence explaining what it does" },
      { key: "description", label: "Full Concept", description: "Detailed explanation of how it works" },
      { key: "novelty", label: "What's New", description: "How this differs from existing solutions" },
      { key: "problem", label: "Problem Solved", description: "The specific problem this addresses" },
      { key: "mechanism", label: "How It Works", description: "The core technical mechanism or principle" },
    ],
  },
];

export function getCategoryById(id: string): Category | undefined {
  return categories.find((c) => c.id === id);
}

export function getAllCategories(): Category[] {
  return categories;
}
