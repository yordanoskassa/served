"""Transactional delivery of user-owned analysis handoffs through Resend."""

from __future__ import annotations

from dataclasses import dataclass
from html import escape
import re
from urllib.parse import urlsplit

import httpx

from app.config import settings
from app.schemas.analysis import AnalysisResponse


RESEND_EMAILS_URL = "https://api.resend.com/emails"
RESEND_TIMEOUT_SECONDS = 10.0


class EmailDeliveryNotConfiguredError(RuntimeError):
    """Raised when the server is missing required email configuration."""


class EmailDeliveryError(RuntimeError):
    """Raised when the provider does not accept an email for delivery."""


@dataclass(frozen=True)
class EmailDeliveryReceipt:
    message_id: str
    recipient: str


def _single_line(value: object, *, limit: int = 500) -> str:
    """Bound untrusted display text and remove line breaks from header fields."""
    text = re.sub(r"\s+", " ", str(value or "")).strip()
    return text[:limit]


def _bounded_text(value: object, *, limit: int = 2_000) -> str:
    """Bound body content without rewriting the quoted source wording."""
    return str(value or "").replace("\x00", "")[:limit]


def _safe_url(value: str | None) -> str | None:
    if not value:
        return None
    parsed = urlsplit(value)
    if parsed.scheme != "https" or not parsed.netloc:
        return None
    return value


def _verdict_copy(analysis: AnalysisResponse) -> tuple[str, str]:
    if analysis.verdict.value == "verified":
        return (
            "VERIFIED",
            "The public case record was found and the named parties matched. "
            "This does not authenticate the paper itself.",
        )
    if analysis.verdict.value == "scam":
        return (
            "SCAM",
            "Two or more independently sourced scam-pattern signals were found. "
            "This is an evidence-triage result, not a legal finding of fraud.",
        )
    return (
        "CANNOT_CONFIRM",
        "The available evidence did not satisfy either deterministic decision branch.",
    )


def _analysis_sections(analysis: AnalysisResponse, filename: str) -> list[tuple[str, list[str]]]:
    verdict_label, verdict_boundary = _verdict_copy(analysis)
    breakdown = analysis.breakdown
    sections: list[tuple[str, list[str]]] = [
        (
            "Decision receipt",
            [
                f"Document: {_single_line(filename, limit=255)}",
                f"Document type: {_single_line(analysis.document_type)}",
                f"Result: {verdict_label}",
                verdict_boundary,
                f"Summary: {_single_line(analysis.summary, limit=2_000)}",
            ],
        ),
        (
            "Extracted facts",
            [
                f"Court: {_single_line(breakdown.court) or 'Not identified'}",
                f"Case number: {_single_line(breakdown.case_number) or 'Not identified'}",
                "Parties: "
                + (
                    ", ".join(_single_line(party) for party in breakdown.parties[:20])
                    or "Not identified"
                ),
                f"Printed document date: {_single_line(breakdown.document_date) or 'Not identified'}",
                f"Printed deadline: {_single_line(analysis.deadline or breakdown.deadline) or 'Not identified'}",
                "Requested actions: "
                + (
                    "; ".join(
                        _single_line(action, limit=1_000)
                        for action in breakdown.requested_actions[:20]
                    )
                    or "None identified"
                ),
            ],
        ),
    ]

    if analysis.decision is not None:
        sections.append((
            "Fixed-code decision",
            [
                f"Policy: {_single_line(analysis.decision.policy_version)}",
                f"Rule: {_single_line(analysis.decision.rule)}",
                f"Case found: {'yes' if analysis.decision.case_found else 'no'}",
                f"Parties matched: {'yes' if analysis.decision.parties_match else 'no'}",
                "Counted scam signals: "
                + (
                    ", ".join(
                        _single_line(signal_id)
                        for signal_id in analysis.decision.counted_signal_ids[:30]
                    )
                    or "none"
                ),
            ],
        ))

    evidence_lines: list[str] = []
    for item in analysis.evidence[:30]:
        line = f"{_single_line(item.label)} — {_single_line(item.detail, limit=2_000)}"
        source = _single_line(item.source)
        if source:
            line += f" | Source: {source}"
        if _safe_url(item.source_url):
            line += f" | {_single_line(item.source_url, limit=2_000)}"
        if item.quote:
            line += f' | Exact source quote: "{_bounded_text(item.quote)}"'
        evidence_lines.append(line)
    sections.append(("Evidence reviewed", evidence_lines or ["No evidence items were retained."]))

    if analysis.limitations:
        sections.append((
            "Limitations",
            [_single_line(item, limit=2_000) for item in analysis.limitations[:30]],
        ))

    contact = analysis.official_contact
    if contact is not None:
        contact_lines = [
            f"Route status: {_single_line(contact.status)}",
            f"Court: {_single_line(contact.court_name) or 'Not available'}",
            f"Office: {_single_line(contact.office_name) or 'Not available'}",
            f"Purpose: {_single_line(contact.purpose) or 'Not available'}",
            "Office hours: "
            + (
                " ".join(filter(None, [
                    _single_line(contact.office_hours),
                    _single_line(contact.timezone),
                ]))
                or "Not available"
            ),
        ]
        if contact.status == "reviewed_route" and contact.phone:
            contact_lines.append(f"Reviewed phone: {_single_line(contact.phone)}")
        contact_url = _safe_url(contact.official_contact_page)
        if contact_url:
            contact_lines.append(f"Official contact page: {contact_url}")
        if contact.verified_on:
            contact_lines.append(f"Directory reviewed on: {_single_line(contact.verified_on)}")
        if contact.routing_note:
            contact_lines.append(
                f"Routing note: {_single_line(contact.routing_note, limit=2_000)}"
            )
        sections.append(("Official follow-up route", contact_lines))

    sections.append((
        "Next step",
        [
            _single_line(analysis.next_step, limit=2_000),
            "Never use a phone number, email address, or payment link printed on the uploaded letter.",
        ],
    ))
    return sections


def render_analysis_handoff(analysis: AnalysisResponse, filename: str) -> tuple[str, str]:
    """Return escaped HTML and plain text versions of the same evidence handoff."""
    sections = _analysis_sections(analysis, filename)
    text_parts = ["SERVED — EVIDENCE HANDOFF", ""]
    html_parts = [
        '<div style="margin:0;background:#f4f1ea;padding:32px 16px;color:#18181b;'
        'font-family:Arial,sans-serif">',
        '<div style="max-width:680px;margin:0 auto;background:#fff;border:1px solid #d4d4d8;'
        'border-radius:18px;overflow:hidden">',
        '<div style="background:#b42318;color:#fff;padding:24px 28px">',
        '<p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.14em">SERVED</p>',
        '<h1 style="margin:0;font-size:26px;line-height:1.2">Evidence handoff</h1>',
        '</div><div style="padding:12px 28px 28px">',
    ]

    for title, lines in sections:
        text_parts.extend([title.upper(), *[f"- {line}" for line in lines], ""])
        html_parts.append(
            f'<section style="padding:18px 0;border-bottom:1px solid #e4e4e7">'
            f'<h2 style="margin:0 0 10px;font-size:16px">{escape(title)}</h2><ul '
            'style="margin:0;padding-left:20px;color:#3f3f46;line-height:1.55">'
        )
        html_parts.extend(f"<li>{escape(line)}</li>" for line in lines)
        html_parts.append("</ul></section>")

    footer = (
        "Served provides evidence triage and administrative information, not legal advice. "
        "The fixed-code result does not determine legal validity, service, enforceability, or fraud."
    )
    text_parts.extend([footer, "This handoff was sent only to the signed-in account email."])
    html_parts.extend([
        f'<p style="margin:20px 0 4px;color:#71717a;font-size:12px;line-height:1.5">{escape(footer)}</p>',
        '<p style="margin:0;color:#71717a;font-size:12px">This handoff was sent only to the signed-in account email.</p>',
        "</div></div></div>",
    ])
    return "".join(html_parts), "\n".join(text_parts)


async def send_analysis_handoff(
    *,
    analysis_id: str,
    filename: str,
    analysis: AnalysisResponse,
    recipient: str,
) -> EmailDeliveryReceipt:
    """Send one idempotent handoff to the authenticated user's verified email."""
    api_key = settings.resend_api_key.get_secret_value()
    sender = _single_line(settings.resend_from_email)
    if not api_key or not sender:
        raise EmailDeliveryNotConfiguredError("Email delivery is not configured.")

    recipient = _single_line(recipient)
    if not recipient:
        raise EmailDeliveryError("The authenticated account has no verified email.")

    safe_filename = _single_line(filename, limit=255) or "Uploaded document"
    html, text = render_analysis_handoff(analysis, safe_filename)
    payload: dict[str, object] = {
        "from": sender,
        "to": [recipient],
        "subject": f"Served evidence handoff — {safe_filename}",
        "html": html,
        "text": text,
        "tags": [
            {"name": "category", "value": "analysis_handoff"},
            {"name": "verdict", "value": analysis.verdict.value},
        ],
    }
    reply_to = _single_line(settings.resend_reply_to)
    if reply_to:
        payload["reply_to"] = reply_to

    try:
        async with httpx.AsyncClient(timeout=RESEND_TIMEOUT_SECONDS) as client:
            response = await client.post(
                RESEND_EMAILS_URL,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Content-Type": "application/json",
                    "Idempotency-Key": f"served-analysis-handoff-{analysis_id}",
                },
                json=payload,
            )
    except httpx.HTTPError:
        # An httpx exception may retain its request, including Authorization.
        # Do not chain it into application error logs.
        raise EmailDeliveryError("Email provider unavailable.") from None

    if not 200 <= response.status_code < 300:
        raise EmailDeliveryError("Email provider rejected the message.")

    try:
        body = response.json()
        message_id = str(body.get("id") or "") if isinstance(body, dict) else ""
    except (TypeError, ValueError):
        message_id = ""
    if not message_id:
        raise EmailDeliveryError("Email provider returned no delivery identifier.")
    return EmailDeliveryReceipt(message_id=message_id, recipient=recipient)
