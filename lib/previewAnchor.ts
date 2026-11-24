import type { StepKey } from "./store";
import type { Quotation } from "./types";

/** Where the live preview should scroll for a wizard step. */
export interface PreviewAnchor {
  /** Text to look for in the rendered PDF; the first candidate found wins. */
  texts: string[];
  /** "page": scroll to the top of the page containing the text; "text": scroll to the text itself. */
  align: "page" | "text";
  /** Used when none of the texts is found. */
  fallback: "top" | "end" | "none";
}

const firstLine = (s: string) =>
  s
    .split("\n")
    .map((l) => l.replace(/^\s*(?:[-•]|\d+[.)])\s+/, "").trim())
    .find(Boolean)
    ?.slice(0, 40) ?? "";

export function previewAnchor(step: StepKey, q: Quotation): PreviewAnchor {
  switch (step) {
    case "client":
      return { texts: [], align: "page", fallback: "top" };
    case "letter":
      return { texts: [q.letter.salutation, firstLine(q.letter.body)].filter(Boolean), align: "text", fallback: "top" };
    case "pricing":
      // The pricing table always starts on a new page.
      return { texts: q.pricing.mode === "boq" ? ["Sr No"] : ["Sl No"], align: "page", fallback: "none" };
    case "scope": {
      const block = q.scope.blocks.find(
        (b) => b.enabled && (b.kind === "workScope" ? b.title || q.scope.workScopeItems.length : b.title || b.text),
      );
      const texts = block
        ? [block.title, block.kind === "workScope" ? "Scope of Work:" : firstLine(block.text)].filter(Boolean)
        : [];
      return { texts, align: "text", fallback: "none" };
    }
    case "terms":
      return { texts: ["Terms and conditions:"], align: "text", fallback: "none" };
    case "matrix":
      return { texts: q.matrix.enabled ? ["Scope matrix:"] : ["Regards"], align: "text", fallback: "end" };
    case "annexures": {
      const a = q.annexures;
      const texts = [
        a.shedEnabled ? a.shedIntro || a.shedTitle : "",
        a.notesEnabled ? firstLine(a.notes) : "",
        a.photosEnabled ? a.photosTitle : "",
      ].filter(Boolean);
      return { texts, align: "text", fallback: "end" };
    }
    default:
      return { texts: [], align: "page", fallback: "none" };
  }
}
