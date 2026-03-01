"""
Email Center Service
Handles SMTP sending and IMAP inbox reading for 阿里企业邮箱 (and compatible providers).
"""

import smtplib
import imaplib
import email
import email.header
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders
from datetime import datetime
from typing import Optional, List


def _decode_header(value: str) -> str:
    """Decode an email header that may be encoded."""
    parts = email.header.decode_header(value or "")
    decoded = []
    for part, charset in parts:
        if isinstance(part, bytes):
            decoded.append(part.decode(charset or "utf-8", errors="replace"))
        else:
            decoded.append(part)
    return "".join(decoded)


def _get_body(msg) -> str:
    """Extract plain-text body from an email.Message."""
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            disp = str(part.get("Content-Disposition", ""))
            if ct == "text/plain" and "attachment" not in disp:
                charset = part.get_content_charset() or "utf-8"
                try:
                    body = part.get_payload(decode=True).decode(charset, errors="replace")
                except Exception:
                    body = ""
                break
    else:
        charset = msg.get_content_charset() or "utf-8"
        try:
            body = msg.get_payload(decode=True).decode(charset, errors="replace")
        except Exception:
            body = ""
    return body.strip()


# ─────────────────────────────────────────────
#  SMTP — Send
# ─────────────────────────────────────────────

def send_email(
    *,
    smtp_host: str,
    smtp_port: int,
    email_address: str,
    email_password: str,
    to_address: str,
    subject: str,
    body: str,
    attachments: Optional[List[tuple]] = None,  # list of (filename, content_bytes, mime_type)
) -> None:
    """Send an email via SMTP SSL/TLS, optionally with attachments."""
    msg = MIMEMultipart("mixed")
    msg["From"] = email_address
    msg["To"] = to_address
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    if attachments:
        for filename, file_bytes, mime_type in attachments:
            maintype, subtype = (mime_type or "application/octet-stream").split("/", 1)
            part = MIMEBase(maintype, subtype)
            part.set_payload(file_bytes)
            encoders.encode_base64(part)
            # RFC 5987 encoding for non-ASCII filenames
            try:
                filename.encode("ascii")
                part.add_header("Content-Disposition", "attachment", filename=filename)
            except UnicodeEncodeError:
                part.add_header(
                    "Content-Disposition",
                    f"attachment; filename*=UTF-8''{filename.encode('utf-8').hex()}",
                )
                part.add_header("Content-Disposition", "attachment", filename=("utf-8", "", filename))
            msg.attach(part)

    context = ssl.create_default_context()
    if smtp_port == 465:
        with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=20) as server:
            server.login(email_address, email_password)
            server.sendmail(email_address, [to_address], msg.as_string())
    else:
        with smtplib.SMTP(smtp_host, smtp_port, timeout=20) as server:
            server.ehlo()
            server.starttls(context=context)
            server.login(email_address, email_password)
            server.sendmail(email_address, [to_address], msg.as_string())


# ─────────────────────────────────────────────
#  IMAP — Fetch Inbox
# ─────────────────────────────────────────────

def fetch_inbox(
    *,
    imap_host: str,
    imap_port: int,
    email_address: str,
    email_password: str,
    limit: int = 50,
    folder: str = "INBOX",
) -> list[dict]:
    """
    Fetch the most recent `limit` emails from the specified IMAP folder.
    Returns a list of dicts with: id, from_address, from_name, subject, preview, date, is_read
    """
    context = ssl.create_default_context()
    conn = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=context)
    try:
        conn.login(email_address, email_password)
        conn.select(folder, readonly=True)

        # Search for all messages, newest first
        status, data = conn.search(None, "ALL")
        if status != "OK":
            return []

        msg_ids = data[0].split()
        msg_ids = msg_ids[::-1]  # reverse: newest first
        msg_ids = msg_ids[:limit]

        results = []
        for mid in msg_ids:
            status, msg_data = conn.fetch(mid, "(RFC822 FLAGS)")
            if status != "OK":
                continue
            raw = msg_data[0][1]
            flags = str(msg_data[0][0])
            msg = email.message_from_bytes(raw)

            from_raw = msg.get("From", "")
            from_name, from_addr = email.utils.parseaddr(from_raw)
            from_name = _decode_header(from_name) if from_name else from_addr

            date_str = msg.get("Date", "")
            try:
                parsed_date = email.utils.parsedate_to_datetime(date_str)
                date_iso = parsed_date.strftime("%Y-%m-%d %H:%M")
            except Exception:
                date_iso = date_str[:20] if date_str else ""

            subject = _decode_header(msg.get("Subject", "(No Subject)"))
            body = _get_body(msg)
            preview = body[:150].replace("\n", " ").replace("\r", "") if body else ""

            is_read = "\\Seen" in flags

            results.append({
                "id": mid.decode(),
                "from_address": from_addr,
                "from_name": from_name,
                "subject": subject,
                "preview": preview,
                "body": body,
                "date": date_iso,
                "is_read": is_read,
            })

        return results
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def fetch_email_by_address(
    *,
    imap_host: str,
    imap_port: int,
    email_address: str,
    email_password: str,
    target_address: str,
    limit: int = 30,
) -> list[dict]:
    """
    Fetch emails from a specific sender (used for customer contact history).
    Searches both INBOX and Sent folder.
    """
    context = ssl.create_default_context()
    conn = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=context)
    results = []
    try:
        conn.login(email_address, email_password)

        folders_to_search = [
            ("INBOX", "from"),
        ]
        # Try to find sent folder — varies by provider
        sent_candidates = ["Sent", "Sent Messages", "已发送", "INBOX.Sent"]
        for folder_name in sent_candidates:
            try:
                status, _ = conn.select(folder_name, readonly=True)
                if status == "OK":
                    folders_to_search.append((folder_name, "to"))
                    break
            except Exception:
                pass

        for folder_name, direction in folders_to_search:
            try:
                conn.select(folder_name, readonly=True)
                # Search by address
                search_key = f'FROM "{target_address}"' if direction == "from" else f'TO "{target_address}"'
                status, data = conn.search(None, search_key)
                if status != "OK":
                    continue
                msg_ids = data[0].split()
                msg_ids = msg_ids[::-1][:limit]

                for mid in msg_ids:
                    status2, msg_data = conn.fetch(mid, "(RFC822)")
                    if status2 != "OK":
                        continue
                    raw = msg_data[0][1]
                    msg = email.message_from_bytes(raw)

                    from_raw = msg.get("From", "")
                    _, from_addr = email.utils.parseaddr(from_raw)

                    date_str = msg.get("Date", "")
                    try:
                        parsed_date = email.utils.parsedate_to_datetime(date_str)
                        date_iso = parsed_date.strftime("%Y-%m-%d %H:%M")
                        sort_key = parsed_date.timestamp()
                    except Exception:
                        date_iso = date_str[:20]
                        sort_key = 0

                    subject = _decode_header(msg.get("Subject", "(No Subject)"))
                    body = _get_body(msg)
                    preview = body[:200].replace("\n", " ").replace("\r", "")

                    results.append({
                        "id": mid.decode(),
                        "folder": folder_name,
                        "direction": direction,
                        "from_address": from_addr,
                        "subject": subject,
                        "preview": preview,
                        "body": body,
                        "date": date_iso,
                        "sort_key": sort_key,
                    })
            except Exception:
                continue

        # Sort by date descending
        results.sort(key=lambda x: x.get("sort_key", 0), reverse=True)
        # Remove sort_key from output
        for r in results:
            r.pop("sort_key", None)
        return results[:limit]
    finally:
        try:
            conn.logout()
        except Exception:
            pass


def test_connection(
    *,
    smtp_host: str,
    smtp_port: int,
    imap_host: str,
    imap_port: int,
    email_address: str,
    email_password: str,
) -> dict:
    """Test both SMTP and IMAP connections. Returns {smtp: bool, imap: bool, errors: {}}"""
    result = {"smtp": False, "imap": False, "errors": {}}

    # Test SMTP
    try:
        context = ssl.create_default_context()
        if smtp_port == 465:
            with smtplib.SMTP_SSL(smtp_host, smtp_port, context=context, timeout=10) as s:
                s.login(email_address, email_password)
        else:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=10) as s:
                s.ehlo()
                s.starttls(context=context)
                s.login(email_address, email_password)
        result["smtp"] = True
    except Exception as e:
        result["errors"]["smtp"] = str(e)

    # Test IMAP
    try:
        context = ssl.create_default_context()
        conn = imaplib.IMAP4_SSL(imap_host, imap_port, ssl_context=context)
        conn.login(email_address, email_password)
        conn.logout()
        result["imap"] = True
    except Exception as e:
        result["errors"]["imap"] = str(e)

    return result
