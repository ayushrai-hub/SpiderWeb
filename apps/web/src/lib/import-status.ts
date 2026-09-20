import type { ImportSummary } from "./types";

type Tone = "success" | "warning" | "danger" | "neutral" | "accent";

export const STATUS_TONE: Record<ImportSummary["status"], Tone> = {
  completed: "success",
  partially_completed: "warning",
  failed: "danger",
  pending: "accent",
  processing: "accent",
  cancelled: "neutral",
};

export const STATUS_LABEL: Record<ImportSummary["status"], string> = {
  completed: "Completed",
  partially_completed: "Partially completed",
  failed: "Failed",
  pending: "Queued",
  processing: "Processing",
  cancelled: "Cancelled",
};

/**
 * What the user can actually do about a failure.
 *
 * The API already returns a readable `errorMessage`; this adds the next step,
 * which is the part that saves someone a support round-trip.
 */
export function recoveryAdvice(errorCode: string | null): string | null {
  switch (errorCode) {
    case "NO_LINKEDIN_DATA":
      return "Upload the .zip exactly as LinkedIn emailed it, or a CSV such as Connections.csv. A folder you assembled yourself will not be recognised.";
    case "INVALID_ARCHIVE":
    case "MALFORMED_ARCHIVE":
      return "The file is not a readable ZIP. Download the archive again — some mail clients rewrite attachments in transit.";
    case "EMPTY_ARCHIVE":
    case "EMPTY_ARCHIVE_CONTENTS":
    case "NO_FILES":
      return "Nothing readable was in the upload. Check the download completed before uploading it again.";
    case "ARCHIVE_BOMB":
    case "ENTRY_TOO_LARGE":
      return "The archive expands to more than SpiderWeb will process. Request a smaller export from LinkedIn, or upload the individual CSV files you need.";
    case "PROCESSING_CRASHED":
    case "WORKER_FAILED":
      return "The import stopped unexpectedly. Uploading the same file again is safe — SpiderWeb updates existing records rather than duplicating them.";
    default:
      return null;
  }
}
