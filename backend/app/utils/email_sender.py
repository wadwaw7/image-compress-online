from __future__ import annotations

import os
import smtplib
import traceback
from email.header import Header
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart


class EmailSendError(RuntimeError):
    pass


def _get_env(name: str, default: str = "") -> str:
    return (os.getenv(name, default) or "").strip()


def send_email(to_email: str, subject: str, html_body: str) -> None:
    """发送邮件（支持多种发信方式 + 故障切换）

    - EMAIL_PROVIDER=smtp：优先 SMTP，失败后自动 fallback 到 SendGrid（若配置了 SENDGRID_API_KEY / SENDGRID_FROM）
    - EMAIL_PROVIDER=sendgrid：仅用 SendGrid
    """

    provider = _get_env("EMAIL_PROVIDER", "smtp").lower()

    if provider == "sendgrid":
        return _send_sendgrid(to_email, subject, html_body)

    try:
        return _send_smtp(to_email, subject, html_body)
    except EmailSendError as e:
        print("[email] SMTP failed, trying SendGrid fallback...")
        print("[email] SMTP error:", str(e))
        traceback.print_exc()

        api_key = _get_env("SENDGRID_API_KEY")
        mail_from = _get_env("SENDGRID_FROM")
        if api_key and mail_from:
            try:
                return _send_sendgrid(to_email, subject, html_body)
            except EmailSendError as e2:
                print("[email] SendGrid fallback failed:", str(e2))
                traceback.print_exc()
                raise
        raise


def _send_smtp(to_email: str, subject: str, html_body: str) -> None:
    host = _get_env("SMTP_HOST")
    port = int(_get_env("SMTP_PORT", "587") or 587)
    user = _get_env("SMTP_USER")
    password = _get_env("SMTP_PASS")
    mail_from = _get_env("SMTP_FROM", user)
    use_tls = _get_env("SMTP_TLS", "1") in ("1", "true", "yes")
    use_ssl = _get_env("SMTP_SSL", "0") in ("1", "true", "yes")

    if not host or not user or not password:
        raise EmailSendError("SMTP 未配置：请设置 SMTP_HOST/SMTP_USER/SMTP_PASS")

    msg = MIMEMultipart("alternative")
    msg["Subject"] = Header(subject, 'utf-8')
    msg["From"] = mail_from
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    server = None
    try:
        if use_ssl:
            server = smtplib.SMTP_SSL(host, port, timeout=20)
        else:
            server = smtplib.SMTP(host, port, timeout=20)

        server.ehlo()
        if use_tls and not use_ssl:
            server.starttls()
            server.ehlo()
        server.login(user, password)
        server.sendmail(mail_from, [to_email], msg.as_string())
    except Exception as e:
        raise EmailSendError(f"SMTP 发送失败：{e}")
    finally:
        if server:
            try:
                # QQ SMTP 在 QUIT 时可能返回非标准响应，导致误报异常
                # 邮件已发送成功，此处仅尝试关闭连接，忽略可能的异常
                server.quit()
            except smtplib.SMTPResponseException:
                pass
            except Exception:
                pass


def _send_sendgrid(to_email: str, subject: str, html_body: str) -> None:
    api_key = _get_env("SENDGRID_API_KEY")
    mail_from = _get_env("SENDGRID_FROM")
    if not api_key or not mail_from:
        raise EmailSendError("SendGrid 未配置：请设置 SENDGRID_API_KEY 与 SENDGRID_FROM")

    import json
    import urllib.request

    payload = {
        "personalizations": [{"to": [{"email": to_email}]}],
        "from": {"email": mail_from},
        "subject": subject,
        "content": [{"type": "text/html", "value": html_body}],
    }

    req = urllib.request.Request(
        "https://api.sendgrid.com/v3/mail/send",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json; charset=utf-8",
        },
        method="POST",
    )

    try:
        resp = urllib.request.urlopen(req, timeout=20)
        if getattr(resp, "status", 0) not in (200, 202):
            body = resp.read().decode("utf-8", errors="ignore")
            raise EmailSendError(f"SendGrid 响应异常：{getattr(resp, 'status', 0)} {body}")
    except Exception as e:
        raise EmailSendError(f"SendGrid 发送失败：{e}")
