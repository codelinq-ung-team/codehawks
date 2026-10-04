// Real Plaid Sandbox Link flow. Credentials stay inside Plaid Link; only temporary
// tokens and the backend's redacted financial snapshot enter this application.
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link'
import { Button, Icon } from '../kit/Kit.tsx'
import { Page } from '../lib/Chrome.tsx'
import { go, setState, useStore } from '../lib/store.ts'
import { GuidePose } from '../guide/Poses.tsx'
import { BasicsQuiz } from './BasicsQuiz.tsx'
import { exchangePublicToken, PlaidApiError, requestLinkToken } from './plaid.ts'
import { applyPlaidDebts } from './plaidProfile.ts'
import './PlaidConnect.css'

type Stage = 'ready' | 'opening' | 'connected' | 'quiz-plaid' | 'quiz-manual'

export function Prepare() {
  const app = useStore()
  const [stage, setStage] = useState<Stage>(() => app.financialSnapshot ? 'connected' : 'ready')
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const shouldOpen = useRef(false)
  const [message, setMessage] = useState<string | null>(null)

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (publicToken) => {
    if (!publicToken) {
      setMessage('Plaid did not return a public token. Please try again.')
      setStage('ready')
      return
    }
    setStage('opening')
    setMessage(null)
    try {
      const result = await exchangePublicToken(publicToken)
      setState({
        financialSnapshot: result.financialSnapshot,
        financialContextToken: result.financialContextToken,
      })
      setStage('connected')
      setLinkToken(null)
    } catch (error) {
      setMessage(error instanceof PlaidApiError ? error.message : 'The account could not be imported.')
      setStage('ready')
      setLinkToken(null)
    }
  }, [])

  const { open, ready, error: linkError } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (error) => {
      if (error) setMessage('Plaid Link closed with an error. Please try again.')
      shouldOpen.current = false
      setStage((current) => current === 'connected' ? current : 'ready')
      setLinkToken(null)
    },
  })

  useEffect(() => {
    if (shouldOpen.current && ready) {
      shouldOpen.current = false
      open()
    }
  }, [linkToken, open, ready])

  async function startConnection() {
    setMessage(null)
    setStage('opening')
    try {
      const token = await requestLinkToken()
      setLinkToken(token)
      shouldOpen.current = true
    } catch (error) {
      setMessage(error instanceof PlaidApiError ? error.message : 'Plaid could not be started.')
      setStage('ready')
    }
  }

  function resetConnection() {
    setState({ financialSnapshot: null, financialContextToken: null })
    setLinkToken(null)
    shouldOpen.current = false
    setMessage(null)
    setStage('ready')
  }

  function continueWithPlaid() {
    setState((state) => ({
      form: { ...state.form, income: null, debt: null },
      profile: applyPlaidDebts(state.profile, state.financialSnapshot),
    }))
    setStage('quiz-plaid')
  }

  function continueWithoutPlaid() {
    setState({ financialSnapshot: null, financialContextToken: null })
    setLinkToken(null)
    shouldOpen.current = false
    setMessage(null)
    setStage('quiz-manual')
  }

  const snapshot = app.financialSnapshot
  const usd = snapshot?.totalsByCurrency.USD

  if (stage === 'quiz-plaid' || stage === 'quiz-manual') {
    return <BasicsQuiz hasPlaid={stage === 'quiz-plaid'} />
  }

  return (
    <Page className="plaid-screen">
      <div className="plaid-layout">
        <section className="plaid-intro" aria-labelledby="connect-title">
          <span className="plaid-eyebrow">A simpler starting point</span>
          <h1 id="connect-title">Your next chapter.<br /><span>A clearer picture.</span></h1>
          <p className="plaid-lede">Connect a Sandbox account for a helpful starting point, or continue without Plaid and tell Abe what matters.</p>
          <ol className="plaid-steps">
            <li><span>01</span><div><strong>Connect with Plaid — optional</strong><p>Use Plaid’s secure Sandbox Link experience, or skip it.</p></div></li>
            <li><span>02</span><div><strong>Review the context</strong><p>We import redacted account types and balances.</p></div></li>
            <li><span>03</span><div><strong>Complete your assessment</strong><p>Confirm what should count toward your insurance needs.</p></div></li>
          </ol>
          <div className="plaid-guide">
            <GuidePose name="wave" className="plaid-guide__pose" />
            <p>“I’ll use this as a starting point, and confirm the details that matter.”<span>ABE · YOUR GUIDE</span></p>
          </div>
        </section>

        <section className="plaid-card" aria-label="Plaid sandbox connection">
          <div className="plaid-card__top">
            <span className="plaid-wordmark">Plaid</span>
            <span className="plaid-badge"><span aria-hidden="true" />Sandbox</span>
          </div>

          {stage === 'connected' && snapshot ? (
            <div className="plaid-card__content">
              <span className="plaid-emblem plaid-emblem--success"><Icon name="check" size={32} /></span>
              <h2 tabIndex={-1}>Sandbox accounts connected.</h2>
              <p className="plaid-card__description">We imported a redacted balance snapshot from {snapshot.accounts.length} {snapshot.accounts.length === 1 ? 'account' : 'accounts'}.</p>
              <div className="plaid-account">
                <span className="plaid-account__icon"><Icon name="house" size={22} /></span>
                <div>
                  <strong>{usd ? `$${Math.round(usd.liquidAssets + usd.investmentAssets).toLocaleString('en-US')} in listed assets` : 'Account balances imported'}</strong>
                  <span>{usd ? `$${Math.round(usd.debtBalances).toLocaleString('en-US')} in listed debt · USD` : 'Review details with Abe'}</span>
                </div>
                <span className="plaid-account__tag">Imported</span>
              </div>
              <div className="plaid-notice"><Icon name="info" size={18} /><p>Balances may be cached. Abe will confirm what is income, usable savings, mortgage debt, and other obligations before the estimate.</p></div>
              <Button fullWidth size="large" onClick={continueWithPlaid}>Continue to Basics<Icon name="chevron-right" size={18} /></Button>
              <Button variant="plain" fullWidth onClick={resetConnection}>Disconnect Sandbox data</Button>
            </div>
          ) : (
            <div className="plaid-card__content">
              <span className="plaid-emblem"><Icon name="shield" size={32} /></span>
              <h2>Let’s connect<br />your bank.</h2>
              <p className="plaid-card__description">Open the real Plaid Sandbox flow and select a test institution, or continue without connecting.</p>
              <div className="plaid-notice"><Icon name="info" size={18} /><p><strong>Sandbox only.</strong> Use Plaid’s test credentials <strong>user_good</strong> and <strong>pass_good</strong>. Never enter a real bank login.</p></div>
              {(message || linkError) && <p className="plaid-error" role="alert"><Icon name="exclamation" size={16} />{message ?? 'Plaid Link could not load. Check your connection and try again.'}</p>}
              <Button fullWidth size="large" disabled={stage === 'opening' && !linkError} onClick={() => void startConnection()}>
                {stage === 'opening' && !linkError ? 'Opening Plaid…' : 'Continue with Plaid'}<Icon name="chevron-right" size={18} />
              </Button>
              <div className="plaid-choice" aria-hidden="true"><span>or</span></div>
              <Button variant="bordered" fullWidth size="large" onClick={continueWithoutPlaid}>Continue without Plaid</Button>
              <p className="plaid-fineprint">The Plaid secret stays on the backend. This app receives only temporary tokens and redacted Sandbox balances.</p>
            </div>
          )}
          <div className="plaid-card__bottom"><Icon name="shield" size={15} /><span>{snapshot ? 'Connected through Plaid Sandbox' : 'Plaid Sandbox is optional'}</span></div>
        </section>
      </div>
      <button type="button" className="plaid-exit link-button" onClick={() => go('home')}><Icon name="chevron-left" size={16} />Back to home</button>
    </Page>
  )
}
