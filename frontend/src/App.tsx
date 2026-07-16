import { GoogleOAuthProvider } from "@react-oauth/google"
import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"

import { useAuth } from "@/AuthContext"
import { Dashboard } from "@/Dashboard"
import { Hero } from "@/components/Hero"
import { LoginPage } from "@/components/LoginPage"
import { Navbar } from "@/components/Navbar"
import { LandingDetails } from "@/components/LandingDetails"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { fetchGoogleClientId } from "@/lib/api"

export function App() {
  const { user, loading } = useAuth()
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientIdLoading, setClientIdLoading] = useState(true)
  const [showAuth, setShowAuth] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchGoogleClientId()
      .then((id) => setClientId(id || null))
      .catch(() => setError("Unable to connect to the authentication service."))
      .finally(() => setClientIdLoading(false))
  }, [])

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-bg-base text-sm">Loading...</div>
  if (user) return <Dashboard />

  const startAuth = () => setShowAuth(true)
  const landing = <div className="min-h-screen bg-bg-base selection:bg-brand-green selection:text-black"><Navbar onGetStarted={startAuth} /><main><Hero onGetStarted={startAuth} /><LandingDetails onGetStarted={startAuth} /></main></div>

  if (clientIdLoading) return landing
  if (!clientId) return <Dialog open={showAuth} onOpenChange={setShowAuth}>{landing}<DialogContent><DialogHeader className="items-center text-center"><RefreshCw className="mb-2" size={22} /><DialogTitle>Sign-in unavailable</DialogTitle><DialogDescription>{error || "Google sign-in is not configured."}</DialogDescription></DialogHeader></DialogContent></Dialog>

  return <GoogleOAuthProvider clientId={clientId}><Dialog open={showAuth} onOpenChange={setShowAuth}>{landing}<DialogContent className="max-w-md border-0 bg-transparent p-0 shadow-none"><DialogTitle className="sr-only">Sign in to Served</DialogTitle><DialogDescription className="sr-only">Sign in with Google to open your evidence workspace.</DialogDescription><LoginPage /></DialogContent></Dialog></GoogleOAuthProvider>
}
