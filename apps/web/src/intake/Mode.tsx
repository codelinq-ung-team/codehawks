// After the Basics form: choose how to talk with Abe. Text keeps everything in this browser;
// VR pairs with the Quest app, where the conversation is spoken, and brings the answers back.
import { Icon, type IconName } from '../kit/Kit.tsx'
import { Page } from '../lib/Chrome.tsx'
import { go, type Route } from '../lib/store.ts'
import { GUIDE_NAME } from '../guide/guide.ts'
import { GuidePose } from '../guide/Poses.tsx'

const CHOICES: { route: Route; icon: IconName; title: string; text: string; points: string[] }[] = [
  {
    route: 'chat', icon: 'message', title: 'Text chat',
    text: `Type or tap your answers right here.`,
    points: ['Nothing to set up', 'Works on any phone or computer'],
  },
  {
    route: 'vr', icon: 'headset', title: 'VR voice chat',
    text: `Put on a Quest headset and talk with ${GUIDE_NAME} out loud.`,
    points: ['Scan a code to connect your headset', 'Your answers come back to this screen'],
  },
]

export function Mode() {
  return (
    <Page className="qform-screen">
      <section className="qform mode" aria-labelledby="mode-heading">
        <div className="qform__meta"><span>Basics done · One choice before the chat</span></div>
        <div className="mode__body">
          <div className="qform__head">
            <span className="qform__num" aria-hidden="true"><Icon name="check" size={18} weight={3} /></span>
            <GuidePose name="point" className="mode__guide" />
          </div>
          <h1 id="mode-heading" className="qform__prompt">How would you like to talk with {GUIDE_NAME}?</h1>
          <p className="qform__helper">He asks the same few follow-up questions either way, and you check every answer before any math.</p>

          <div className="mode__cards">
            {CHOICES.map((c) => (
              <button key={c.route} type="button" className="mode__card" onClick={() => go(c.route)}>
                <span className="mode__icon" aria-hidden="true"><Icon name={c.icon} size={26} /></span>
                <strong className="mode__title">{c.title}</strong>
                <span className="mode__text">{c.text}</span>
                <ul className="mode__points">
                  {c.points.map((p) => <li key={p}><Icon name="check" size={14} weight={3} />{p}</li>)}
                </ul>
                <span className="mode__go">Choose {c.title}<Icon name="chevron-right" size={16} weight={2.6} /></span>
              </button>
            ))}
          </div>
        </div>
        <div className="qform__actions mode__actions">
          <button type="button" className="link-button subhead" onClick={() => go('prepare')}>Back to the basics</button>
        </div>
      </section>
    </Page>
  )
}
