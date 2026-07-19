# D4 request-to-payments test pack

This fixture powers the Plaid matching act and connects to the separate
`payroll-records` fixture without changing D1, D2, D3, or the payroll fixture.
Everything in this folder is fictional training data.

## Demo story

D4 is a second AO 88B training subpoena in the same case used by D1:
`Barnes v. Maximus Consulting Services, Inc.`,
`5:25-cv-02108-KK-SP`, C.D. California. It arrives after the D1 payroll
response and asks Mendoza's Kitchen, LLC for records of payments made to or
for the benefit of Audrea Barnes, including bank records reflecting those
payments.

The user connects a synthetic Plaid Sandbox business checking account. Served
compares the 28 transactions with the payee and date criteria displayed in D4:

- **7 INCLUDE** - exact Audrea Barnes payee and in-range date matches
- **2 REVIEW** - one unnamed check and one near-name ACH
- **19 EXCLUDE** - suppliers, operating expenses, other employees, and two
  Audrea payments outside the displayed date range

Demo headline: **"Matched 7 payments to Audrea Barnes. Flagged 2 for human
review. Excluded 19 - the agent never touched what the request didn't ask
for."**

## Verdict gate

This act runs **only after D4 returns `VERIFIED`** through the existing docket
flow. The Plaid connect button and all financial matching tools stay locked for
`CANNOT_CONFIRM` and `SCAM_INDICATORS`. Verification unlocks investigation; it
does not authorize production.

## Files

| File | Purpose |
|---|---|
| `plaid-sandbox-custom-user.json` | Plaid custom Sandbox user in `override_accounts` format: one business checking account and 28 deterministic transactions. |
| `../../documents/D4.pdf` | Three-page AO 88B training specimen that drives the payments request. |
| `../../../tests/fixtures/financial/payment-records-expected-output.json` | Gold labels, reason codes, totals, UI copy, and the verdict gate contract. |

The Plaid configuration follows the custom-user `override_accounts` schema.
Plaid Sandbox creates its own `transaction_id`; therefore
`expected-output.json` maps stable fixture IDs to transaction index plus the
date, amount, and description tuple.

Schema reference: <https://plaid.com/docs/sandbox/user-custom/>

## Payroll consistency

The seven exact-match ACH amounts are linked to the existing payroll data:

| Payment date | Amount | Payroll source |
|---|---:|---|
| 2026-01-05 | $1,337.60 | `../payroll-records/payroll-records-fixture.json` - 2025-12-16 through 2025-12-31 |
| 2026-02-05 | $2,802.30 | January payroll packet |
| 2026-03-05 | $2,820.12 | February payroll packet |
| 2026-04-05 | $3,069.60 | March payroll packet |
| 2026-05-05 | $2,846.85 | April payroll packet |
| 2026-06-05 | $2,935.95 | May payroll packet |
| 2026-07-05 | $2,900.31 | June payroll packet |

The partial July payroll packet is dated July 15 and has no corresponding
payment in this bank fixture before D4's July 16 locked cutoff.

## Acceptance criteria

- D4 must first return `VERIFIED`; otherwise the financial connection remains
  unavailable.
- All 28 transaction positions must be evaluated exactly once.
- Totals must equal 7 `INCLUDE`, 2 `REVIEW`, and 19 `EXCLUDE`.
- Exact payee and in-range date are both required for automatic candidate
  inclusion.
- An unnamed instrument or near-name is always routed to human review.
- Other employees are excluded even when their dates and amounts resemble
  payroll.
- Audrea payments before 2026-01-01 are excluded.
- Every disposition carries a deterministic reason code.
- No transaction is automatically sent, produced, or shared.

## Boundary

Served identifies **candidate transactions matching the criteria displayed in
D4**. It never decides legal responsiveness, sufficiency, privilege,
objections, proper service, or whether production is required. The result is a
user-reviewed preparation artifact that can be brought to in-house counsel or
an attorney of the user's choice.

All names, addresses, account identifiers, contact details, transactions, and
amounts are synthetic training fixtures. `D4.pdf` is watermarked
`SPECIMEN - TRAINING USE ONLY` and is not valid for service or legal use.
