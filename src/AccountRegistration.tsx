import { FormEvent, useState } from 'react'

type AccountType = 'retail' | 'dealer'
type DealerStatus = 'new' | 'existing'

const kycFields = [
  ['registeredBusinessName', 'Registered Business Name', true],
  ['companyDba', 'Company Name / DBA (if applicable)', false],
  ['registeredAddress', 'Registered Business Address', true],
  ['primaryContact', 'Primary Contact Person', true],
  ['primaryEmail', 'Primary Contact Email', true],
  ['telephone', 'Telephone Number', true],
  ['cellPhone', 'Cell Phone Number', false],
  ['website', 'Website', false],
  ['shipToAddress', 'Ship-to Address', false],
  ['businessTaxId', 'Business Registration No. / Tax ID No.', true],
  ['jbtId', 'JBT ID Number', true],
  ['incorporationYear', 'Year of Incorporation', true],
  ['accountsPayableContact', 'Accounts Payable Contact Person', true],
  ['accountsPayableEmail', 'Accounts Payable Email Address', false],
  ['accountsPayablePhone', 'Accounts Payable Phone Number', true],
  ['ownersDirectors', 'Names of Business Owners / Directors', true],
  ['bankName', 'Bank Name', true],
  ['bankAddress', 'Bank Address', false],
  ['trade1Company', 'Trade Reference 1 — Company Name', false],
  ['trade1Contact', 'Trade Reference 1 — Contact Person', false],
  ['trade1Email', 'Trade Reference 1 — Email Address', false],
  ['trade1Phone', 'Trade Reference 1 — Phone Number', false],
  ['trade2Company', 'Trade Reference 2 — Company Name', false],
  ['trade2Contact', 'Trade Reference 2 — Contact Person', false],
  ['trade2Email', 'Trade Reference 2 — Email Address', false],
  ['trade2Phone', 'Trade Reference 2 — Phone Number', false],
  ['trade3Company', 'Trade Reference 3 — Company Name', false],
  ['trade3Contact', 'Trade Reference 3 — Contact Person', false],
  ['trade3Email', 'Trade Reference 3 — Email Address', false],
  ['trade3Phone', 'Trade Reference 3 — Phone Number', false],
  ['trade4Company', 'Trade Reference 4 — Company Name', false],
  ['trade4Contact', 'Trade Reference 4 — Contact Person', false],
  ['trade4Email', 'Trade Reference 4 — Email Address', false],
  ['trade4Phone', 'Trade Reference 4 — Phone Number', false],
] as const

export default function AccountRegistration() {
  const [accountType, setAccountType] = useState<AccountType | ''>('')
  const [dealerStatus, setDealerStatus] = useState<DealerStatus | ''>('')
  const [formMessage, setFormMessage] = useState('')
  const [aml, setAml] = useState('')
  const [signature, setSignature] = useState('')
  const [basic, setBasic] = useState({ fullName: '', email: '', password: '', confirmPassword: '', existingCustomerId: '' })

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (basic.password !== basic.confirmPassword) {
      setFormMessage('Your passwords do not match.')
      return
    }
    setFormMessage('Registration is a visual prototype only. Secure account creation and KYC submission will be enabled after the backend, authentication, and protected document storage are configured. Do not enter real tax IDs or banking information yet.')
  }

  const input = (name: string, label: string, required = false, type = 'text') => (
    <div className="account-field" key={name}>
      <label htmlFor={name}>{label}{required ? ' *' : ''}</label>
      <input id={name} name={name} type={type} required={required} autoComplete={type === 'email' ? 'email' : undefined} />
    </div>
  )

  return (
    <section className="account-section" id="account" aria-labelledby="account-title">
      <div className="account-heading">
        <div className="eyebrow"><span className="eyebrow-line" />YOUR HEY MAN DIAMOND ACCOUNT</div>
        <h2 id="account-title">The right access for <em>every customer.</em></h2>
        <p>Create a retail account or apply for dealer access. Wholesale pricing stays restricted until your business account is approved.</p>
      </div>
      <div className="account-shell">
        <div className="account-steps">
          <span className={accountType ? 'account-step complete' : 'account-step current'}>01 <b>Account type</b></span>
          {accountType === 'dealer' && <span className={dealerStatus ? 'account-step complete' : 'account-step current'}>02 <b>Dealer status</b></span>}
          <span className="account-step">03 <b>Account details</b></span>
          {accountType === 'dealer' && dealerStatus === 'new' && <span className="account-step">04 <b>Business application</b></span>}
        </div>
        <form className="account-form" onSubmit={submit}>
          <h3>Create an account</h3>
          <div className="account-field">
            <label>ACCOUNT TYPE *</label>
            <div className="account-choice-grid">
              <button type="button" className={accountType === 'dealer' ? 'account-choice selected' : 'account-choice'} onClick={() => { setAccountType('dealer'); setDealerStatus(''); setFormMessage('') }}>
                <span aria-hidden="true">◇</span><strong>Wholesale / Diamond Dealer</strong><small>For jewelry businesses and trade professionals</small>
              </button>
              <button type="button" className={accountType === 'retail' ? 'account-choice selected' : 'account-choice'} onClick={() => { setAccountType('retail'); setDealerStatus(''); setFormMessage('') }}>
                <span aria-hidden="true">✧</span><strong>General Customer</strong><small>For personal diamond shopping</small>
              </button>
            </div>
          </div>

          {accountType === 'dealer' && (
            <div className="account-field">
              <label>ARE YOU A NEW OR EXISTING CUSTOMER? *</label>
              <div className="account-choice-grid">
                <button type="button" className={dealerStatus === 'new' ? 'account-choice selected' : 'account-choice'} onClick={() => { setDealerStatus('new'); setFormMessage('') }}>
                  <strong>New customer</strong><small>Complete the business KYC application for review.</small>
                </button>
                <button type="button" className={dealerStatus === 'existing' ? 'account-choice selected' : 'account-choice'} onClick={() => { setDealerStatus('existing'); setFormMessage('') }}>
                  <strong>Existing customer</strong><small>Basic account details plus an existing customer identifier.</small>
                </button>
              </div>
            </div>
          )}

          {(accountType === 'retail' || dealerStatus !== '') && (
            <>
              <div className="account-field-grid">
                {input('fullName', 'Full name', true)}
                {input('email', 'Email address', true, 'email')}
                {input('password', 'Create password', true, 'password')}
                {input('confirmPassword', 'Confirm password', true, 'password')}
              </div>
              {accountType === 'dealer' && dealerStatus === 'existing' && input('existingCustomerId', 'Existing customer number or approved business identifier', true)}
              {accountType === 'dealer' && dealerStatus === 'new' && (
                <div className="kyc-form">
                  <div className="kyc-heading"><span className="eyebrow">BUSINESS VERIFICATION</span><h4>Wholesale account application</h4><p>Fields marked * are required. Complete the information accurately for admin review.</p></div>
                  <div className="account-field-grid">
                    {kycFields.slice(0, 18).map(([name, label, required]) => input(name, label, required, name.toLowerCase().includes('email') ? 'email' : 'text'))}
                  </div>
                  <div className="account-field">
                    <label>ANTI-MONEY LAUNDERING PROGRAM *</label>
                    <p className="account-help">Have you established an Anti-Money Laundering Program in accordance with the USA PATRIOT Act?</p>
                    <div className="aml-options">
                      {['Yes', 'No', 'Maybe'].map(value => <label key={value}><input type="radio" name="aml" value={value} required checked={aml === value} onChange={() => setAml(value)} />{value}</label>)}
                    </div>
                  </div>
                  {[1, 2, 3, 4].map((reference) => (
                    <fieldset className="trade-reference" key={reference}>
                      <legend>Trade reference {reference} {reference < 3 ? '(recommended)' : '(optional)'}</legend>
                      <div className="account-field-grid">
                        {input(`trade${reference}Company`, 'Company Name')}
                        {input(`trade${reference}Contact`, 'Contact Person Name')}
                        {input(`trade${reference}Email`, 'Email Address', false, 'email')}
                        {input(`trade${reference}Phone`, 'Phone Number', false, 'tel')}
                      </div>
                    </fieldset>
                  ))}
                  <div className="account-field">
                    <label htmlFor="digital-signature">DIGITAL SIGNATURE (TYPE YOUR FULL LEGAL NAME) *</label>
                    <input id="digital-signature" value={signature} onChange={event => setSignature(event.target.value)} required placeholder="Full legal name of authorized signatory" />
                    <p className="account-help">By signing, you confirm the information is accurate and authorize its review for business-account approval. Final legal wording and signature audit requirements must be confirmed before launch.</p>
                  </div>
                </div>
              )}
              <button className="submit-review account-submit" type="submit">{accountType === 'retail' ? 'Create Customer Account' : 'Submit Dealer Application'}</button>
              {accountType === 'dealer' && <p className="account-help">Dealer status remains pending until an authorized admin verifies and approves the application. Choosing “existing customer” does not automatically grant wholesale access.</p>}
              {formMessage && <p className="form-status" role="status" aria-live="polite">{formMessage}</p>}
            </>
          )}
          {!accountType && <p className="account-help">Choose an account type to see the registration steps.</p>}
        </form>
      </div>
    </section>
  )
}
