// LinqLife: a guided chat that estimates how much life insurance a household needs.
// Flow: Home → Prepare → Chat (with Abe) → Review → Results, routed by the URL hash.
import { useEffect, type ComponentType } from 'react'
import './kit/tokens.css'
import './kit/kit.css'
import './App.css'
import { Header } from './lib/Chrome.tsx'
import { useRoute, type Route } from './lib/store.ts'
import { Home } from './Home.tsx'
import { Prepare } from './intake/Prepare.tsx'
import { Chat } from './intake/Chat.tsx'
import { Review } from './intake/Review.tsx'
import { Results } from './results/Results.tsx'

const SCREENS: Record<Route, ComponentType> = { home: Home, prepare: Prepare, chat: Chat, review: Review, results: Results }
const TITLES: Record<Route, string> = { home: '', prepare: 'Connect with Plaid', chat: 'Chat', review: 'Check your answers', results: 'Your estimate' }

export default function App() {
  const route = useRoute()
  const Screen = SCREENS[route]

  useEffect(() => {
    document.title = TITLES[route] ? `${TITLES[route]} · LinqLife` : 'LinqLife'
  }, [route])

  return (
    <div className="app">
      <Header route={route} />
      <Screen />
    </div>
  )
}
