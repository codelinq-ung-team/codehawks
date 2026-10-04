// The optional bank step after age: connect accounts through Plaid Sandbox and the
// balances fill in the debt question, and later the mortgage, other debts and savings. Everything
// it fills stays editable and is checked on Review. If Plaid can't be reached, labeled sample
// accounts keep the demo going.
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePlaidLink, type PlaidLinkOnSuccess } from 'react-plaid-link'
import { formatMoney } from '../domain/calculator.ts'
import { GUIDE_NAME } from '../guide/guide.ts'
import { GuidePose } from '../guide/Poses.tsx'
import { Button, Icon } from '../kit/Kit.tsx'
import { Page } from '../lib/Chrome.tsx'
import { setState, useStore, type FinancialSnapshot } from '../lib/store.ts'
import { exchangePublicToken, PlaidApiError, requestLinkToken, SAMPLE } from './plaid.ts'
import { clearPlaid, fillForm, plaidFill } from './plaidFill.ts'

const errorText = (e: unknown, fallback: string) => e instanceof PlaidApiError ? e.message : fallback

function connect(snapshot: FinancialSnapshot) {
  setState((s) => ({ plaid: snapshot, form: fillForm(s.form, snapshot) }))
}

function disconnect() {
  setState((s) => ({ ...clearPlaid(s.profile, s.form, s.plaid), plaid: null }))
}

export function PlaidConnect({ onDone }: { onDone: () => void }) {
  const { plaid } = useStore()
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [linkToken, setLinkToken] = useState<string | null>(null)
  const openWhenReady = useRef(false)

  const onSuccess = useCallback<PlaidLinkOnSuccess>(async (publicToken) => {
    setLinkToken(null)
    try {
      if (!publicToken) throw new PlaidApiError('Plaid didn’t return your accounts. Please try again.')
      connect(await exchangePublicToken(publicToken))
      setMessage(null)
    } catch (e) {
      setMessage(errorText(e, 'Your accounts couldn’t be imported.'))
    } finally {
      setBusy(false)
    }
  }, [])

  const { open, ready, error: linkError } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (e) => {
      if (e) setMessage('Plaid closed with an error. Please try again.')
      openWhenReady.current = false
      setLinkToken(null)
      setBusy(false)
    },
  })

  // Link opens as soon as its script has loaded the token we just asked for.
  useEffect(() => {
    if (openWhenReady.current && ready) {
      openWhenReady.current = false
      open()
    }
  }, [linkToken, open, ready])

  async function start() {
    setMessage(null)
    setBusy(true)
    try {
      setLinkToken(await requestLinkToken())
      openWhenReady.current = true
    } catch (e) {
      setMessage(errorText(e, 'Plaid couldn’t be started.'))
      setBusy(false)
    }
  }

  const fill = plaidFill(plaid)
  const sample = plaid?.environment === 'sample'
  const failed = message ?? (linkError ? 'Plaid Link couldn’t load. Check your connection and try again.' : null)

  return (
    <Page className="qform-screen">
      <section className="qform" aria-labelledby="plaid-heading">
        <div className="qform__meta"><span>Basics · Optional bank connection</span></div>
        <div className="qform__body" data-side="left">
          <div className="qform__head">
            <span className="qform__num" aria-hidden="true"><Icon name="shield" size={20} /></span>
            <GuidePose name={plaid ? 'cheer' : 'wave'} className="qform__guide" />
          </div>
          <h1 id="plaid-heading" className="qform__prompt">
            {plaid ? 'Your balances are in.' : 'Want to fill some of this in from your bank?'}
          </h1>
          <p className="qform__helper">
            {plaid
              ? `${GUIDE_NAME} filled in what the balances can answer. You can change any of it as you go.`
              : 'Connect accounts with Plaid and your balances fill in your debts and savings. You can change anything before the math.'}
          </p>

          {plaid && fill ? (
            <div className="plaid-card">
              <div className="plaid-card__top">
                <strong>{fill.accounts} {fill.accounts === 1 ? 'account' : 'accounts'} connected</strong>
                <span className={'plaid-badge' + (sample ? ' is-sample' : '')}>{sample ? 'Sample data' : 'Plaid Sandbox'}</span>
              </div>
              <ul className="plaid-fills">
                <li><span>Total debt</span><strong>{fill.debt == null ? 'No debt accounts' : formatMoney(fill.debt)}</strong></li>
                {fill.debt != null && <li className="is-sub"><span>Mortgage</span><strong>{formatMoney(fill.mortgage)}</strong></li>}
                {fill.debt != null && <li className="is-sub"><span>Other debts</span><strong>{formatMoney(fill.otherDebts)}</strong></li>}
                <li><span>Savings your family could use</span><strong>{fill.savings == null ? 'No bank accounts' : formatMoney(fill.savings)}</strong></li>
              </ul>
              <p className="plaid-note"><Icon name="info" size={16} />Balances can’t tell us your income, family or insurance, so those are still questions.</p>
            </div>
          ) : (
            <div className="plaid-card">
              <p className="plaid-note">
                <Icon name="info" size={16} />
                <span><strong>Sandbox only.</strong> Pick any test bank and sign in with <strong>user_good</strong> / <strong>pass_good</strong>. Never enter a real bank login.</span>
              </p>
              {failed && (
                <div className="plaid-error" role="alert">
                  <p><Icon name="exclamation" size={16} />{failed}</p>
                  <button type="button" className="link-button" onClick={() => { connect(SAMPLE); setMessage(null) }}>Use sample accounts instead</button>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="qform__actions">
          {plaid
            ? <Button variant="bordered" onClick={disconnect}>Disconnect</Button>
            : <Button variant="bordered" onClick={onDone} className="lift">Answer myself</Button>}
          {plaid
            ? <Button onClick={onDone} className="lift">Continue<Icon name="chevron-right" size={18} weight={2.6} /></Button>
            : (
              <Button disabled={busy && !linkError} onClick={() => void start()} className="lift">
                {busy && !linkError ? 'Opening Plaid…' : 'Connect with Plaid'}<Icon name="chevron-right" size={18} weight={2.6} />
              </Button>
            )}
        </div>
      </section>
    </Page>
  )
}
