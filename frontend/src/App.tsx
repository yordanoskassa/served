import { GoogleOAuthProvider } from "@react-oauth/google"
import { RefreshCw, X } from "lucide-react"
import { useEffect, useState } from "react"

import { useAuth } from "@/AuthContext"
import { Dashboard } from "@/Dashboard"
import { Hero } from "@/components/Hero"
import { LoginPage } from "@/components/LoginPage"
import { Navbar } from "@/components/Navbar"
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

  const landing = <div className="min-h-screen bg-bg-base selection:bg-brand-green selection:text-black"><Navbar onGetStarted={() => setShowAuth(true)} /><main><Hero /></main></div>

  if (clientIdLoading) return landing
  if (!clientId) return <>{landing}{showAuth && <div className="fixed inset-0 z-[60] grid place-items-center bg-black/20 p-5 backdrop-blur-sm"><div className="relative w-full max-w-md rounded-2xl bg-bg-base p-8 text-center shadow-2xl"><button aria-label="Close" onClick={() => setShowAuth(false)} className="absolute top-4 right-4"><X size={18} /></button><RefreshCw className="mx-auto mb-4" size={22} /><p className="text-sm">{error || "Google sign-in is not configured."}</p></div></div>}</>

  return <GoogleOAuthProvider clientId={clientId}>
    {landing}
    {showAuth && <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/20 backdrop-blur-sm"><button aria-label="Close sign in" onClick={() => setShowAuth(false)} className="fixed top-5 right-5 z-[70] rounded-full bg-white/80 p-2"><X size={18} /></button><LoginPage /></div>}
  </GoogleOAuthProvider>
}
