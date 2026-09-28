// Public testimonials. Reads only approved rows that the customer agreed to
// show, through a database function that returns just the display name, the
// rating, the comment and the date. No account id and no email ever leaves
// the database.
//
// Drop it on any public page, for example src/routes/gatherings.tsx,
// src/routes/pricing.tsx or src/routes/index.tsx:
//   <Testimonials />
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Star } from "lucide-react";
import { listPublicTestimonials, type PublicTestimonial } from "@/lib/product-feedback.functions";

export function Testimonials({
  limit = 6,
  heading = "What our customers say",
  subheading = "Kind words from people who plan with us.",
}: {
  limit?: number;
  heading?: string;
  subheading?: string;
}) {
  const load = useServerFn(listPublicTestimonials);
  const [rows, setRows] = useState<PublicTestimonial[]>([]);

  useEffect(() => {
    let active = true;
    load({ data: { limit } })
      .then((r) => {
        if (active) setRows(r);
      })
      .catch(() => {
        if (active) setRows([]);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [limit]);

  if (rows.length === 0) return null;

  return (
    <section className="mx-auto max-w-6xl px-4 py-14">
      <h2 className="font-serif text-3xl text-foreground">{heading}</h2>
      <p className="mt-2 text-base text-muted-foreground">{subheading}</p>
      <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((r, i) => (
          <li
            key={`${r.publicName}-${i}`}
            className="rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <span
              className="inline-flex items-center gap-0.5"
              aria-label={`${r.rating} of 5 stars`}
            >
              {[1, 2, 3, 4, 5].map((s) => (
                <Star
                  key={s}
                  className={`h-4 w-4 ${
                    s <= r.rating ? "fill-primary text-primary" : "text-muted-foreground/40"
                  }`}
                />
              ))}
            </span>
            <p className="mt-3 text-lg text-foreground">{r.comment}</p>
            <p className="mt-3 text-base text-muted-foreground">{r.publicName}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
