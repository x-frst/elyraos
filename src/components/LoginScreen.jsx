import { useState, useEffect, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Eye, EyeOff, User, Lock, UserPlus, LogIn, UserCheck, Mail, BadgeCheck, X, ScrollText, Check, ShieldCheck } from "lucide-react"
import { useAuthStore } from "../store/useAuthStore"
import { BRANDING } from "../config.js"
import { TERMS_SECTIONS, TERMS_LAST_UPDATED } from "../utils/termsAndConditions"
import { verifyEmailOtp, resendVerifyEmailOtp } from "../utils/db"

function Field({ icon, placeholder, type = "text", value, onChange, autoComplete, autoFocus, rightEl }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
      style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.11)" }}>
      <span className="text-white/35 flex-shrink-0">{icon}</span>
      <input
        className="flex-1 bg-transparent text-white text-[13.5px] outline-none placeholder:text-white/30"
        placeholder={placeholder}
        type={type}
        value={value}
        onChange={onChange}
        autoComplete={autoComplete}
        autoFocus={autoFocus}
      />
      {rightEl}
    </div>
  )
}

export default function LoginScreen() {
  const { login, register, loginWith2fa, completeEmailVerification, loginGuest, adminConfig, fetchAdminConfig, pendingToken } = useAuthStore()

  const [mode, setMode] = useState("login")   // "login" | "register" | "verify-email" | "two-fa"

  // OTP step shared state
  const [otp, setOtp]                 = useState("")
  const [otpError, setOtpError]       = useState("")
  const [otpLoading, setOtpLoading]   = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)   // seconds until next resend
  const cooldownRef = useRef(null)

  // Email to display in the OTP subtitle
  const [otpEmail, setOtpEmail]       = useState("")

  // Login fields
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")

  // Register-only fields
  const [firstName,   setFirstName]   = useState("")
  const [lastName,    setLastName]    = useState("")
  const [email,       setEmail]       = useState("")
  const [regUsername, setRegUsername] = useState("")
  const [regPassword, setRegPassword] = useState("")
  const [confirmPwd,  setConfirmPwd]  = useState("")

  const [showPwd,     setShowPwd]     = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error,       setError]       = useState("")
  const [loading,     setLoading]     = useState(false)

  const [termsAccepted, setTermsAccepted] = useState(false)
  const [tcOpen,        setTcOpen]        = useState(false)

  useEffect(() => { fetchAdminConfig() }, [fetchAdminConfig])

  const clearError = () => setError("")

  // ── Start cooldown timer for OTP resend ─────────────────────────────────
  const startCooldown = (seconds = 60) => {
    setResendCooldown(seconds)
    clearInterval(cooldownRef.current)
    cooldownRef.current = setInterval(() => {
      setResendCooldown(v => {
        if (v <= 1) { clearInterval(cooldownRef.current); return 0 }
        return v - 1
      })
    }, 1000)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError("")

    if (mode === "register") {
      if (!firstName.trim())                    return setError("First name is required")
      if (!lastName.trim())                     return setError("Last name is required")
      if (!email.trim() || !email.includes("@")) return setError("A valid email address is required")
      if (!regUsername.trim())                  return setError("Username is required")
      if (!regPassword)                         return setError("Password is required")
      if (regPassword !== confirmPwd)           return setError("Passwords do not match")
      if (!termsAccepted)                        return setError("You must accept the Terms & Conditions to register")
    }

    setLoading(true)
    let result
    if (mode === "login") {
      result = await login(username, password)
      if (!result.success && result.twoFaPending) {
        setLoading(false)
        setOtp(""); setOtpError("")
        setOtpEmail(username)   // show the username since we don't have email client-side
        setMode("two-fa")
        return
      }
    } else {
      result = await register(regUsername, regPassword, {
        firstName: firstName.trim(),
        lastName:  lastName.trim(),
        email:     email.trim(),
      })
      if (result.success && result.emailVerificationSent) {
        setLoading(false)
        setOtp(""); setOtpError("")
        setOtpEmail(email.trim())
        startCooldown(60)
        setMode("verify-email")
        return
      }
    }
    setLoading(false)
    if (!result.success) setError(result.error)
  }

  const switchMode = (m) => {
    setMode(m); setError("")
    setOtp(""); setOtpError("")
    setUsername(""); setPassword("")
    setFirstName(""); setLastName(""); setEmail("")
    setRegUsername(""); setRegPassword(""); setConfirmPwd("")
    setTermsAccepted(false)
  }

  // ── Handle OTP submit (email verification or 2FA login) ─────────────────
  const handleOtpSubmit = async (e) => {
    e.preventDefault()
    if (!otp.trim() || otp.trim().length !== 6) { setOtpError("Enter the 6-digit code."); return }
    setOtpLoading(true); setOtpError("")
    if (mode === "verify-email") {
      const result = await verifyEmailOtp(otp.trim(), pendingToken)
      setOtpLoading(false)
      if (result.error) { setOtpError(result.error); return }
      completeEmailVerification(result.token, result.user, result.qp)
    } else {
      const result = await loginWith2fa(otp.trim())
      setOtpLoading(false)
      if (!result.success) { setOtpError(result.error || "Invalid code."); return }
    }
  }

  const handleResendOtp = async () => {
    if (resendCooldown > 0) return
    setOtpError("")
    const result = await resendVerifyEmailOtp(pendingToken)
    if (result.error) { setOtpError(result.error); return }
    startCooldown(60)
  }

  const submitDisabled = loading || (mode === "login"
    ? (!username || !password)
    : (!firstName || !lastName || !email || !regUsername || !regPassword || !confirmPwd || !termsAccepted))

  return (
    <div className="fixed inset-0 flex items-center justify-center overflow-hidden select-none"
      style={{
        background: [
          "radial-gradient(ellipse at 15% 85%, rgba(6,182,212,0.38) 0%, transparent 50%)",
          "radial-gradient(ellipse at 85% 10%, rgba(239,68,68,0.28) 0%, transparent 48%)",
          "radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.45) 0%, transparent 65%)",
          "linear-gradient(160deg, #0f0c29 0%, #151030 40%, #0d1b2a 100%)",
        ].join(", "),
      }}>

      {/* Ambient animated orbs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <motion.div animate={{ x: [0, 40, 0], y: [0, -30, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          className="absolute rounded-full"
          style={{ width: 520, height: 520, top: "-12%", left: "-10%",
            background: "radial-gradient(circle, rgba(99,102,241,0.2) 0%, transparent 70%)" }} />
        <motion.div animate={{ x: [0, -30, 0], y: [0, 24, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 3 }}
          className="absolute rounded-full"
          style={{ width: 560, height: 560, bottom: "-14%", right: "-12%",
            background: "radial-gradient(circle, rgba(16,185,129,0.16) 0%, transparent 70%)" }} />
        <motion.div animate={{ x: [0, 18, -8, 0], y: [0, -18, 8, 0] }}
          transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 6 }}
          className="absolute rounded-full"
          style={{ width: 360, height: 360, top: "28%", right: "12%",
            background: "radial-gradient(circle, rgba(245,158,11,0.12) 0%, transparent 70%)" }} />
      </div>

      {/* Card */}
      <motion.div
        key={mode}
        initial={{ opacity: 0, y: 28, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 26 }}
        className="relative rounded-3xl overflow-hidden"
        style={{
          width: mode === "register" ? 430 : 380,
          background: "rgba(10,10,22,0.78)",
          backdropFilter: "blur(48px) saturate(200%)",
          WebkitBackdropFilter: "blur(48px) saturate(200%)",
          border: "1px solid rgba(255,255,255,0.12)",
          boxShadow: "0 40px 100px rgba(0,0,0,0.6), 0 0 0 0.5px rgba(255,255,255,0.07), inset 0 1px 0 rgba(255,255,255,0.09)",
        }}
      >
        {/* Top accent stripe */}
        <div className="absolute top-0 left-0 right-0 h-px"
          style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.8), rgba(6,182,212,0.6), transparent)" }} />

        {/* Header */}
        <div className="px-8 pt-8 pb-5 text-center">
          <motion.div
            animate={{ rotate: [0, 5, -5, 0] }}
            transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
            className="mb-3 inline-block" role="img" aria-label={BRANDING.name}>
            {BRANDING.logoUrl
              ? <img src={BRANDING.transparentLogoUrl} alt={BRANDING.name} className="w-14 h-14 object-contain" />
              : <span className="text-5xl">{BRANDING.logoEmoji}</span>}
          </motion.div>
          <div className="text-[22px] font-bold text-white tracking-tight mb-1">{BRANDING.name}</div>
          <div className="text-white/40 text-[13px]">
            {mode === "login"         ? "Sign in to continue"
           : mode === "register"      ? "Create your account"
           : mode === "verify-email" ? "Verify your email"
                                      : "Two-factor authentication"}
          </div>
        </div>

        {/* Form — login + register modes */}
        {(mode === "login" || mode === "register") && (
        <form onSubmit={handleSubmit} className="px-8 pb-5">
          <AnimatePresence mode="wait">
            {mode === "login" ? (
              <motion.div key="login"
                initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 16 }} transition={{ duration: 0.18 }}
                className="flex flex-col gap-3">
                <Field icon={<User size={15} />} placeholder="Username"
                  value={username} onChange={e => { setUsername(e.target.value); clearError() }}
                  autoComplete="username" autoFocus />
                <Field icon={<Lock size={15} />} placeholder="Password"
                  type={showPwd ? "text" : "password"} value={password}
                  onChange={e => { setPassword(e.target.value); clearError() }}
                  autoComplete="current-password"
                  rightEl={
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0">
                      {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  } />
              </motion.div>
            ) : (
              <motion.div key="register"
                initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.18 }}
                className="flex flex-col gap-2.5">
                {/* Name row */}
                <div className="grid grid-cols-2 gap-2.5">
                  <Field icon={<User size={14} />} placeholder="First name"
                    value={firstName} onChange={e => { setFirstName(e.target.value); clearError() }}
                    autoComplete="given-name" autoFocus />
                  <Field icon={<User size={14} />} placeholder="Last name"
                    value={lastName} onChange={e => { setLastName(e.target.value); clearError() }}
                    autoComplete="family-name" />
                </div>
                <Field icon={<Mail size={14} />} placeholder="Email address" type="email"
                  value={email} onChange={e => { setEmail(e.target.value); clearError() }}
                  autoComplete="email" />
                <Field icon={<BadgeCheck size={14} />} placeholder="Username"
                  value={regUsername} onChange={e => { setRegUsername(e.target.value); clearError() }}
                  autoComplete="username" />
                <Field icon={<Lock size={14} />} placeholder="Password"
                  type={showPwd ? "text" : "password"} value={regPassword}
                  onChange={e => { setRegPassword(e.target.value); clearError() }}
                  autoComplete="new-password"
                  rightEl={
                    <button type="button" onClick={() => setShowPwd(v => !v)}
                      className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0">
                      {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  } />
                <Field icon={<Lock size={14} />} placeholder="Confirm password"
                  type={showConfirm ? "text" : "password"} value={confirmPwd}
                  onChange={e => { setConfirmPwd(e.target.value); clearError() }}
                  autoComplete="new-password"
                  rightEl={
                    <button type="button" onClick={() => setShowConfirm(v => !v)}
                      className="text-white/30 hover:text-white/60 transition-colors flex-shrink-0">
                      {showConfirm ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  } />

                {/* Terms & Conditions checkbox */}
                <div className="flex items-center gap-2.5 mt-0.5">
                  <button
                    type="button"
                    onClick={() => setTermsAccepted(v => !v)}
                    aria-label="Accept Terms & Conditions"
                    className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-all ${
                      termsAccepted
                        ? 'bg-violet-500 border-violet-500'
                        : 'border-white/30 hover:border-white/50'
                    }`}
                  >
                    {termsAccepted && <Check size={10} className="text-white" strokeWidth={3} />}
                  </button>
                  <span className="text-white/55 text-[12px] leading-tight">
                    I agree to the{" "}
                    <button
                      type="button"
                      onClick={() => setTcOpen(true)}
                      className="text-violet-400 hover:text-violet-300 underline underline-offset-2 transition-colors"
                    >
                      Terms &amp; Conditions
                    </button>
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Error */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                className="text-red-400 text-[12px] mt-3 text-center px-2">
                {error}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Submit */}
          <button type="submit" disabled={submitDisabled}
            className="w-full mt-4 py-2.5 rounded-xl text-white font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 hover:brightness-110 active:scale-[0.98]"
            style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))", boxShadow: "0 4px 20px rgba(99,102,241,0.35)" }}>
            {loading
              ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
              : mode === "login"
                ? <><LogIn size={15} /> Sign In</>
                : <><UserPlus size={15} /> Create Account</>}
          </button>
        </form>
        )}

        {/* OTP step — email verification + 2FA login */}
        {(mode === "verify-email" || mode === "two-fa") && (
          <form onSubmit={handleOtpSubmit} className="px-8 pb-5">
            <div className="flex flex-col gap-3">
              {/* Info banner */}
              <div className="rounded-xl px-4 py-3 text-[12px] leading-relaxed"
                style={{ background: 'rgba(99,102,241,0.1)', border: '1px solid rgba(99,102,241,0.25)', color: 'rgba(196,181,253,0.85)' }}>
                <ShieldCheck size={13} className="inline mr-1.5 -mt-0.5" />
                {mode === "verify-email"
                  ? <>A 6-digit code was sent to <strong>{otpEmail}</strong>. Enter it below to verify your email.<br/><span className="text-white/35">Check your spam folder if you don't see it.</span></>
                  : <>A 6-digit code was sent to the email on your account. Enter it below to sign in.</>}
              </div>
              {/* OTP input */}
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.07)', border: `1px solid ${otpError ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.11)'}` }}>
                <span className="text-white/35 flex-shrink-0"><ShieldCheck size={15} /></span>
                <input
                  className="flex-1 bg-transparent text-white text-[20px] tracking-[0.3em] text-center outline-none placeholder:text-white/20 placeholder:tracking-normal placeholder:text-[13px]"
                  placeholder="6-digit code"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={6}
                  value={otp}
                  onChange={e => { setOtp(e.target.value.replace(/\D/g, '')); setOtpError('') }}
                  autoFocus
                  autoComplete="one-time-code"
                />
              </div>
              {otpError && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="text-red-400 text-[12px] text-center">{otpError}</motion.div>
              )}
              <button type="submit"
                disabled={otpLoading || otp.length !== 6}
                className="w-full py-2.5 rounded-xl text-white font-semibold text-[14px] flex items-center justify-center gap-2 transition-all disabled:opacity-40 hover:brightness-110 active:scale-[0.98]"
                style={{ background: 'linear-gradient(135deg,rgba(99,102,241,0.9),rgba(139,92,246,0.9))', boxShadow: '0 4px 20px rgba(99,102,241,0.35)' }}>
                {otpLoading
                  ? <div className="w-4 h-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                  : <><ShieldCheck size={15} /> {mode === "verify-email" ? "Verify Email" : "Confirm Sign In"}</>}
              </button>
              {/* Resend (only for email verification) */}
              {mode === "verify-email" && (
                <button type="button"
                  disabled={resendCooldown > 0}
                  onClick={handleResendOtp}
                  className="text-[12px] text-center text-white/35 hover:text-white/60 disabled:opacity-40 transition-colors">
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : "Resend code"}
                </button>
              )}
              {/* Back link */}
              <button type="button"
                onClick={() => switchMode("login")}
                className="text-[12px] text-center text-white/35 hover:text-white/60 transition-colors">
                &larr; Back to sign in
              </button>
            </div>
          </form>
        )}

        {/* Footer — only shown on login/register modes */}
        {(mode === "login" || mode === "register") && (
        <div className="px-8 pb-7 flex flex-col gap-2.5">
          {adminConfig.allowSignup && (
            <button onClick={() => switchMode(mode === "login" ? "register" : "login")}
              className="w-full text-center text-white/45 text-[13px] hover:text-white/75 transition-colors">
              {mode === "login" ? "Don't have an account? Sign up" : "Already have an account? Sign in"}
            </button>
          )}
          {adminConfig.allowGuest && (
            <button onClick={() => loginGuest()}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-xl text-white/45 text-[13px] hover:text-white/75 hover:bg-white/5 transition-all">
              <UserCheck size={14} />
              Continue as Guest
            </button>
          )}
        </div>
        )}
      </motion.div>

      {/* ── Terms & Conditions Modal ── */}
      <AnimatePresence>
        {tcOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
            style={{ background: "rgba(0,0,0,0.75)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)" }}
            onClick={e => { if (e.target === e.currentTarget) setTcOpen(false) }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: "spring", stiffness: 300, damping: 28 }}
              className="relative rounded-2xl overflow-hidden flex flex-col"
              style={{
                width: "min(700px, 95vw)",
                maxHeight: "82vh",
                background: "rgba(10,8,24,0.97)",
                border: "1px solid rgba(255,255,255,0.12)",
                boxShadow: "0 40px 100px rgba(0,0,0,0.8), 0 0 0 0.5px rgba(255,255,255,0.05)",
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Top accent stripe */}
              <div className="absolute top-0 left-0 right-0 h-px"
                style={{ background: "linear-gradient(90deg, transparent, rgba(139,92,246,0.8), rgba(6,182,212,0.6), transparent)" }} />

              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 flex-shrink-0">
                <div className="flex items-center gap-2.5">
                  <ScrollText size={16} className="text-violet-400" />
                  <span className="text-white font-semibold text-[15px]">{BRANDING.name} — Terms &amp; Conditions</span>
                </div>
                <button
                  onClick={() => setTcOpen(false)}
                  className="text-white/40 hover:text-white/80 transition-colors p-1 rounded-lg hover:bg-white/10"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Last updated badge */}
              <div className="px-6 py-2.5 border-b border-white/[0.06] flex-shrink-0">
                <span className="text-[11px] text-white/30">Last updated: {TERMS_LAST_UPDATED}</span>
              </div>

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6 scrollbar-thin">
                {TERMS_SECTIONS.map(section => (
                  <div key={section.id}>
                    <h3 className="text-white/90 font-semibold text-[13px] mb-2.5 tracking-tight">{section.title}</h3>
                    {section.paragraphs?.map((p, i) => (
                      <p key={i} className="text-white/50 text-[12.5px] leading-relaxed mb-2">{p}</p>
                    ))}
                    {section.items?.length > 0 && (
                      <ul className="space-y-1.5 mb-2">
                        {section.items.map((item, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-violet-400/60 text-[11px] flex-shrink-0 mt-[3px]">◆</span>
                            <span className="text-white/50 text-[12.5px] leading-relaxed">{item}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {section.closing && (
                      <p className="text-white/50 text-[12.5px] leading-relaxed mt-2 pl-4 border-l-2 border-violet-500/30 italic">
                        {section.closing}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-white/10 flex items-center justify-between flex-shrink-0">
                <span className="text-white/25 text-[11px]">
                  By clicking "I Agree" you accept all terms above.
                </span>
                <div className="flex gap-2.5">
                  <button
                    onClick={() => setTcOpen(false)}
                    className="px-4 py-2 rounded-xl text-white/50 text-[13px] hover:text-white/80 hover:bg-white/5 transition-all"
                  >
                    Close
                  </button>
                  <button
                    onClick={() => { setTermsAccepted(true); setTcOpen(false) }}
                    className="px-5 py-2 rounded-xl text-white text-[13px] font-semibold transition-all hover:brightness-110 active:scale-[0.98]"
                    style={{ background: "linear-gradient(135deg, rgba(99,102,241,0.9), rgba(139,92,246,0.9))", boxShadow: "0 4px 16px rgba(99,102,241,0.35)" }}
                  >
                    I Agree
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
