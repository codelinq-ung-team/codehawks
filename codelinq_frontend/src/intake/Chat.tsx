// The conversation with Pip: one question at a time, quick replies, and "why?" any time.
// Answers are checked on the Review screen, so this screen is only the chat.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Icon } from '../kit/Kit.tsx'
import { Avatar } from '../guide/Avatar.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { Page } from '../lib/Chrome.tsx'
import { getState, go, setState, useStore, type Message } from '../lib/store.ts'
import { CLOSING, WHY, intro, nextStep, question, respond } from './script.ts'

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
const pause = () => new Promise((r) => setTimeout(r, reduceMotion() ? 0 : 450))

const push = (...msgs: Message[]) => setState((s) => ({ messages: [...s.messages, ...msgs] }))

async function botSay(lines: string[], last: Partial<Message>) {
  for (let i = 0; i < lines.length; i++) {
    setState({ typing: true })
    await pause()
    push({ role: 'bot', text: lines[i], ...(i === lines.length - 1 ? last : null) })
  }
  setState({ typing: false })
}

async function begin() {
  const s = getState()
  const step = nextStep(s)
  const q = step ? question(step, s) : null
  await botSay([...intro(s), q ? q.text : CLOSING], q ? { replies: q.replies } : { done: true })
}

async function send(text: string) {
  const s = getState()
  if (!text.trim() || s.typing) return
  push({ role: 'user', text: text.trim() })
  const step = nextStep(s)
  if (!step) return botSay([CLOSING], { done: true })

  const res = respond(step, text, s)
  if (res.updates || res.pending !== undefined) {
    setState((st) => ({
      profile: { ...st.profile, ...res.updates },
      pending: res.pending === undefined ? st.pending : res.pending,
    }))
  }

  if (res.why) {
    const replies = question(step, getState()).replies.filter((r) => r !== WHY)
    return botSay(res.say, { replies, why: true })
  }
  if (res.replies) return botSay(res.say, { replies: res.replies })

  const after = getState()
  const next = nextStep(after)
  if (next) {
    const q = question(next, after)
    return botSay([...res.say, q.text], { replies: q.replies })
  }
  return botSay([...res.say, CLOSING], { done: true })
}

export function Chat() {
  const state = useStore()
  const [draft, setDraft] = useState('')
  const logRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    // Read live state: under StrictMode this effect runs twice, and the first run has already started typing.
    const s = getState()
    if (!s.messages.length && !s.typing) void begin()
  }, [])

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: reduceMotion() ? 'auto' : 'smooth' })
  }, [state.messages.length, state.typing])

  const msgs = state.messages
  const last = msgs[msgs.length - 1]
  const replies = last && last.role === 'bot' && !state.typing ? last.replies : undefined
  const finished = !!last?.done

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = draft
    setDraft('')
    void send(text)
    inputRef.current?.focus()
  }

  // Pip's face sits beside the last bubble in each run of her messages.
  const showFace = (i: number) => (i === msgs.length - 1 ? !state.typing : msgs[i + 1].role !== 'bot')

  return (
    <Page className="chat-screen">
      <section className="chat-card" aria-label={`Conversation with ${GUIDE_NAME}`}>
        <header className="chat-card__head">
          <Avatar size={48} />
          <div className="chat-card__who">
            <strong className="headline">{GUIDE_NAME}</strong>
            <span className="footnote muted"><span className="chat-card__dot" aria-hidden="true" />Your guide · Here to help</span>
          </div>
        </header>

        <div className="chat-card__body" ref={logRef}>
          <div className="chat-intro">
            <Avatar size={96} className="chat-intro__face" />
            <strong className="title-3">Meet {GUIDE_NAME}</strong>
            <p className="subhead muted">Your guide for today. Ask “why?” any time and I’ll explain.</p>
          </div>
          <ol className="chat__log" role="log" aria-live="polite" aria-relevant="additions">
            {msgs.map((m, i) => (
              <li key={i} className={`msg-row msg-row--${m.role}`}>
                {m.role === 'bot' && <span className="msg-row__face">{showFace(i) && <Avatar size={32} />}</span>}
                <div className={`msg msg--${m.role}${m.why ? ' msg--why' : ''}`}>
                  {m.why && <span className="msg__tag footnote"><Icon name="info" size={14} />Why we ask</span>}
                  <span className="sr-only">{m.role === 'bot' ? `${GUIDE_NAME}: ` : 'You: '}</span>
                  {m.text}
                  {m.done && <div className="msg__cta"><Button icon="check-circle" onClick={() => go('review')}>Review My Answers</Button></div>}
                </div>
              </li>
            ))}
            {state.typing && (
              <li className="msg-row msg-row--bot">
                <span className="msg-row__face"><Avatar size={32} /></span>
                <div className="msg msg--bot msg--typing" aria-label={`${GUIDE_NAME} is typing`}><span /><span /><span /></div>
              </li>
            )}
          </ol>
        </div>

        <div className="composer">
          {replies && (
            <div className="chips" role="group" aria-label="Suggested answers">
              {replies.map((r) => (
                <button key={r} type="button" className={'chip' + (r === WHY ? ' chip--why' : '')} onClick={() => void send(r)}>
                  {r === WHY && <Icon name="info" size={16} />}{r}
                </button>
              ))}
            </div>
          )}
          {!finished && (
            <form className="composer__form" onSubmit={submit}>
              <div className="ck-field__box composer__box">
                <input
                  ref={inputRef} className="ck-field__input" value={draft} autoFocus autoComplete="off"
                  onChange={(e) => setDraft(e.target.value)} placeholder="Type your answer…" aria-label="Your answer"
                />
              </div>
              <Button type="submit" disabled={!draft.trim() || state.typing}>Send</Button>
            </form>
          )}
          <p className="caption-1 muted composer__note">Guided mode: questions follow a set script while the AI connection is being built.</p>
        </div>
      </section>
    </Page>
  )
}
