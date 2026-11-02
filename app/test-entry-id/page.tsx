"use client";

// =============================================================================
// app/test-entry-id/page.tsx   —  ENTRY_ID READABILITY TEST
// =============================================================================
// Proves, against the live Apps Script backend, that the Entry_ID column of the
// "Entries" tab is read correctly and reaches the frontend unchanged.
//
// It checks, in order:
//   1. the Entry_ID column exists in the Entries tab (and at which position)
//   2. every row's cell value, as stored, vs. what the frontend receives
//   3. rows whose Entry_ID cell is empty
//   4. values that do not look like an enquiry id (bill/party numbers)
//   5. a single-entry round trip through getEntryById
//
// Read-only: nothing is written to the sheet.
// =============================================================================

import { useCallback, useMemo, useState } from "react";
import Link from "next/link";
import {
  getAdminData,
  getEntryById,
  getEntryIdReport,
  getUserDashboardData,
  type EntryIdReport,
  type EntryIdReportRow,
} from "../lib/api";
import { getEnquiryId, isEntryIdShape, readEntryIdCell } from "../lib/enquiryId";

type CheckState = "idle" | "running" | "pass" | "fail" | "warn";

interface Check {
  key: string;
  label: string;
  detail: string;
  state: CheckState;
}

const STATE_STYLE: Record<CheckState, { bg: string; fg: string; label: string }> = {
  idle: { bg: "rgba(100,116,139,0.12)", fg: "#475569", label: "WAITING" },
  running: { bg: "rgba(37,99,235,0.12)", fg: "#2563eb", label: "RUNNING" },
  pass: { bg: "rgba(5,150,105,0.12)", fg: "#059669", label: "PASS" },
  warn: { bg: "rgba(217,119,6,0.14)", fg: "#b45309", label: "CHECK" },
  fail: { bg: "rgba(220,38,38,0.12)", fg: "#dc2626", label: "FAIL" },
};

export default function EntryIdTestPage() {
  const [email, setEmail] = useState<string>(() =>
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("email") || ""
      : ""
  );
  const [report, setReport] = useState<EntryIdReport | null>(null);
  const [checks, setChecks] = useState<Check[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [roundTrip, setRoundTrip] = useState<string>("");

  const run = useCallback(async () => {
    setBusy(true);
    setError("");
    setRoundTrip("");
    setChecks([{ key: "start", label: "Reading the Entries tab", detail: "Contacting Apps Script…", state: "running" }]);

    try {
      const result = await getEntryIdReport(email.trim());

      if (!result.success) {
        setReport(null);
        setChecks([
          {
            key: "api",
            label: "Backend reachable",
            detail: result.message || "The Apps Script call failed.",
            state: "fail",
          },
        ]);
        setError(result.message || "The backend did not return a report.");
        return;
      }

      setReport(result);
      const rows = result.rows || [];
      setChecks(buildChecks(result, rows));

      // Round trip: read one real entry back through a second endpoint and
      // confirm the Entry_ID still matches what the Entries tab holds.
      const probe = rows.find((r) => r.hasEntryId);
      if (probe && email.trim()) {
        const single = await getEntryById(email.trim(), probe.entryId);
        if (!single.success) {
          setRoundTrip(`Lookup for ${probe.entryId} returned: ${single.message || "no entry"}`);
        } else {
          const returned = getEnquiryId(single.entry || {});
          setRoundTrip(
            returned === probe.entryId
              ? `Round trip OK — row ${single.rowNumber} returned "${returned}".`
              : `Mismatch — sheet holds "${probe.entryId}", lookup returned "${returned}".`
          );
        }
      } else if (probe) {
        setRoundTrip("Add a registered user email to also run the single-entry round trip.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setChecks([
        { key: "api", label: "Backend reachable", detail: message, state: "fail" },
      ]);
    } finally {
      setBusy(false);
    }
  }, [email]);

  const rows = report?.rows || [];
  const summary = useMemo(() => {
    const pass = checks.filter((c) => c.state === "pass").length;
    const fail = checks.filter((c) => c.state === "fail").length;
    const warn = checks.filter((c) => c.state === "warn").length;
    return { pass, fail, warn };
  }, [checks]);

  /** Also compare the user dashboard payload, which is what the user page renders. */
  const [dashboardNote, setDashboardNote] = useState("");
  const runDashboardCheck = useCallback(async () => {
    if (!email.trim()) {
      setDashboardNote("Enter a registered email to compare the user page payload.");
      return;
    }
    setBusy(true);
    try {
      const data = await getUserDashboardData(email.trim());
      if (!data.success) {
        setDashboardNote(`User payload: ${data.message || "failed"}`);
        return;
      }
      const list = (data.entries || []) as Record<string, unknown>[];
      const withId = list.filter((e) => getEnquiryId(e) !== "").length;
      setDashboardNote(
        `User page payload: ${list.length} entries, ${withId} with an Entry_ID.` +
          (list.length === withId ? " Every card will show its ID." : ` ${list.length - withId} card(s) have an empty Entry_ID cell.`)
      );
    } catch (err) {
      setDashboardNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [email]);

  const [adminNote, setAdminNote] = useState("");
  const runAdminCheck = useCallback(async () => {
    if (!email.trim()) {
      setAdminNote("Enter an admin email to compare the admin payload.");
      return;
    }
    setBusy(true);
    try {
      const data = await getAdminData(email.trim());
      if (!data.success) {
        setAdminNote(`Admin payload: ${data.message || "failed"}`);
        return;
      }
      const list = (data.entries || []) as Record<string, unknown>[];
      const withId = list.filter((e) => getEnquiryId(e) !== "").length;
      setAdminNote(`Admin payload: ${list.length} entries, ${withId} with an Entry_ID.`);
    } catch (err) {
      setAdminNote(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [email]);

  return (
    <div className="min-h-screen px-4 py-8" style={{ background: "var(--bg)" }}>
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--text)" }}>
              Entry_ID readability test
            </h1>
            <p className="text-xs mt-1" style={{ color: "var(--text-muted)" }}>
              Confirms the Entries tab&apos;s Entry_ID column is read and delivered unchanged.
            </p>
          </div>
          <Link href="/" className="text-xs font-semibold px-3 py-2 rounded-lg" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
            Back home
          </Link>
        </div>

        <div className="p-4 rounded-xl mb-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <label className="block text-[11px] font-bold mb-1.5" style={{ color: "var(--text-muted)" }}>
            Registered user email (optional for the report, required for the payload checks)
          </label>
          <div className="flex gap-2 flex-wrap">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              className="flex-1 min-w-[220px] px-3 py-2.5 rounded-lg text-sm outline-none"
              style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <button
              onClick={run}
              disabled={busy}
              className="px-4 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-60"
              style={{ background: "var(--primary)" }}
            >
              {busy ? "Checking…" : "Run test"}
            </button>
          </div>
          <div className="flex gap-2 flex-wrap mt-2">
            <button onClick={runDashboardCheck} disabled={busy} className="px-3 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-60" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}>
              Check user page payload
            </button>
            <button onClick={runAdminCheck} disabled={busy} className="px-3 py-2 rounded-lg text-[11px] font-semibold disabled:opacity-60" style={{ background: "var(--surface-2)", border: "1px solid var(--border)", color: "var(--text)" }}>
              Check admin payload
            </button>
          </div>
        </div>

        {error && (
          <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: "rgba(220,38,38,0.08)", border: "1px solid rgba(220,38,38,0.25)", color: "#b91c1c" }}>
            {error}
          </div>
        )}
        {dashboardNote && (
          <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
            {dashboardNote}
          </div>
        )}
        {adminNote && (
          <div className="p-3 rounded-lg mb-4 text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text)" }}>
            {adminNote}
          </div>
        )}

        {checks.length > 0 && (
          <div className="p-4 rounded-xl mb-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <h2 className="text-sm font-bold" style={{ color: "var(--text)" }}>Checks</h2>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "#059669" }}>{summary.pass} pass</span>
              {summary.warn > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: "#b45309" }}>{summary.warn} check</span>}
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white" style={{ background: summary.fail ? "#dc2626" : "#475569" }}>{summary.fail} fail</span>
            </div>
            <div className="space-y-2">
              {checks.map((c) => (
                <div key={c.key} className="flex items-start gap-2.5 p-2.5 rounded-lg" style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                  <span className="text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0" style={{ background: STATE_STYLE[c.state].bg, color: STATE_STYLE[c.state].fg }}>
                    {STATE_STYLE[c.state].label}
                  </span>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold" style={{ color: "var(--text)" }}>{c.label}</p>
                    <p className="text-[11px]" style={{ color: "var(--text-muted)" }}>{c.detail}</p>
                  </div>
                </div>
              ))}
            </div>
            {roundTrip && (
              <p className="mt-3 text-[11px] font-semibold" style={{ color: "var(--text)" }}>{roundTrip}</p>
            )}
          </div>
        )}

        {report?.success && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <Stat label="Rows read" value={String(report.totalRows ?? 0)} />
            <Stat label="With Entry_ID" value={String(report.withEntryId ?? 0)} good />
            <Stat label="Missing Entry_ID" value={String(report.missingEntryId ?? 0)} bad={(report.missingEntryId ?? 0) > 0} />
            <Stat label="Not ENQ-shaped" value={String(report.idsNotMatchingEnqShape ?? 0)} bad={(report.idsNotMatchingEnqShape ?? 0) > 0} />
          </div>
        )}

        {rows.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)" }}>
                    <Th>Row</Th>
                    <Th>Entry_ID (cell)</Th>
                    <Th>Frontend reads</Th>
                    <Th>Company</Th>
                    <Th>Submitted by</Th>
                    <Th>Step</Th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <ReportRow key={`${r.row}-${r.entryId}`} row={r} />
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {!report && !error && (
          <div className="text-center py-14 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)", color: "var(--text-muted)" }}>
            <p className="text-xs">Run the test to read the Entry_ID column.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function buildChecks(report: EntryIdReport, rows: EntryIdReportRow[]): Check[] {
  const checks: Check[] = [];

  checks.push({
    key: "column",
    label: "Entry_ID column found in the Entries tab",
    detail:
      (report.entryIdColumn || 0) > 0
        ? `Header "${report.entryIdHeader}" at column ${report.entryIdColumn} of "${report.sheetTitle}".`
        : report.message || "No Entry_ID column.",
    state: (report.entryIdColumn || 0) > 0 ? (report.entryIdHeaderExact ? "pass" : "warn") : "fail",
  });

  checks.push({
    key: "rows",
    label: "Rows read from the Entries tab",
    detail: `${report.totalRows ?? 0} row(s) with data, ${report.withEntryId ?? 0} holding an Entry_ID.`,
    state: (report.totalRows ?? 0) > 0 ? "pass" : "warn",
  });

  const missing = report.missingEntryId ?? 0;
  checks.push({
    key: "missing",
    label: "Rows whose Entry_ID cell is empty",
    detail:
      missing === 0
        ? "No empty Entry_ID cells — every entry card can show its ID."
        : `${missing} row(s) have an empty Entry_ID cell. Fill those cells in the Entries tab; the app shows them without an ID rather than inventing one.`,
    state: missing === 0 ? "pass" : "warn",
  });

  const mismatched = rows.filter((r) => r.hasEntryId && isEntryIdShape(r.entryId) !== r.idLooksValid).length;
  checks.push({
    key: "shape",
    label: "Frontend and backend agree on the value",
    detail:
      mismatched === 0
        ? "Every cell value is classified the same way by the sheet reader and the frontend."
        : `${mismatched} row(s) classified differently by the frontend.`,
    state: mismatched === 0 ? "pass" : "fail",
  });

  const duplicates = report.duplicateEntryIds ?? 0;
  checks.push({
    key: "dupes",
    label: "Entry_ID values are unique",
    detail: duplicates === 0 ? "No duplicate Entry_ID values." : `${duplicates} duplicate Entry_ID value(s) found.`,
    state: duplicates === 0 ? "pass" : "warn",
  });

  return checks;
}

function ReportRow({ row }: { row: EntryIdReportRow }) {
  const read = readEntryIdCell(row.entryId);
  const match = read === row.entryId;
  return (
    <tr style={{ borderBottom: "1px solid var(--border-light)" }}>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{row.row}</td>
      <td className="px-3 py-2 font-mono font-bold" style={{ color: row.hasEntryId ? "var(--primary)" : "var(--text-faint)" }}>
        {row.entryId || "—"}
      </td>
      <td className="px-3 py-2">
        <span className="font-mono text-[11px] font-bold" style={{ color: match ? "#059669" : "#dc2626" }}>
          {read || "—"}
        </span>
        {!match && <span className="ml-1 text-[10px]" style={{ color: "#dc2626" }}>differs</span>}
        {row.hasEntryId && !row.idLooksValid && (
          <span className="ml-1 text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ background: "rgba(217,119,6,0.14)", color: "#b45309" }}>
            not ENQ
          </span>
        )}
      </td>
      <td className="px-3 py-2" style={{ color: "var(--text)" }}>{row.companyName || "—"}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{row.submittedBy || "—"}</td>
      <td className="px-3 py-2" style={{ color: "var(--text-muted)" }}>{row.currentStep || "—"}</td>
    </tr>
  );
}

function Stat({ label, value, good, bad }: { label: string; value: string; good?: boolean; bad?: boolean }) {
  const color = bad ? "#dc2626" : good ? "#059669" : "var(--text)";
  return (
    <div className="p-3 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <p className="text-[10px] font-semibold uppercase" style={{ color: "var(--text-muted)" }}>{label}</p>
      <p className="text-lg font-bold" style={{ color }}>{value}</p>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="px-3 py-2 text-left text-[10px] font-bold uppercase whitespace-nowrap" style={{ color: "var(--text-muted)" }}>
      {children}
    </th>
  );
}
