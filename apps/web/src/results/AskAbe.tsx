// "Ask Abe": questions after the results, beside the full math so people can look at a line
// and ask about it. Questions go to the AI; when it can't be reached, Abe falls back on his
// written answers (see ask.ts). The chat lasts as long as the page.
import { Fragment, useEffect, useImperativeHandle, useRef, useState, type FormEvent, type ReactNode, type Ref } from 'react'
import { Icon } from '../kit/Kit.tsx'
import { Avatar } from '../guide/Avatar.tsx'
import { GUIDE_NAME } from '../guide/guide.ts'
import type { Profile } from '../domain/calculator.ts'
import { GREETING, OFFLINE, askAI, payload, topicFor, written, type Ready, type Said } from './ask.ts'

const reduceMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

type Line = Said & { cut?: boolean }

// Lets other parts of the page (the term vs. permanent cards) ask Abe a question.
export type AskHandle = { ask: (question: string) => void }

export function AskAbe({ p, r, ref }: { p: Profile; r: Ready; ref?: Ref<AskHandle> }) {
  const [log, setLog] = useState<Line[]>([])
  // Abe's reply as it streams in; null when he isn't mid-reply.
  const [partial, setPartial] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [offline, setOffline] = useState(false)
  const [draft, setDraft] = useState('')
  const sectionRef = useRef<HTMLElement>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const pending = useRef<AbortController | null>(null)

  // Leaving the page stops a reply that's still coming in.
  useEffect(() => () => pending.current?.abort(), [])

  // Follow the conversation, but stop with the latest question at the top so a long answer
  // reads from its start. This scrolls the card, not the page.
  useEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const questions = el.querySelectorAll('.msg-row--user')
    const latest = questions[questions.length - 1]
    const bottom = el.scrollHeight - el.clientHeight
    const top = latest ? Math.min(bottom, el.scrollTop + latest.getBoundingClientRect().top - el.getBoundingClientRect().top - 16) : bottom
    el.scrollTo({ top, behavior: partial != null || reduceMotion() ? 'auto' : 'smooth' })
  }, [log.length, busy, partial])

  async function ask(text: string) {
    const question = text.trim()
    if (!question || busy) return
    const history: Line[] = [...log, { role: 'user', text: question }]
    setLog(history)
    setBusy(true)
    const ctrl = new AbortController()
    pending.current = ctrl
    const answer = await askAI(payload(history, p, r), setPartial, ctrl.signal)
    if (ctrl.signal.aborted) return
    setPartial(null)
    setOffline(!answer)
    const fallback = answer ? null : topicFor(question)
    const reply: Line = answer
      ? { role: 'assistant', text: answer.text, cut: !answer.complete }
      : { role: 'assistant', text: fallback ? written(fallback, p, r) : OFFLINE }
    setLog([...history, reply])
    setBusy(false)
  }

  // Bring the chat into view, then ask. The input isn't focused, so phones don't pop the keyboard.
  useImperativeHandle(ref, () => ({
    ask(question) {
      sectionRef.current?.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'center' })
      void ask(question)
    },
  }))

  function submit(e: FormEvent) {
    e.preventDefault()
    const text = draft
    setDraft('')
    void ask(text)
    inputRef.current?.focus()
  }

  return (
    <section className="ask" aria-labelledby="ask-title" ref={sectionRef}>
      {/* Styled like the list headers, so this card lines up with the full math beside it. */}
      <h3 className="ck-list__header" id="ask-title">Questions? Ask {GUIDE_NAME}</h3>
      <div className="ask__card">
        <div className="ask__body" ref={bodyRef}>
          <ol className="chat__log" role="log" aria-live="polite" aria-relevant="additions">
            <Bubble role="assistant"><Rich text={GREETING} /></Bubble>
            {log.map((m, i) => (
              <Bubble key={i} role={m.role}>
                {m.role === 'user' ? m.text : <Rich text={m.text} />}
                {m.cut && <p className="ask__cut footnote">{GUIDE_NAME} got cut off. Try asking again.</p>}
              </Bubble>
            ))}
            {busy && partial == null && (
              <li className="msg-row msg-row--bot">
                <span className="msg-row__face"><Avatar size={32} /></span>
                <div className="msg msg--bot msg--typing" aria-label={`${GUIDE_NAME} is typing`}><span /><span /><span /></div>
              </li>
            )}
            {busy && partial != null && (
              <Bubble key="partial" role="assistant" busy><Rich text={partial} /></Bubble>
            )}
          </ol>
        </div>

        <div className="composer">
          <form className="composer__form" onSubmit={submit}>
            <input
              ref={inputRef} className="composer__input" value={draft} autoComplete="off" maxLength={1000}
              onChange={(e) => setDraft(e.target.value)} placeholder="Ask a question…" aria-label={`Your question for ${GUIDE_NAME}`}
            />
            <button type="submit" className="composer__send" disabled={!draft.trim() || busy} aria-label="Send">
              <Icon name="arrow-up" size={22} weight={2.4} />
            </button>
          </form>
          <p className="caption-1 muted composer__note">
            {offline
              ? `${GUIDE_NAME} can’t reach the AI right now, so he’s answering from his written notes.`
              : `${GUIDE_NAME} uses AI to answer typed questions. Your estimate comes from the calculator, not the AI.`}
          </p>
        </div>
      </div>
    </section>
  )
}

function Bubble({ role, busy, children }: { role: Said['role']; busy?: boolean; children: ReactNode }) {
  const bot = role === 'assistant'
  return (
    <li className={`msg-row msg-row--${bot ? 'bot' : 'user'}`}>
      {bot && <span className="msg-row__face"><Avatar size={32} /></span>}
      <div className={`msg msg--${bot ? 'bot' : 'user'}`} aria-busy={busy || undefined}>
        <span className="sr-only">{bot ? `${GUIDE_NAME}: ` : 'You: '}</span>
        {children}
      </div>
    </li>
  )
}

// Replies may use a little Markdown: paragraphs, lists, **bold** and [links](https://…).
function Rich({ text }: { text: string }) {
  const out: ReactNode[] = []
  let para: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  const flush = () => {
    if (para.length) out.push(<p key={out.length}>{para.map((l, i) => <Fragment key={i}>{i > 0 && <br />}{inline(l)}</Fragment>)}</p>)
    if (list) {
      const items = list.items.map((l, i) => <li key={i}>{inline(l)}</li>)
      out.push(list.ordered ? <ol key={out.length}>{items}</ol> : <ul key={out.length}>{items}</ul>)
    }
    para = []
    list = null
  }
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const item = /^([-*•]|\d+[.)])\s+(.*)$/.exec(line)
    if (!line) {
      flush()
    } else if (item) {
      const ordered = /\d/.test(item[1])
      if (para.length || (list && list.ordered !== ordered)) flush()
      list ??= { ordered, items: [] }
      list.items.push(item[2])
    } else {
      if (list) flush()
      para.push(line.replace(/^#+\s*/, ''))
    }
  }
  flush()
  return <>{out}</>
}

function inline(s: string): ReactNode[] {
  const parts: ReactNode[] = []
  let at = 0
  for (const m of s.matchAll(/\*\*(.+?)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g)) {
    if (m.index > at) parts.push(s.slice(at, m.index))
    parts.push(m[1] != null
      ? <strong key={m.index}>{m[1]}</strong>
      : <a key={m.index} href={m[3]} target="_blank" rel="noreferrer">{m[2]}</a>)
    at = m.index + m[0].length
  }
  parts.push(s.slice(at))
  return parts
}
