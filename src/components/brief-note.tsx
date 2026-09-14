import type { Brief } from "@/lib/brief";

// The written brief above the tables. Rendered from src/data/brief.json, which
// the daily job commits — no LLM call happens on a page view.
//
// Absent or empty brief renders nothing: the tables are the product, and a
// missing paragraph should be invisible rather than an error state.
export default function BriefNote({ brief }: { brief: Brief | null }) {
  if (!brief?.text) return null;

  const written = new Date(brief.generatedAt);
  const stamp = Number.isNaN(written.getTime())
    ? null
    : written.toISOString().slice(0, 10);

  return (
    <aside className="mb-6 rounded border border-[#21262d] bg-[#0d1117] p-4">
      <div className="mb-2 flex items-baseline gap-2 font-mono text-[11px] text-[#7d8590]">
        <span className="text-[#8b949e]">what stands out</span>
        <span aria-hidden>·</span>
        {/* Labelled as machine-written on purpose: the reader should weigh it
            differently from the filing data, which comes straight from SEC Form 4. */}
        <span>written by {brief.model}</span>
        {stamp && (
          <>
            <span aria-hidden>·</span>
            <span>{stamp}</span>
          </>
        )}
      </div>
      <p className="font-mono text-xs leading-relaxed text-[#8b949e]">{brief.text}</p>
    </aside>
  );
}
