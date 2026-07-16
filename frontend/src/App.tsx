import { GoogleOAuthProvider } from "@react-oauth/google"
import { RefreshCw } from "lucide-react"
import { useCallback, useEffect, useState } from "react"

import { useAuth } from "@/AuthContext"
import { Dashboard } from "@/Dashboard"
import { Hero } from "@/components/Hero"
import { LoginPage } from "@/components/LoginPage"
import { Navbar } from "@/components/Navbar"
import { LandingDetails } from "@/components/LandingDetails"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fetchGoogleClientId } from "@/lib/api"
import { entryLabel, type EntryIntent } from "@/lib/entry"

const ENTRY_STORAGE_KEY = "served_entry_intent"

function storedEntryIntent(): EntryIntent | null {
  try {
    const value = sessionStorage.getItem(ENTRY_STORAGE_KEY)
    return value === "D1" || value === "D2" || value === "D3" || value === "upload" ? value : null
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

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-bg-base text-sm">Loading...</div>
  if (user) return <Dashboard initialIntent={entryIntent} onIntentConsumed={consumeEntryIntent} />

  const openMailbox = () => {
    setMailboxOpen(true)
    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth"
    window.requestAnimationFrame(() => document.getElementById("mailbox-stage")?.scrollIntoView({ behavior, block: "center" }))
  }
  const startAuth = (intent: EntryIntent) => {
    setEntryIntent(intent)
    try {
      sessionStorage.setItem(ENTRY_STORAGE_KEY, intent)
    } catch {
      // The current page can still complete the handoff without storage.
    }
    setShowAuth(true)
  }
  const landing = <div className="min-h-screen bg-bg-base selection:bg-brand-green selection:text-black"><Navbar onGetStarted={openMailbox} /><main><Hero open={mailboxOpen} onOpen={openMailbox} onSelect={startAuth} /><LandingDetails onGetStarted={openMailbox} /></main></div>

  if (clientIdLoading) return landing
  if (!clientId) return <Dialog open={showAuth} onOpenChange={setShowAuth}>{landing}<DialogContent><DialogHeader className="items-center text-center"><RefreshCw className="mb-2" size={22} /><DialogTitle>Sign-in unavailable</DialogTitle><DialogDescription>{error || "Google sign-in is not configured."}</DialogDescription></DialogHeader></DialogContent></Dialog>

  return <GoogleOAuthProvider clientId={clientId}><Dialog open={showAuth} onOpenChange={setShowAuth}>{landing}<DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none"><DialogTitle className="sr-only">Sign in to Served</DialogTitle><DialogDescription className="sr-only">Sign in with Google to open {entryLabel(entryIntent)} in your evidence workspace.</DialogDescription><LoginPage destination={entryLabel(entryIntent)} /></DialogContent></Dialog></GoogleOAuthProvider>
}
