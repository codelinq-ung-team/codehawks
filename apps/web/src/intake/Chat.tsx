// The conversation with Abe: one question at a time, quick replies, and "why?" any time.
// Typed answers are read by the AI (/api/intake); tapped suggestions, and any answer the
// AI can't be reached for, are read by the script. The order of questions never changes.
// Beside it on wide screens, "What Abe knows" lists his answers so far; anything can be
// taken back there. Answers are still checked on the Review screen.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Button, Icon } from '../kit/Kit.tsx'
import { Avatar } from '../guide/Avatar.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import { Page } from '../lib/Chrome.tsx'
import { getState, go, setState, useStore, type Message } from '../lib/store.ts'
import { readAnswer } from './ai.ts'
import { CLOSING, WHY, interpret, intro, nextStep, question, respond, type Reply } from './script.ts'
import { Knows, type Fact } from './Knows.tsx'

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
  const last = s.messages[s.messages.length - 1]
  push({ role: 'user', text: text.trim() })
  const step = nextStep(s)
  if (!step) return botSay([CLOSING], { done: true })

  let res: Reply
  if (s.pending || last?.replies?.includes(text)) {
    res = respond(step, text, s)
  } else {
    setState({ typing: true })
    const count = getState().messages.length
    const reading = await readAnswer(step, text.trim(), s)
    // Start Over while Abe was thinking: drop the reply.
    if (getState().messages.length !== count) return
    res = reading ? interpret(step, reading, s, text) : respond(step, text, s)
    setState({ offline: !reading })
  }
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

// Take an answer back. Abe acknowledges it and asks whatever he needs next, so the
// question on screen always matches the answer the chat expects.
async function forget(fact: Fact) {
  if (getState().typing) return
  setState((s) => fact.kind === 'field'
    ? { profile: { ...s.profile, [fact.id]: { status: 'empty', value: null } }, pending: null }
    : { form: { ...s.form, [fact.id]: null }, pending: null })
  const after = getState()
  const next = nextStep(after)
  const q = next ? question(next, after) : null
  await botSay(['Okay, I’ve taken that off my list.', q ? q.text : CLOSING], q ? { replies: q.replies } : { done: true })
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

  // Abe's face sits beside the last bubble in each run of his messages (small screens only;
  // wide screens show him in the side panel).
  const showFace = (i: number) => (i === msgs.length - 1 ? !state.typing : msgs[i + 1].role !== 'bot')
  const chips = replies?.filter((r) => r !== WHY)

  return (
    <Page className="chat-screen">
      <div className="chat-stage">
        <section className="chat-card" aria-label={`Conversation with ${GUIDE_NAME}`}>
          <div className="chat-card__body" ref={logRef}>
            <ol className="chat__log" role="log" aria-live="polite" aria-relevant="additions">
              {msgs.map((m, i) => (
                <li key={i} className={`msg-row msg-row--${m.role}`}>
                  {m.role === 'bot' && <span className="msg-row__face">{showFace(i) && <Avatar size={32} />}</span>}
                  <div className={`msg msg--${m.role}${m.why ? ' msg--why' : ''}`}>
                    {m.why && <span className="msg__tag footnote"><Icon name="info" size={14} />Why we ask</span>}
                    <span className="sr-only">{m.role === 'bot' ? `${GUIDE_NAME}: ` : 'You: '}</span>
                    {m.text}
                    {m.done && <div className="msg__cta"><Button icon="check-circle" onClick={() => go('review')} className="lift">Review My Answers</Button></div>}
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
            {chips && chips.length > 0 && (
              <div className="chips" role="group" aria-label="Suggested answers">
                {chips.map((r) => (
                  <button key={r} type="button" className="chip" onClick={() => void send(r)}>{r}</button>
                ))}
              </div>
            )}
            {!finished && (
              <form className="composer__form" onSubmit={submit}>
                <input
                  ref={inputRef} className="composer__input" value={draft} autoFocus autoComplete="off"
                  onChange={(e) => setDraft(e.target.value)} placeholder="Type your answer…" aria-label="Your answer"
                />
                {replies?.includes(WHY) && (
                  <button type="button" className="composer__why" onClick={() => void send(WHY)} disabled={state.typing} aria-label={WHY}>
                    <Icon name="info" size={16} weight={2.2} />
                    <span className="composer__why-full" aria-hidden="true">{WHY}</span>
                    <span className="composer__why-short" aria-hidden="true">Why?</span>
                  </button>
                )}
                <button type="submit" className="composer__send" disabled={!draft.trim() || state.typing} aria-label="Send">
                  <Icon name="arrow-up" size={22} weight={2.4} />
                </button>
              </form>
            )}
            <p className="caption-1 muted composer__note">
              {state.offline
                ? `${GUIDE_NAME} can’t reach the AI right now, so he’s reading answers with his built-in script. Your answers are safe.`
                : `${GUIDE_NAME} uses AI to read what you type. The math is done by a calculator, not the AI.`}
            </p>
          </div>
        </section>
        <Knows profile={state.profile} form={state.form} busy={state.typing} onForget={(f) => void forget(f)} />
      </div>
    </Page>
  )
}
