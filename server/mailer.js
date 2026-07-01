/**
 * Elyra — Mailer
 * Thin wrapper around nodemailer for sending OTP emails.
 * If SMTP_USER / SMTP_PASS are not set, OTPs are logged to the server console
 * instead of being emailed — useful during development.
 */

import nodemailer   from 'nodemailer'
import { SMTP, OTP_EXPIRY_MINUTES, OWNER_EMAIL } from './config.js'
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
  verify_email:   `Verify your email — ${BRANDING.name}`,
  enable_2fa:     `Enable two-factor authentication — ${BRANDING.name}`,
  disable_2fa:    `Disable two-factor authentication — ${BRANDING.name}`,
  login_2fa:      `Your sign-in code — ${BRANDING.name}`,
  password_reset: `Reset your password — ${BRANDING.name}`,
}

const PURPOSE_LABEL = {
  verify_email:   'verify your email address',
  enable_2fa:     'enable two-factor authentication',
  disable_2fa:    'disable two-factor authentication',
  login_2fa:      'complete your sign-in',
  password_reset: 'reset your password',
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

/**
 * Send a security notification after a successful password change via the
 * "forgot password" flow. Falls back to console.log when SMTP is not configured.
 *
 * @param {{ to: string, supportEmail: string }} opts
 */
export async function sendPasswordChangedEmail({ to, supportEmail }) {
  const subject = `Your ${BRANDING.name} password was changed`

  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mailer] SMTP not configured — password-changed notice for ${to}`)
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
        <tr><td style="padding:40px 40px 24px;text-align:center">
          ${BRANDING.transparentLogoUrl
            ? `<img src="${BRANDING.website}${BRANDING.transparentLogoUrl}" alt="${BRANDING.name}" width="56" height="56" style="display:block;margin:0 auto 14px;border-radius:12px">`
            : `<div style="font-size:40px;line-height:1;margin-bottom:14px">${BRANDING.logoEmoji}</div>`}
          <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;margin-bottom:8px">${BRANDING.name}</div>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:0 40px 36px;text-align:center">
          <div style="font-size:18px;font-weight:700;color:#ffffff;margin-bottom:12px">Your password has been changed</div>
          <div style="font-size:13px;color:rgba(255,255,255,0.55);line-height:1.7;margin-bottom:28px">
            The password for your <strong style="color:rgba(255,255,255,0.75)">${BRANDING.name}</strong> account was successfully updated.<br>
            If you made this change, no further action is needed.
          </div>

          <!-- Warning box -->
          <div style="background:rgba(239,68,68,0.1);border:1px solid rgba(239,68,68,0.3);border-radius:12px;padding:16px 20px;text-align:left">
            <div style="font-size:12px;font-weight:700;color:#fca5a5;margin-bottom:6px">&#9888;&#65039; Wasn't you?</div>
            <div style="font-size:12px;color:rgba(255,255,255,0.5);line-height:1.7">
              If you did <strong style="color:rgba(255,255,255,0.7)">not</strong> make this change, your account may be compromised.
              Please contact our support team immediately at
              <a href="mailto:${supportEmail}" style="color:#f87171;text-decoration:none">${supportEmail}</a>.
            </div>
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

// ── App Report ────────────────────────────────────────────────────────────────

const REPORT_CATEGORY_LABELS = {
  app_not_working:  'App Not Working',
  needs_update:     'App Needs an Update',
  broken_link:      'Broken / Dead Link',
  removal_request:  'App Removal Request',
  inappropriate:    'Inappropriate Content',
  copyright:        'Copyright Violation',
  security:         'Security / Privacy Concern',
  spam_misleading:  'Spam or Misleading',
  feature_request:  'Feature Request',
  duplicate:        'Duplicate App',
  other:            'Other',
}

/**
 * Send an app report notification to the platform owner (OWNER_EMAIL).
 *
 * @param {{
 *   reporterName: string,
 *   reporterUsername: string,
 *   reporterEmail: string,
 *   appTitle: string,
 *   appUrl?: string,
 *   category: string,
 *   description: string,
 *   attachment?: { name: string, type: string, data: string } | null,
 * }} opts
 */
export async function sendAppReportEmail({
  reporterName,
  reporterUsername,
  reporterEmail,
  appTitle,
  appUrl,
  category,
  description,
  attachment,
}) {
  const categoryLabel = REPORT_CATEGORY_LABELS[category] || category
  const subject = `[App Report] ${categoryLabel} — ${appTitle}`

  if (!isSmtpConfigured()) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[mailer] SMTP not configured — app report from ${reporterEmail} for "${appTitle}" (${categoryLabel})`)
      return
    }
    throw new Error('SMTP is not configured.')
  }

  if (!OWNER_EMAIL) {
    console.warn('[mailer] OWNER_EMAIL not set — cannot deliver app report.')
    return
  }

  const from = SMTP.from || `"${BRANDING.name}" <${SMTP.user}>`
  const year = new Date().getFullYear()
  const descHtml = description
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\n/g, '<br>')
  const appUrlRow = appUrl
    ? `<tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06)"><span style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px">App URL</span><br><a href="${appUrl}" style="font-size:13px;color:#818cf8;text-decoration:none">${appUrl}</a></td></tr>`
    : ''

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0f0c29;font-family:system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="padding:48px 20px">
    <tr><td align="center">
      <table width="520" cellpadding="0" cellspacing="0" role="presentation"
        style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:20px;overflow:hidden;max-width:520px">

        <!-- Top accent -->
        <tr><td style="height:3px;background:linear-gradient(90deg,#ef4444,#f97316,#eab308)"></td></tr>

        <!-- Header -->
        <tr><td style="padding:36px 40px 20px">
          <div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.4);letter-spacing:1px;text-transform:uppercase;margin-bottom:8px">App Report — ${BRANDING.name}</div>
          <div style="font-size:22px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;margin-bottom:8px">${appTitle}</div>
          <div style="display:inline-block;background:rgba(239,68,68,0.15);border:1px solid rgba(239,68,68,0.35);border-radius:6px;padding:3px 10px;font-size:12px;color:#fca5a5;font-weight:600">${categoryLabel}</div>
        </td></tr>

        <!-- Reporter info -->
        <tr><td style="padding:0 40px 24px">
          <table width="100%" cellpadding="0" cellspacing="0">
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
              <span style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px">Reported by</span><br>
              <span style="font-size:13px;color:rgba(255,255,255,0.85)">${reporterName} (@${reporterUsername})</span>
            </td></tr>
            <tr><td style="padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.06)">
              <span style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px">Reporter Email</span><br>
              <a href="mailto:${reporterEmail}" style="font-size:13px;color:#818cf8;text-decoration:none">${reporterEmail}</a>
            </td></tr>
            ${appUrlRow}
          </table>
        </td></tr>

        <!-- Description -->
        <tr><td style="padding:0 40px 28px">
          <div style="font-size:11px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:10px">Description</div>
          <div style="background:rgba(255,255,255,0.03);border:1px solid rgba(255,255,255,0.08);border-radius:10px;padding:16px;font-size:13px;color:rgba(255,255,255,0.75);line-height:1.75">${descHtml}</div>
        </td></tr>

        ${attachment ? `<tr><td style="padding:0 40px 28px">
          <div style="background:rgba(99,102,241,0.08);border:1px solid rgba(99,102,241,0.2);border-radius:8px;padding:12px 16px;font-size:12px;color:rgba(255,255,255,0.55)">
            &#128206; Attachment included: <strong style="color:rgba(255,255,255,0.7)">${attachment.name}</strong>
          </div>
        </td></tr>` : ''}

        <!-- Footer -->
        <tr><td style="padding:20px 40px;border-top:1px solid rgba(255,255,255,0.07);text-align:center">
          <div style="font-size:11px;color:rgba(255,255,255,0.2)">&copy; ${year} ${BRANDING.name} &mdash; App Center Report</div>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`

  const mailOptions = { from, to: OWNER_EMAIL, subject, html }

  if (attachment?.data && attachment.name && attachment.type) {
    mailOptions.attachments = [{
      filename:    attachment.name,
      content:     attachment.data,
      encoding:    'base64',
      contentType: attachment.type,
    }]
  }

  await getTransport().sendMail(mailOptions)
}