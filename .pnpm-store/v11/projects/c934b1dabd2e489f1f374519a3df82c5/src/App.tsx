import { useEffect, useState, type ReactNode } from 'react'
import AssessmentPage from './components/AssessmentPage'
import { assessmentQuestions } from './data/assessmentQuestions'
import './App.css'

type IconName = 'shield' | 'chat' | 'lock' | 'heart' | 'arrow'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    shield: <><path d="M12 3 5 6v5c0 4.5 2.9 8.6 7 10 4.1-1.4 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    chat: <><path d="M20 11a7 7 0 0 1-7 7H8l-4 3 1.4-4.2A7 7 0 1 1 20 11Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    heart: <path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
  }

  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

function App() {
  const [page, setPage] = useState<'home' | 'assessment'>(() => window.location.hash === '#assessment' ? 'assessment' : 'home')

  useEffect(() => {
    const syncPageWithUrl = () => setPage(window.location.hash === '#assessment' ? 'assessment' : 'home')
    window.addEventListener('hashchange', syncPageWithUrl)
    return () => window.removeEventListener('hashchange', syncPageWithUrl)
  }, [])

  const startAssessment = () => {
    window.location.hash = 'assessment'
    setPage('assessment')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  const exitAssessment = () => {
    window.history.pushState(null, '', `${window.location.pathname}${window.location.search}`)
    setPage('home')
    window.scrollTo({ top: 0, behavior: 'auto' })
  }

  if (page === 'assessment') {
    return <AssessmentPage questions={assessmentQuestions} onExit={exitAssessment} />
  }

  return (
    <div className="site-shell">
      <header className="nav-wrap">
        <nav className="nav" aria-label="Main navigation">
          <a className="brand" href="#top" aria-label="LinqLife home">
            <span className="brand-mark"><Icon name="heart" /></span>
            <span>Linq<span>Life</span></span>
          </a>
          <div className="nav-links">
            <a href="#how-it-works">How it works</a>
            <a href="#why-linqlife">Why LinqLife</a>
            <button className="nav-cta" onClick={startAssessment}>Start assessment</button>
          </div>
        </nav>
      </header>

      <main id="top">
        <section className="hero-section">
          <div className="hero-copy">
            <h1>Life insurance,<br /><em>made personal.</em></h1>
            <p className="hero-lede">Understand how much coverage your family may need—and which type could fit—in one simple, judgment-free conversation.</p>
            <div className="hero-actions">
              <button className="primary-button" onClick={startAssessment}>Start your free assessment <Icon name="arrow" /></button>
              <span>About 5 minutes</span>
            </div>
            <div className="trust-row">
              <div><Icon name="lock" /><span><strong>Private by design</strong>Your answers stay protected</span></div>
              <div><Icon name="shield" /><span><strong>Educational guidance</strong>No obligation to buy</span></div>
            </div>
          </div>

          <div className="hero-visual" aria-label="Preview of a LinqLife needs assessment">
            <div className="orb orb-one" />
            <div className="orb orb-two" />
            <div className="assessment-card">
              <div className="card-topline"><span>YOUR NEEDS SNAPSHOT</span><span>Step 2 of 5</span></div>
              <div className="progress"><span /></div>
              <div className="guide-bubble">
                <span className="guide-avatar"><Icon name="chat" /></span>
                <p>Let’s make sure the people you love have the support they need.</p>
              </div>
              <h2>Who depends on you financially?</h2>
              <div className="choice-preview">
                <div className="selected"><span className="choice-icon">♡</span><span><strong>My partner</strong><small>Spouse or significant other</small></span><b>✓</b></div>
                <div><span className="choice-icon">⌂</span><span><strong>My children</strong><small>One or more dependents</small></span><i /></div>
                <div><span className="choice-icon">♧</span><span><strong>Someone else</strong><small>Parent, sibling, or loved one</small></span><i /></div>
              </div>
              <button className="card-next" onClick={startAssessment}>Continue <Icon name="arrow" /></button>
              <span className="secure-note"><Icon name="lock" /> Your information is encrypted and private</span>
            </div>
            <div className="coverage-pill"><span><Icon name="shield" /></span><div><small>Personalized for you</small><strong>A plan built around your life</strong></div></div>
          </div>
        </section>
      </main>

      <footer>
        <a className="brand footer-brand" href="#top"><span className="brand-mark"><Icon name="heart" /></span><span>Linq<span>Life</span></span></a>
        <p>LinqLife provides educational estimates, not financial, legal, or tax advice.</p>
        <div><a href="#privacy">Privacy</a><a href="#terms">Terms</a><span>© 2026 LinqLife</span></div>
      </footer>
    </div>
  )
}

export default App
