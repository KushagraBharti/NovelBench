"use client";

import { useRef } from "react";
import { motion, useInView } from "framer-motion";
import { categories } from "@/lib/categories";
import { getCategoryIdentity, categoryOrder } from "@/utils/category-identity";
import AuthAwareLink from "@/components/auth/AuthAwareLink";

export default function DomainsGrid() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-80px" });

  return (
    <section className="py-28 px-6 border-t border-border">
      <div className="max-w-6xl mx-auto">
        <p className="label mb-4">Creative Domains</p>
        <h2 className="font-display text-3xl sm:text-4xl text-text-primary mb-16">
          Choose your arena
        </h2>

        <div
          ref={ref}
          className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-border"
        >
          {categoryOrder.map((catId, i) => {
            const cat = categories.find((c) => c.id === catId);
            if (!cat) return null;
            const identity = getCategoryIdentity(catId);

            return (
              <motion.div
                key={catId}
                initial={{ opacity: 0 }}
                animate={isInView ? { opacity: 1 } : {}}
                transition={{ duration: 0.4, delay: i * 0.06 }}
              >
                <AuthAwareLink
                  href={`/arena?category=${catId}`}
                  className="block bg-bg-deep p-6 group h-full"
                >
                  <div className="flex items-start justify-between mb-4">
                    <span className="font-mono text-base text-text-muted">
                      {identity.number}
                    </span>
                    <span
                      className="w-1.5 h-1.5 rounded-full opacity-40 group-hover:opacity-100 transition-opacity duration-300"
                      style={{ backgroundColor: identity.color }}
                    />
                  </div>

                  <h3 className="font-display text-xl text-text-primary mb-2 group-hover:text-accent transition-colors duration-300">
                    {cat.name}
                  </h3>
                  <p className="text-base text-text-muted leading-relaxed">
                    {cat.description}
                  </p>
                </AuthAwareLink>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
