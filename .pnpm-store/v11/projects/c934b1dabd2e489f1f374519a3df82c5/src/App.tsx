import { useState, type ReactNode } from 'react'
import './App.css'

type IconName = 'shield' | 'chat' | 'chart' | 'lock' | 'heart' | 'arrow'

function Icon({ name }: { name: IconName }) {
  const paths: Record<IconName, ReactNode> = {
    shield: <><path d="M12 3 5 6v5c0 4.5 2.9 8.6 7 10 4.1-1.4 7-5.5 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-4"/></>,
    chat: <><path d="M20 11a7 7 0 0 1-7 7H8l-4 3 1.4-4.2A7 7 0 1 1 20 11Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01"/></>,
    chart: <><path d="M4 19V9M10 19V5M16 19v-7M22 19H2"/></>,
    lock: <><rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></>,
    heart: <path d="M20.8 5.8a5.4 5.4 0 0 0-7.6 0L12 7l-1.2-1.2a5.4 5.4 0 0 0-7.6 7.6L12 22l8.8-8.6a5.4 5.4 0 0 0 0-7.6Z"/>,
    arrow: <><path d="M5 12h14M14 7l5 5-5 5"/></>,
  }

  return <svg className="icon" viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>
}

const dependentOptions = ['A spouse or partner', 'Children', 'Parents or relatives', 'No one right now']

function App() {
  const [selectedDependent, setSelectedDependent] = useState('')
  const [assessmentStarted, setAssessmentStarted] = useState(false)

  const startAssessment = () => {
    setAssessmentStarted(true)
    window.setTimeout(() => document.querySelector('#assessment')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50)
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
            <div className="eyebrow"><span>Free guided assessment</span><span className="eyebrow-dot" />No sales pressure</div>
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

        <section className="proof-strip" aria-label="Assessment benefits">
          <span><b>5 min</b> to clarity</span><span><b>100%</b> free</span><span><b>0</b> pressure</span><span><b>1</b> personalized plan</span>
        </section>

        <section className="how-section" id="how-it-works">
          <div className="section-heading">
            <span className="kicker">A SIMPLE WAY FORWARD</span>
            <h2>Clarity in three thoughtful steps</h2>
            <p>No jargon. No confusing forms. Just a guided conversation about what matters to you.</p>
          </div>
          <div className="steps-grid">
            <article><span className="step-number">01</span><div className="step-icon"><Icon name="chat" /></div><h3>Tell us about your life</h3><p>Answer a few approachable questions about your family, finances, and future goals.</p></article>
            <article><span className="step-number">02</span><div className="step-icon"><Icon name="chart" /></div><h3>See your needs clearly</h3><p>We turn your answers into an easy-to-understand estimate you can adjust anytime.</p></article>
            <article><span className="step-number">03</span><div className="step-icon"><Icon name="shield" /></div><h3>Explore your options</h3><p>Learn how term and permanent coverage could fit your needs—without the sales pitch.</p></article>
          </div>
        </section>

        <section className="why-section" id="why-linqlife">
          <div className="why-copy">
            <span className="kicker">BUILT AROUND PEOPLE, NOT POLICIES</span>
            <h2>You don’t need to know insurance.<br />You just need to know <em>your life.</em></h2>
            <p>Most people aren’t sure where to begin. LinqLife meets you there, explaining every step in plain language and helping you make a confident, informed decision.</p>
            <ul>
              <li><span>✓</span><div><strong>Guidance without judgment</strong><small>There are no wrong answers—only what works for you.</small></div></li>
              <li><span>✓</span><div><strong>Your numbers, explained</strong><small>See exactly how your estimate was calculated.</small></div></li>
              <li><span>✓</span><div><strong>Education before decisions</strong><small>Understand your options before considering a policy.</small></div></li>
            </ul>
          </div>
          <div className="quote-card">
            <span className="quote-mark">“</span>
            <blockquote>I finally understood what my family would actually need—not just a random number from a calculator.</blockquote>
            <div className="quote-person"><span>AM</span><div><strong>Alex M.</strong><small>Parent of two</small></div></div>
          </div>
        </section>

        <section className={`assessment-section ${assessmentStarted ? 'is-active' : ''}`} id="assessment">
          <div className="assessment-intro">
            <span className="kicker">LET’S BEGIN</span>
            <h2>Start with what matters most.</h2>
            <p>Your answers help us understand who you’re protecting. Select the closest answer.</p>
          </div>
          <div className="live-question">
            <div className="question-progress"><span>Question 1 of 5</span><span>20%</span></div>
            <div className="progress"><span /></div>
            <h3>Who would be financially affected if you died?</h3>
            <div className="answer-grid">
              {dependentOptions.map((option) => (
                <button className={selectedDependent === option ? 'active' : ''} key={option} onClick={() => setSelectedDependent(option)}>
                  <span>{option}</span><i>{selectedDependent === option ? '✓' : ''}</i>
                </button>
              ))}
            </div>
            <button className="primary-button assessment-next" disabled={!selectedDependent}>Continue <Icon name="arrow" /></button>
            <small className="form-note"><Icon name="lock" /> No medical or payment information needed</small>
          </div>
        </section>

        <section className="final-cta">
          <span className="kicker">YOUR FAMILY. YOUR FUTURE.</span>
          <h2>A clearer plan starts with<br />one simple conversation.</h2>
          <p>Get a personalized needs estimate and understand your options—free, private, and at your pace.</p>
          <button className="primary-button light" onClick={startAssessment}>Start your free assessment <Icon name="arrow" /></button>
          <small>No commitment. No credit card. Just clarity.</small>
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
