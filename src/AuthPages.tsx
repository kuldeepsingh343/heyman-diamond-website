import './AuthPages.css'
import { useState } from 'react'
import type { FormEvent } from 'react'

type Mode = 'signup-customer' | 'signup-dealer' | 'signin'

function getInitialStatus(): { text: string; kind: 'info' | 'error' | 'success' } {
  if (typeof window !== 'undefined' && window.location.hash.includes('access_token=')) {
    const params = new URLSearchParams(window.location.hash.slice(1))
    const accessToken = params.get('access_token')
    const refreshToken = params.get('refresh_token')
    if (accessToken && params.get('type') === 'signup') {
      localStorage.setItem('hmd_access_token', accessToken)
      if (refreshToken) localStorage.setItem('hmd_refresh_token', refreshToken)
      window.history.replaceState(null, '', window.location.pathname + '#signin')
      return { text: 'Your email has been confirmed successfully. You can now sign in to your account.', kind: 'success' }
    }
  }
  return { text: '', kind: 'info' }
}

export default function AuthPages({ mode }: { mode: string }) {
  const current = (['signup-customer', 'signup-dealer', 'signin'].includes(mode) ? mode : 'signin') as Mode
  const dealer = current === 'signup-dealer'
  const signup = current !== 'signin'

  // ── form state ──────────────────────────────────────────────────────────
  const [fullName, setFullName] = useState('')
  const [address, setAddress] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [gender, setGender] = useState('prefer_not_to_say')
  const [companyName, setCompanyName] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // ── async / UX state ────────────────────────────────────────────────────
  const [status, setStatus] = useState<{ text: string; kind: 'info' | 'error' | 'success' }>(getInitialStatus)
  const [busy, setBusy] = useState(false)
  const [resendBusy, setResendBusy] = useState(false)
  const [canResend, setCanResend] = useState(false)

  // ── client-side validation ───────────────────────────────────────────────
  function validate(): string | null {
    if (signup) {
      if (!fullName.trim() || fullName.trim().length < 2)
        return 'Please enter your full name (at least 2 characters).'
      if (!address.trim() || address.trim().length < 5)
        return 'Please enter a valid address.'
      if (!phone.trim() || phone.trim().length < 6)
        return 'Please enter a valid phone number.'
      if (dealer && (!companyName.trim() || companyName.trim().length < 2))
        return 'Please enter your company name.'
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
      return 'Please enter a valid email address.'
    if (password.length < 10)
      return 'Password must be at least 10 characters long.'
    return null
  }

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setStatus({ text: '', kind: 'info' })

    const validationError = validate()
    if (validationError) {
      setStatus({ text: validationError, kind: 'error' })
      return
    }

    setBusy(true)
    try {
      const endpoint = signup ? '/api/auth/signup' : '/api/auth/signin'
      const body = signup
        ? { fullName: fullName.trim(), address: address.trim(), phone: phone.trim(), email: email.trim(), gender, password, companyName: companyName.trim(), accountType: dealer ? 'dealer' : 'customer' }
        : { email: email.trim(), password }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Something went wrong. Please try again.')

      if (!signup && data.accessToken) {
        localStorage.setItem('hmd_access_token', data.accessToken)
        localStorage.setItem('hmd_refresh_token', data.refreshToken || '')
        const msg = (data.user?.account_type === 'dealer' && data.user?.dealer_status !== 'approved')
          ? 'Signed in. Your dealer access is still awaiting administrator approval.'
          : 'You are signed in successfully.'
        setStatus({ text: msg, kind: 'success' })
      } else {
        setStatus({ text: data.message || 'Request received.', kind: 'success' })
        setCanResend(true)
      }
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : 'Something went wrong.', kind: 'error' })
    } finally {
      setBusy(false)
    }
  }

  async function resendConfirmation() {
    if (!email.trim()) {
      setStatus({ text: 'Please enter your email address before resending.', kind: 'error' })
      return
    }
    setResendBusy(true)
    setStatus({ text: '', kind: 'info' })
    try {
      const response = await fetch('/api/auth/resend-confirmation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to request a new confirmation email.')
      setStatus({ text: data.message || 'If confirmation is still required, a new email has been requested.', kind: 'success' })
    } catch (error) {
      setStatus({ text: error instanceof Error ? error.message : 'Unable to request a new confirmation email.', kind: 'error' })
    } finally {
      setResendBusy(false)
    }
  }

  const statusClass = `auth-status auth-status--${status.kind}`

  return (
    <main className="auth-page">
      <header className="auth-header">
        <a href="#home">
          <img src="/heyman-diamond-logo.png" alt="Hey Man Diamond LLC" />
        </a>
        <a href="#home">← Back to website</a>
      </header>

      <section className="auth-card">
        <span className="auth-eyebrow">HEY MAN DIAMOND LLC · SECURE ACCOUNT</span>
        <h1>
          {signup
            ? (dealer ? 'Dealer account request' : 'Create your account')
            : 'Welcome back'}
        </h1>
        <p>
          {signup
            ? (dealer
              ? 'Create your dealer account with basic business details. Access will be activated after admin approval.'
              : 'Create an account to make your diamond experience more personal.')
            : 'Sign in with the email and password you registered with.'}
        </p>

        <form onSubmit={submit} noValidate>
          {signup && (
            <>
              <label>
                Full name
                <input
                  value={fullName}
                  onChange={e => setFullName(e.target.value)}
                  autoComplete="name"
                  required
                  maxLength={120}
                  placeholder="Your full name"
                />
              </label>
              <label>
                Address
                <input
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  autoComplete="street-address"
                  required
                  maxLength={500}
                  placeholder="Your shipping / billing address"
                />
              </label>
              <label>
                Mobile number
                <input
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  type="tel"
                  autoComplete="tel"
                  required
                  maxLength={40}
                  placeholder="+1 (555) 000-0000"
                />
              </label>
              <label>
                Gender
                <select value={gender} onChange={e => setGender(e.target.value)}>
                  <option value="prefer_not_to_say">Prefer not to say</option>
                  <option value="female">Female</option>
                  <option value="male">Male</option>
                  <option value="non_binary">Non-binary</option>
                </select>
              </label>
              {dealer && (
                <label>
                  Company name
                  <input
                    value={companyName}
                    onChange={e => setCompanyName(e.target.value)}
                    autoComplete="organization"
                    required
                    maxLength={160}
                    placeholder="Your registered business name"
                  />
                </label>
              )}
            </>
          )}

          <label>
            Email address
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              required
              maxLength={254}
              placeholder="you@example.com"
            />
          </label>

          <label>
            Password {signup && <span style={{ fontWeight: 400, opacity: 0.7 }}>(min. 10 characters)</span>}
            <div style={{ position: 'relative' }}>
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={e => setPassword(e.target.value)}
                autoComplete={signup ? 'new-password' : 'current-password'}
                minLength={10}
                required
                maxLength={128}
                placeholder="••••••••••"
                style={{ paddingRight: '48px' }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(v => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                style={{
                  position: 'absolute',
                  right: '12px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  fontSize: '13px',
                  color: '#77746b',
                  padding: '4px',
                }}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </label>

          <button type="submit" disabled={busy}>
            {busy ? 'Please wait…' : signup ? 'Create account' : 'Sign in'}
          </button>
        </form>

        {status.text && (
          <p className={statusClass} role="status" aria-live="polite">
            {status.text}
          </p>
        )}

        {canResend && (
          <button
            type="button"
            className="auth-resend"
            onClick={resendConfirmation}
            disabled={resendBusy || !email.trim()}
          >
            {resendBusy ? 'Requesting…' : 'Resend confirmation email'}
          </button>
        )}

        {signup
          ? <p className="auth-switch">Already registered? <a href="#signin">Sign in</a></p>
          : <p className="auth-switch">New here? <a href="#signup-customer">Customer signup</a> · <a href="#signup-dealer">Dealer signup</a></p>
        }

        <p className="auth-footnote">
          Passwords are securely handled by Supabase authentication. Dealer accounts remain
          restricted until an administrator approves the application.
        </p>
      </section>
    </main>
  )
}
