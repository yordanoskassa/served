# Payroll request-to-records test pack

This package extends the existing D1 demo without changing D1, D2, D3, or
their verdict tests. It begins only after D1 has already returned `VERIFIED`.

## Demo story

D1 asks Mendoza's Kitchen, LLC for:

> All payroll records, wage statements, and time records for Audrea Barnes,
> from January 1, 2026 to the present.

For deterministic replay, this fixture locks "present" to **2026-07-15**, the
issue date displayed on D1. Production code must use an explicit user-confirmed
cutoff; it must not silently substitute today's date.

## Files

| File | Purpose |
|---|---|
| `payroll-records-fixture.json` | Machine-readable synthetic payroll, wage-statement, and time-record data (36 records). |
| `bulk-hr-payroll-export.csv` | A 275-record synthetic HR/payroll export for the full-scale filtering demo. |
| `../../../tests/fixtures/financial/payroll-records-expected-output.json` | Record-level gold labels, reason codes, totals, UI copy, and hard safety boundaries for the 36-record fixture. |
| `../../../tests/fixtures/financial/payroll-bulk-expected-output.json` | Gold labels and reason-code counts for the 275-record bulk export. |

All people, contact details, identifiers, amounts, and records in this package
are fictional training data.

Human-readable review materials (the QA workbook and the monthly payroll PDF
packets used as demo uploads — 7 PDFs / 21 pages, January through a partial
July ending at the 2026-07-15 cutoff) live in the team handoff package, not in
this repository.

## Full-scale filtering demo

The 36-record fixture remains the focused regression suite. The bulk
dataset adds the scale shot for the product demo without changing D1 or its
verdict:

- **275 records searched**
- **21 exact candidates matched**: seven monthly packets x three D1-requested
  categories for Audrea Barnes
- **7 records need review**: identity, date-boundary, category-mapping,
  duplicate, and missing-date ambiguities
- **247 records kept outside**: 180 records for other employees, 40 records
  outside the locked date range, and 27 record types D1 did not request

Recommended on-screen copy: **"275 records searched. 21 matched the displayed
request criteria, 7 need your review, and 247 stayed outside the candidate
set."** These are candidate-matching labels, not legal determinations about
responsiveness or production.

## Expected workflow

1. D1 is read and independently verified through the existing Served flow.
2. The request parser extracts the subject employee, requested record types,
   start date, and displayed cutoff.
3. The user uploads or connects a synthetic payroll export.
4. The matcher labels each record `INCLUDE`, `REVIEW`, or `EXCLUDE` and gives a
   deterministic reason code.
5. The user reviews every selected or ambiguous record.
6. Served exports a review packet. It does not send or produce the records.

## Acceptance criteria

- All 36 record IDs are returned exactly once.
- Expected totals are 3 `INCLUDE`, 4 `REVIEW`, and 29 `EXCLUDE`.
- The demo summary may truthfully say: "3 candidate records matched, 4 need
  review, and 29 stayed outside the candidate set."
- Other employees are excluded even when their dates match.
- Records wholly before 2026-01-01 are excluded.
- The four ambiguous or boundary records are surfaced for review, not silently
  included.
- Every label includes a reason code.
- No record is automatically sent to any court, attorney, agency, or third party.
- The existing D1 verdict remains `VERIFIED`; responsive-record matching is a
  separate downstream workflow and cannot alter that verdict.
- For the bulk dataset, every one of the 275 IDs must appear exactly once and
  totals must equal 21 `MATCHED`, 7 `POSSIBLE`, and 247 `OUTSIDE`.

## Safety boundary

Served identifies **potentially responsive** records from the request text. It
does not decide legal sufficiency, privilege, objections, proper service, or
whether production is required. Any export is a user-reviewed preparation
artifact that the user can bring to in-house counsel or an attorney of their
choice.
