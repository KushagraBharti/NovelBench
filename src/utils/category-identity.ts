export interface CategoryIdentity {
  id: string;
  color: string;
  number: string;
}

export const categoryIdentities: Record<string, CategoryIdentity> = {
  venture:   { id: "venture",   color: "#B8896B", number: "01" },
  frontier:  { id: "frontier",  color: "#7B93A8", number: "02" },
  story:     { id: "story",     color: "#9B8EB8", number: "03" },
  cinema:    { id: "cinema",    color: "#C75050", number: "04" },
  folio:     { id: "folio",     color: "#8B7EC8", number: "05" },
  canvas:    { id: "canvas",    color: "#A87B9B", number: "06" },
  stage:     { id: "stage",     color: "#B88A5C", number: "07" },
  blueprint: { id: "blueprint", color: "#7BA894", number: "08" },
};

export function getCategoryIdentity(categoryId: string): CategoryIdentity {
  return (
    categoryIdentities[categoryId] ?? {
      id: categoryId,
      color: "#9B9590",
      number: "00",
    }
  );
}

export const categoryOrder = [
  "venture", "frontier", "story", "cinema",
  "folio", "canvas", "stage", "blueprint",
];
