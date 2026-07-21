import { GoogleOAuthProvider } from "@react-oauth/google"
import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { useAuth } from "@/AuthContext"
import { Dashboard } from "@/Dashboard"
import { Hero } from "@/components/Hero"
import { LoginPage } from "@/components/LoginPage"
import { Navbar } from "@/components/Navbar"
import { LandingDetails } from "@/components/LandingDetails"
import { LandingFooter } from "@/components/LandingFooter"
import { LandingPricing } from "@/components/LandingPricing"
import { LandingTrustBar } from "@/components/LandingTrustBar"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fetchGoogleClientId } from "@/lib/api"
import { entryLabel, type EntryIntent } from "@/lib/entry"

const ENTRY_STORAGE_KEY = "served_entry_intent"

function storedEntryIntent(): EntryIntent | null {
  try {
    const value = sessionStorage.getItem(ENTRY_STORAGE_KEY)
    return value === "D1" || value === "D2" || value === "D3" || value === "D4" || value === "upload" ? value : null
  } catch {
    return null
  }
}

export function App() {
  const { user, loading } = useAuth()
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientIdLoading, setClientIdLoading] = useState(true)
  const [showAuth, setShowAuth] = useState(false)
  const [mailboxOpen, setMailboxOpen] = useState(false)
  const [entryIntent, setEntryIntent] = useState<EntryIntent | null>(storedEntryIntent)
  const [demoIntent, setDemoIntent] = useState<Exclude<EntryIntent, "upload"> | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchGoogleClientId()
      .then((id) => setClientId(id || null))
      .catch(() => setError("Unable to connect to the authentication service."))
      .finally(() => setClientIdLoading(false))
  }, [])

  const consumeEntryIntent = useCallback(() => {
    setEntryIntent(null)
    try {
      sessionStorage.removeItem(ENTRY_STORAGE_KEY)
    } catch {
      // The in-memory intent still clears when storage is unavailable.
    }
  }, [])

  const openMailbox = useCallback((opts?: { scroll?: boolean }) => {
    setMailboxOpen(true)
    if (opts?.scroll === false) return

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    const behavior = reduceMotion ? "auto" : "smooth"
    const delay = reduceMotion ? 0 : 560

    window.setTimeout(() => {
      const stage = document.getElementById("mailbox-stage")
      if (!stage) return
      const rect = stage.getBoundingClientRect()
      const navOffset = 96
      const needsScroll = rect.top < navOffset || rect.bottom > window.innerHeight - 24
      if (!needsScroll) return
      stage.scrollIntoView({ behavior, block: "nearest" })
    }, delay)
  }, [])

  const openUploadAuth = useCallback(() => {
    setDemoIntent(null)
    setEntryIntent("upload")
    try {
      sessionStorage.setItem(ENTRY_STORAGE_KEY, "upload")
    } catch {
      // The current page can still complete the handoff without storage.
    }
    setShowAuth(true)
  }, [])

  const openJudgeDemo = useCallback(() => {
    setShowAuth(false)
    setEntryIntent(null)
    setDemoIntent("D4")
    try {
      sessionStorage.removeItem(ENTRY_STORAGE_KEY)
    } catch {
      // The demo can still open when session storage is unavailable.
    }
  }, [])

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Loading...</div>
  if (user) return <Dashboard initialIntent={entryIntent} onIntentConsumed={consumeEntryIntent} />
  if (demoIntent) return <Dashboard demoMode initialIntent={demoIntent} onExitDemo={openUploadAuth} onGoHome={() => setDemoIntent(null)} />

  const startEntry = (intent: EntryIntent) => {
    if (intent !== "upload") {
      setDemoIntent(intent)
      return
    }
    openUploadAuth()
  }
  const landing = (
    <div className="min-h-screen bg-background selection:bg-foreground selection:text-background">
      <Navbar onGetStarted={openMailbox} />
      <main>
        <Hero open={mailboxOpen} onOpen={openMailbox} onSelect={startEntry} />
        <LandingTrustBar />
        <LandingDetails onGetStarted={openMailbox} />
        <LandingPricing onGetStarted={openMailbox} />
      </main>
      <LandingFooter />
    </div>
  )

  if (clientIdLoading) return landing
  if (!clientId) return <Dialog open={showAuth} onOpenChange={setShowAuth}>{landing}<DialogContent><DialogHeader className="items-center text-center"><RefreshCw className="mb-2" size={22} /><DialogTitle>Sign-in unavailable</DialogTitle><DialogDescription>{error || "Google sign-in is not configured."}</DialogDescription></DialogHeader><Button type="button" variant="outline" onClick={openJudgeDemo}>Run judge demo without sign-in</Button></DialogContent></Dialog>

  return <GoogleOAuthProvider clientId={clientId}><Dialog open={showAuth} onOpenChange={setShowAuth}>{landing}<DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none"><DialogTitle className="sr-only">Sign in to Served</DialogTitle><DialogDescription className="sr-only">Google sign-in for {entryLabel(entryIntent)}, with a seeded judge demo available without sign-in.</DialogDescription><LoginPage destination={entryLabel(entryIntent)} onContinueDemo={openJudgeDemo} /></DialogContent></Dialog></GoogleOAuthProvider>
}
