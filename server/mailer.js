/**
 * Elyra — Mailer
 * Thin wrapper around nodemailer for sending OTP emails.
 * If SMTP_USER / SMTP_PASS are not set, OTPs are logged to the server console
 * instead of being emailed — useful during development.
 */

import nodemailer   from 'nodemailer'
import { SMTP, OTP_EXPIRY_MINUTES } from './config.js'
import { BRANDING } from '../src/config.js'

// Lazily created so startup doesn't fail when SMTP is not configured
let _transport = null

function getTransport() {
  if (!_transport) {
    _transport = nodemailer.createTransport({
      host:   SMTP.host,
      port:   SMTP.port,
      secure: SMTP.secure,
      auth:   { user: SMTP.user, pass: SMTP.pass },
    })
  }
  return _transport
}

/** Returns true if SMTP credentials are present in config. */
export function isSmtpConfigured() {
  return Boolean(SMTP.user && SMTP.pass)
}

const PURPOSE_SUBJECT = {
  verify_email: `Verify your email — ${BRANDING.name}`,
  enable_2fa:   `Enable two-factor authentication — ${BRANDING.name}`,
  disable_2fa:  `Disable two-factor authentication — ${BRANDING.name}`,
  login_2fa:    `Your sign-in code — ${BRANDING.name}`,
}

const PURPOSE_LABEL = {
  verify_email: 'verify your email address',
  enable_2fa:   'enable two-factor authentication',
  disable_2fa:  'disable two-factor authentication',
  login_2fa:    'complete your sign-in',
}

/**
 * Send a 6-digit OTP email.
 * Falls back to console.log when SMTP is not configured.
 *
 * @param {{ to: string, otp: string, purpose: string }} opts
 */
export async function sendOtpEmail({ to, otp, purpose }) {
  const label   = PURPOSE_LABEL[purpose]   || 'verify your identity'
  const subject = PURPOSE_SUBJECT[purpose] || `Your ${BRANDING.name} code`

  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mailer] SMTP not configured — OTP for ${to} (${purpose}): ${otp}`)
      return
    }
    throw new Error('SMTP is not configured.')
  }

  const from = SMTP.from || `"${BRANDING.name}" <${SMTP.user}>`

  const year = new Date().getFullYear()
  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0c29;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:48px 20px">
    <tr><td align="center">
      <table width="460" cellpadding="0" cellspacing="0" role="presentation"
        style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:20px;overflow:hidden;max-width:460px">

        <!-- Top accent -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#6366f1,#8b5cf6,#06b6d4)"></td></tr>

        <!-- Header -->
        <tr><td style="padding:40px 40px 28px;text-align:center">
          ${BRANDING.transparentLogoUrl
            ? `<img src="${BRANDING.website}${BRANDING.transparentLogoUrl}" alt="${BRANDING.name}" width="56" height="56" style="display:block;margin:0 auto 14px;border-radius:12px">`
            : `<div style="font-size:40px;line-height:1;margin-bottom:14px">${BRANDING.logoEmoji}</div>`}
          <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;margin-bottom:8px">${BRANDING.name}</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.45)">Use the code below to ${label}</div>
        </td></tr>

        <!-- OTP block -->
        <tr><td style="padding:0 40px 36px;text-align:center">
          <div style="background:rgba(139,92,246,0.15);border:1px solid rgba(139,92,246,0.35);
                      border-radius:16px;padding:28px 0;margin-bottom:24px">
            <div style="font-size:46px;font-weight:800;letter-spacing:12px;
                        color:#c4b5fd;font-family:'Courier New',Courier,monospace;
                        line-height:1">${otp}</div>
          </div>
          <div style="font-size:12px;color:rgba(255,255,255,0.3);line-height:1.7">
            This code expires in&nbsp;<strong style="color:rgba(255,255,255,0.5)">${OTP_EXPIRY_MINUTES}&nbsp;minutes</strong>.<br>
            If you didn't request this, you can safely ignore this email.
          </div>
        </td></tr>

        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.07);text-align:center">
          <div style="font-size:11px;color:rgba(255,255,255,0.2)">&copy; ${year} ${BRANDING.name}. All rights reserved.</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  await getTransport().sendMail({ from, to, subject, html })
}
