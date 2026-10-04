// LincLife: a guided chat that estimates how much life insurance a household needs.
// Flow: Home → Prepare → Mode (text or VR) → Chat with Abe, here or in a headset → Review → Results,
// routed by the URL hash.
import { useEffect, type ComponentType } from 'react'
import './kit/tokens.css'
import './kit/kit.css'
import './App.css'
import { Header } from './lib/Chrome.tsx'
import { useRoute, type Route } from './lib/store.ts'
import { Home } from './Home.tsx'
import { Prepare } from './intake/Prepare.tsx'
import { Chat } from './intake/Chat.tsx'
import { Mode } from './intake/Mode.tsx'
import { Vr } from './intake/Vr.tsx'
import { Review } from './intake/Review.tsx'
import { Results } from './results/Results.tsx'

const SCREENS: Record<Route, ComponentType> = { home: Home, prepare: Prepare, mode: Mode, chat: Chat, vr: Vr, review: Review, results: Results }
const TITLES: Record<Route, string> = { home: '', prepare: 'The basics', mode: 'Text or VR', chat: 'Chat', vr: 'Talk in VR', review: 'Check your answers', results: 'Your estimate' }

export default function App() {
  const route = useRoute()
  const Screen = SCREENS[route]

  useEffect(() => {
    document.title = TITLES[route] ? `${TITLES[route]} · LincLife` : 'LincLife'
  }, [route])

  return (
    <div className="app">
      <Header route={route} />
      <Screen />
    </div>
  )
}
