import './AuthPages.css'
import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'

type Mode = 'signup-customer' | 'signup-dealer' | 'signin'
export default function AuthPages({ mode }: { mode: string }) {
  const current = (['signup-customer','signup-dealer','signin'].includes(mode) ? mode : 'signin') as Mode
  const dealer = current === 'signup-dealer'
  const signup = current !== 'signin'
  const [fullName,setFullName]=useState('')
  const [address,setAddress]=useState('')
  const [phone,setPhone]=useState('')
  const [email,setEmail]=useState('')
  const [gender,setGender]=useState('prefer_not_to_say')
  const [companyName,setCompanyName]=useState('')
  const [password,setPassword]=useState('')
  const [status,setStatus]=useState('')
  const [busy,setBusy]=useState(false)
  useEffect(() => {
    if (window.location.hash.includes('access_token=')) {
      const params = new URLSearchParams(window.location.hash.slice(1))
      const accessToken = params.get('access_token')
      const refreshToken = params.get('refresh_token')
      if (accessToken && params.get('type') === 'signup') {
        localStorage.setItem('hmd_access_token', accessToken)
        if (refreshToken) localStorage.setItem('hmd_refresh_token', refreshToken)
        setStatus('Your email has been confirmed successfully. You can now sign in to your account.')
        window.history.replaceState(null, '', window.location.pathname + '#signin')
      }
    }
  }, [])
  async function submit(e:FormEvent<HTMLFormElement>) {
    e.preventDefault(); setBusy(true); setStatus('')
    try {
      const endpoint=signup?'/api/auth/signup':'/api/auth/signin'
      const body=signup?{fullName,address,phone,email,gender,password,companyName,accountType:dealer?'dealer':'customer'}:{email,password}
      const response=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})
      const data=await response.json()
      if(!response.ok) throw new Error(data.error||'Please try again.')
      if(!signup && data.accessToken) {
        localStorage.setItem('hmd_access_token',data.accessToken)
        localStorage.setItem('hmd_refresh_token',data.refreshToken||'')
        setStatus(data.user?.account_type==='dealer' && data.user?.dealer_status!=='approved'?'Signed in. Your dealer access is still awaiting administrator approval.':'You are signed in successfully.')
      } else setStatus(data.message||'Request received.')
    } catch(error) { setStatus(error instanceof Error?error.message:'Something went wrong.') }
    finally { setBusy(false) }
  }
  return <main className="auth-page">
    <header className="auth-header"><a href="#home"><img src="/heyman-diamond-logo.png" alt="Hey Man Diamond LLC" /></a><a href="#home">← Back to website</a></header>
    <section className="auth-card">
      <span className="auth-eyebrow">HEY MAN DIAMOND LLC · SECURE ACCOUNT</span>
      <h1>{signup?(dealer?'Dealer account request':'Create your customer account'):'Welcome back'}</h1>
      <p>{signup?(dealer?'Create your account with basic business details. Your dealer access will be activated after admin approval.':'Create an account to make your diamond experience more personal.'):'Sign in with the email and password you registered with.'}</p>
      <form onSubmit={submit}>
        {signup&&<><label>Full name<input value={fullName} onChange={e=>setFullName(e.target.value)} autoComplete="name" required maxLength={120}/></label>
        <label>Address<input value={address} onChange={e=>setAddress(e.target.value)} autoComplete="street-address" required maxLength={500}/></label>
        <label>Mobile number<input value={phone} onChange={e=>setPhone(e.target.value)} type="tel" autoComplete="tel" required maxLength={40}/></label>
        <label>Gender<select value={gender} onChange={e=>setGender(e.target.value)}><option value="prefer_not_to_say">Prefer not to say</option><option value="female">Female</option><option value="male">Male</option><option value="non_binary">Non-binary</option></select></label>
        {dealer&&<label>Company name<input value={companyName} onChange={e=>setCompanyName(e.target.value)} autoComplete="organization" required maxLength={160}/></label>}</>}
        <label>Email address<input type="email" value={email} onChange={e=>setEmail(e.target.value)} autoComplete="email" required maxLength={254}/></label>
        <label>Password<input type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete={signup?'new-password':'current-password'} minLength={10} required maxLength={128}/></label>
        <button type="submit" disabled={busy}>{busy?'Please wait…':signup?'Create account':'Sign in'}</button>
      </form>
      {status&&<p className="auth-status" role="status">{status}</p>}
      {signup?<p className="auth-switch">Already registered? <a href="#signin">Sign in</a></p>:<p className="auth-switch">New here? <a href="#signup-customer">Customer signup</a> · <a href="#signup-dealer">Dealer signup</a></p>}
      <p className="auth-footnote">Passwords are handled by Supabase authentication. Dealer accounts remain restricted until an administrator approves the application.</p>
    </section>
  </main>
}
