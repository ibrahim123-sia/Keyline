import { ChevronDownIcon } from "lucide-react";
import { JsonLd } from "@/components/site/json-ld";
import { faqJsonLd } from "@/features/content/json-ld";

/**
 * Questions and answers (08 §5) as native disclosure widgets (no script needed), with
 * FAQPage structured data. Answers are HTML built on the server from allowlisted rich text.
 */
export function FaqList({
  id,
  title,
  faqs,
}: {
  id: string;
  title: string;
  faqs: Array<{ id: string; question: string; answerHtml: string }>;
}) {
  if (faqs.length === 0) return null;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <h2 id={id} className="text-h2">
        {title}
      </h2>
      <div className="divide-y divide-border rounded-[20px] bg-surface shadow-soft">
        {faqs.map((f) => (
          <details key={f.id} className="group px-5 py-1">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[16px] font-semibold text-ink [&::-webkit-details-marker]:hidden">
              {f.question}
              <ChevronDownIcon
                className="size-5 shrink-0 text-text-muted transition-transform group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div
              className="rich-text pb-4 text-[15.5px] leading-relaxed text-text"
              dangerouslySetInnerHTML={{ __html: f.answerHtml }}
            />
          </details>
        ))}
      </div>
      <JsonLd data={faqJsonLd(faqs)} />
    </section>
  );
}
