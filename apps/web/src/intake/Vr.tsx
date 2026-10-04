// Talk with Abe in VR: shows a QR code (and a code to type) that the Quest app reads to pair
// with this browser, and a short guide to using the headset. Once the headset joins, the
// answers Abe hears appear here as he learns them. When the conversation ends, they are
// handed back and this screen moves on to Review.
import { useEffect, useMemo, useState } from 'react'
import qrcode from 'qrcode-generator'
import { Banner, Button, Icon } from '../kit/Kit.tsx'
import { Page, Title } from '../lib/Chrome.tsx'
import { getState, go, setState, useStore } from '../lib/store.ts'
import { GUIDE_NAME } from '../guide/guide.ts'
import { Knows } from './Knows.tsx'
import { createPairing, qrText, readPairing, type Pairing, type Shared } from './pair.ts'

const POLL_MS = 2000

// One request at a time, however often the screen mounts (StrictMode mounts it twice).
let creating: Promise<Pairing | null> | null = null
function pair() {
  const s = getState()
  creating ??= createPairing(s.form, s.profile).finally(() => { creating = null })
  return creating
}

function Qr({ text }: { text: string }) {
  const path = useMemo(() => {
    const qr = qrcode(0, 'M')
    qr.addData(text, 'Alphanumeric')
    qr.make()
    const n = qr.getModuleCount()
    let d = ''
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (qr.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
    return { d, n }
  }, [text])
  // Four empty modules all round: scanners need the quiet border.
  return (
    <svg className="vr__qr" viewBox={`-4 -4 ${path.n + 8} ${path.n + 8}`} role="img" aria-label="QR code that pairs your headset" shapeRendering="crispEdges">
      <rect x={-4} y={-4} width={path.n + 8} height={path.n + 8} fill="#fff" />
      <path d={path.d} fill="#000" />
    </svg>
  )
}

// A hand pinching: thumb and index finger meeting, the gesture that selects in the headset.
function Pinch() {
  return (
    <svg className="vr__pinch" viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M30 26c2-8 6-14 10-13s3 7 0 14" />
      <path d="M30 26c-5-5-11-7-13-4s2 8 9 12" />
      <path d="M40 27c5 1 9 5 9 12 0 9-6 16-15 16-8 0-13-5-15-12-1-4 2-8 7-9" />
      <path d="M30 14v-5M22 16l-3-4M38 14l2-5" stroke="var(--highlight)" />
    </svg>
  )
}

const STEPS: { title: string; text: string }[] = [
  { title: 'Put on the headset and open LincLife', text: 'It starts looking for this code as soon as it opens.' },
  { title: 'Look at the code on this screen', text: 'Hold still for a moment about an arm’s length away. No luck? Choose “Enter a Code” in the headset and type the six digits.' },
  { title: 'Pinch to select', text: 'Point your hand at a button, then tap your thumb and index finger together. With controllers, point and pull the trigger.' },
  { title: `Just talk with ${GUIDE_NAME}`, text: 'He asks one question at a time. “Not sure” is always an answer, and you can ask “why?” any time.' },
]

export function Vr() {
  const state = useStore()
  const [shared, setShared] = useState<Shared | null>(null)
  const [failed, setFailed] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [now, setNow] = useState(() => Date.now())
  const id = state.vr?.id

  // Get a pairing for this browser, unless a reload left one in the session.
  useEffect(() => {
    if (getState().vr) return
    let stale = false
    void pair().then((made) => {
      if (stale) return
      if (made) setState({ vr: made, started: true })
      else setFailed(true)
    })
    return () => { stale = true }
  }, [attempt])

  // Watch for the headset joining, and then for the answers it saves.
  useEffect(() => {
    if (!id) return
    let stop = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      const r = await readPairing(id)
      if (stop) return
      setNow(Date.now())
      if (r === 'gone') {
        // Left open past two hours: start a new pairing with the answers this browser has.
        setShared(null)
        setState({ vr: null })
        setAttempt((a) => a + 1)
        return
      }
      if (r) {
        setShared(r)
        // Keep what Abe has heard so far, so switching to text chat carries on from there.
        if (r.status !== 'waiting') setState({ profile: r.profile, form: r.form })
        if (r.status === 'done') {
          setState({ vr: null })
          go('review')
          return
        }
      }
      timer = setTimeout(() => void tick(), POLL_MS)
    }
    void tick()
    return () => { stop = true; clearTimeout(timer) }
  }, [id])

  const retry = () => { setFailed(false); setAttempt((a) => a + 1) }
  const joined = shared != null && shared.status !== 'waiting'
  const vr = state.vr
  const code = vr && now < vr.codeUntil ? `${vr.code.slice(0, 3)} ${vr.code.slice(3)}` : null

  if (joined) {
    return (
      <Page className="vr">
        <Title sub={`${GUIDE_NAME} is talking with you in the headset. Your answers show up here as he hears them.`}>Your headset is connected</Title>
        <div className="vr__grid vr__grid--live">
          <Knows profile={state.profile} form={state.form} className="knows--live" />
          <aside className="vr__side">
            <Banner tone="success" title="Stay in the headset until he’s finished" message={`When ${GUIDE_NAME} says that’s everything, take the headset off. This screen will move on to checking your answers.`} />
            <Button variant="bordered" fullWidth icon="message" onClick={() => go('chat')}>Finish by Text Instead</Button>
          </aside>
        </div>
      </Page>
    )
  }

  return (
    <Page className="vr">
      <Title sub={`Scan this code with your headset to talk with ${GUIDE_NAME} out loud. Your answers come back to this screen when you’re done.`}>Talk with {GUIDE_NAME} in VR</Title>
      <div className="vr__grid">
        <section className="vr__pair" aria-label="Pair your headset">
          {vr ? (
            <>
              <Qr text={qrText(vr.id)} />
              {code && <p className="vr__code"><span className="footnote muted">Or type this code in the headset</span><strong>{code}</strong></p>}
              <p className="vr__status" role="status"><span className="vr__pulse" aria-hidden="true" />Waiting for your headset…</p>
            </>
          ) : failed ? (
            <Banner tone="warning" title="VR pairing isn’t available right now" message="We couldn’t set up a code for your headset. You can try again, or chat by text." action={{ label: 'Try Again', onClick: retry }} />
          ) : (
            <p className="vr__status" role="status"><span className="vr__pulse" aria-hidden="true" />Getting a code for your headset…</p>
          )}
        </section>

        <section className="vr__how" aria-labelledby="vr-how">
          <h2 id="vr-how" className="title-3">How it works</h2>
          <ol className="vr__steps">
            {STEPS.map((s, i) => (
              <li key={s.title}>
                <span className="vr__num" aria-hidden="true">{i + 1}</span>
                <div>
                  <strong>{s.title}</strong>
                  <span>{s.text}</span>
                </div>
                {i === 2 && <Pinch />}
              </li>
            ))}
          </ol>
          <p className="vr__note caption-1 muted"><Icon name="shield" size={14} />To pair, your answers are held on our server for up to two hours, then deleted. With text chat they stay in this browser.</p>
          <Button variant="bordered" icon="message" onClick={() => go('chat')}>Chat by Text Instead</Button>
        </section>
      </div>
    </Page>
  )
}
