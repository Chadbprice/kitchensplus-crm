/**
 * Subcontractor Compliance Scan Scheduler
 * Runs the SubcontractorComplianceAgent on a 24-hour cycle.
 * Same pattern as complianceReminder.ts.
 */
import { runSubcontractorComplianceAgent } from "./agents/SubcontractorComplianceAgent";

let _started = false;

export function startSubcontractorComplianceScan(): void {
  if (_started) return;
  _started = true;

  // Run once at startup (offset by 3 minutes to avoid startup congestion)
  setTimeout(() => {
    runSubcontractorComplianceAgent("scheduled").catch((err) => {
      console.error("[SubcontractorComplianceScan] Startup scan failed:", err);
    });
  }, 3 * 60 * 1000);

  // Then run every 24 hours
  setInterval(() => {
    runSubcontractorComplianceAgent("scheduled").catch((err) => {
      console.error("[SubcontractorComplianceScan] Scheduled scan failed:", err);
    });
  }, 24 * 60 * 60 * 1000);

  console.log("[SubcontractorComplianceScan] Scheduler started — runs every 24 hours.");
}
