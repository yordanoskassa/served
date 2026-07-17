# UPL boundary copy — Served

This copy keeps Served on the legal-information side of the product boundary. Served extracts document facts, checks selected public records and sourced warning signs, and explains what the evidence means. It does not advise a user what legal position to take or determine whether a document is valid or enforceable.

Use the short line appropriate to each screen. Do not stack every disclaimer on every page.

## Persistent footer

> Served provides document information, not legal advice, and does not represent you. For legal decisions or deadlines, contact the issuing court or a qualified attorney.

## Landing page

> Served provides sourced document information—not legal advice. It does not determine whether a document is legally valid or enforceable.

## Upload / consent

> Served analyzes this document for informational purposes only. Using Served does not create an attorney-client relationship.

## Reading / scanning

> Extracting and checking document information—not deciding what you should do.

## VERIFIED result

> VERIFIED means selected court-record details matched. It does not mean the document is valid, properly served, or enforceable.

## CANNOT_CONFIRM result

> CANNOT_CONFIRM does not mean the document is fake. Do not ignore a stated deadline; verify it with the issuing court or a qualified attorney.

## SCAM_INDICATORS result

> SCAM_INDICATORS means two or more sourced warning signs were detected. It is not a legal finding of fraud. Verify through independently sourced official contact information before paying or sharing personal information.

## Extracted dates and deadlines

> Dates shown are extracted from the document, not calculated legal deadlines. Rules, service dates, court orders, and case-specific facts may change the actual deadline.

## Legal explanation / cited passage

> This explanation provides general legal information from the cited source. It is not a case-specific legal opinion.

## Attorney handoff

> Sending information for review does not by itself create an attorney-client relationship. A relationship begins only if a licensed attorney separately agrees to represent you.

For the hackathon demo, add:

> Demo workflow only. No attorney is retained or reviewing this matter through the demo.

## Human-review trigger

Use a visible escalation message when the document is unreadable, outside corpus coverage, time-sensitive, disputed, or cannot be independently confirmed:

> This result needs human review. Contact the issuing court through its official website or ask a qualified attorney before taking a high-stakes step.

## Copy that must not appear

Do not let an agent or interface say:

- “This document is legally valid / invalid / enforceable.”
- “You must comply,” “you can ignore this,” or “you do not need a lawyer.”
- “This is definitely fraud” or “the sender committed a crime.”
- “We represent you,” “our legal advice,” or “your lawyer,” unless a real engagement has been formed.
- “Attorney reviewed” unless a licensed attorney actually reviewed the matter and the audit record identifies that event.
- “Guaranteed,” “100% accurate,” “risk-free,” or any equivalent promise.
- A calculated deadline when the required service date, rule, jurisdiction, and case facts are not all verified.

## Product behavior required alongside the copy

A disclaimer does not cure unsafe product behavior. The application must also:

1. Keep the deterministic verdict separate from legal advice.
2. Label uploaded-document facts, public-record evidence, and corpus sources separately.
3. Fall back to `CANNOT_CONFIRM` or human review when evidence is missing or conflicting.
4. Avoid drafting case-specific strategy, selecting claims or defenses, or instructing a user whether to comply.
5. Use independently sourced court contact information rather than contact details printed on an unverified document.
6. Preserve the Grounding Guard: unsupported claims and reconstructed quotations never render.

## Scope note

This is product-safety copy for the prototype, not a legal opinion that any particular implementation complies with every jurisdiction's UPL rules. Before production launch, licensed counsel should review the full user flow, marketing claims, attorney-handoff model, and jurisdictional coverage.

## Official grounding

- California Business and Professions Code § 6125: https://leginfo.legislature.ca.gov/faces/codes_displaySection.xhtml?lawCode=BPC&sectionNum=6125
- State Bar of California — Unauthorized Practice of Law: https://www.calbar.ca.gov/public/concerns-about-attorney/avoid-legal-services-fraud/unauthorized-practice-law
