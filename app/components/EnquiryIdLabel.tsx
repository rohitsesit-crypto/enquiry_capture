// =============================================================================
// app/components/EnquiryIdLabel.tsx   —  ENQUIRY ID PLATE
// =============================================================================
// Prints the Entry_ID the "Entries" tab holds, verbatim. Nothing is prefixed,
// padded, reformatted or substituted:
//
//     ENQ-00001     ENQP-00003     ENQPP-00008     ENQU-00042
//
// Two rendering modes:
//   default          — renders nothing when the cell is empty (compact cards)
//   showMissing      — renders a muted "No Entry ID" chip instead, so a blank id
//                      is visibly a data problem rather than a broken component
// =============================================================================

import { getEnquiryId } from "../lib/enquiryId";

interface EnquiryIdLabelProps {
  entry: Record<string, unknown>;
  size?: "sm" | "md";
  /** Render a muted chip when the sheet cell is empty instead of nothing. */
  showMissing?: boolean;
}

export default function EnquiryIdLabel({
  entry,
  size = "md",
  showMissing = false,
}: EnquiryIdLabelProps) {
  const id = getEnquiryId(entry);

  if (!id) {
    if (!showMissing) return null;
    return (
      <span
        className="inline-flex items-center rounded shrink-0 whitespace-nowrap"
        title="The Entry_ID cell for this row is empty in the Entries tab"
        style={{
          padding: size === "sm" ? "1px 5px" : "2px 7px",
          fontSize: size === "sm" ? 9.5 : 10.5,
          fontWeight: 700,
          fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
          background: "rgba(100,116,139,0.10)",
          color: "var(--text-muted)",
          border: "1px dashed var(--border)",
        }}
      >
        No Entry ID
      </span>
    );
  }

  return (
    <span
      className="inline-flex items-center rounded shrink-0 whitespace-nowrap"
      title="Entry ID as stored in the Entries sheet"
      style={{
        padding: size === "sm" ? "1px 5px" : "2px 7px",
        fontSize: size === "sm" ? 9.5 : 10.5,
        fontWeight: 700,
        letterSpacing: "0.02em",
        fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
        background: "var(--primary-bg)",
        color: "var(--primary)",
        border: "1px solid var(--primary)",
      }}
    >
      {id}
    </span>
  );
}
