import { GoogleOAuthProvider } from "@react-oauth/google"
import { RefreshCw } from "lucide-react"
import { useEffect, useState } from "react"

import { useAuth } from "@/AuthContext"
import { Dashboard } from "@/Dashboard"
import { LoginPage } from "@/components/LoginPage"
import { fetchGoogleClientId } from "@/lib/api"

export function App() {
  const { user, loading } = useAuth()
  const [clientId, setClientId] = useState<string | null>(null)
  const [clientIdLoading, setClientIdLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    fetchGoogleClientId()
      .then((id) => {
        if (id) {
          setClientId(id)
        } else {
          setError("Authentication is not configured. Please contact the administrator.")
        }
      })
      .catch(() => setError("Unable to connect to the server. Please try again later."))
      .finally(() => setClientIdLoading(false))
  }, [])

  useEffect(() => {
    if (!clientIdLoading && !clientId) {
      localStorage.removeItem("served_auth")
    }
  }, [clientIdLoading, clientId])

  if (loading || clientIdLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8f6]">
        <p className="text-sm text-muted-foreground">Loading...</p>
      </div>
    )
  }

  if (error || !clientId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#f7f8f6] px-6">
        <div className="w-full max-w-sm rounded-2xl border border-border bg-white p-8 text-center">
          <div className="mb-6 flex justify-center">
            <span className="grid size-12 place-items-center rounded-xl bg-pine text-xl font-semibold text-white">S</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight text-ink">Something went wrong</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {error || "Unable to load. Please try again later."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-full bg-pine px-5 py-2.5 text-sm text-white transition-colors hover:bg-pine/90"
          >
            <RefreshCw className="size-3.5" />
            Retry
          </button>
        </div>
      </div>
    )
  }

  return (
    <GoogleOAuthProvider clientId={clientId}>
      {user ? <Dashboard /> : <LoginPage />}
    </GoogleOAuthProvider>
  )
}
