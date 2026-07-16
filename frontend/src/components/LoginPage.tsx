import { useGoogleLogin } from "@react-oauth/google"
import { useState } from "react"

import { useAuth } from "@/AuthContext"
import { BrandMark } from "@/components/BrandMark"

export function LoginPage() {
  const { login } = useAuth()
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setLoading(true)
      try {
        await login(tokenResponse.access_token)
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      } finally {
        setLoading(false)
      }
    },
    onError: () => setError("Google sign-in failed. Please try again."),
  })

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-bg-base px-6">
      <div className="pointer-events-none absolute -top-40 -right-32 size-[34rem] rounded-full bg-brand-green/35 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-48 -left-40 size-[30rem] rounded-full bg-white/80 blur-3xl" />
      <div className="relative w-full max-w-md rounded-[28px] border border-white/80 bg-white/65 p-8 text-center shadow-[0_24px_80px_rgba(0,0,0,.12)] backdrop-blur-2xl sm:p-10">
        <div className="mb-7 flex justify-center">
          <BrandMark className="size-12" />
        </div>
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-[.2em] text-zinc-500">Secure workspace</p>
        <h1 className="font-display text-3xl font-medium tracking-[-.04em] text-[#1a1a1a]">Continue to Served</h1>
        <p className="mx-auto mt-3 max-w-xs text-sm leading-6 text-zinc-500">
          Sign in to review legal mail with evidence-backed analysis.
        </p>

        {error && (
          <div className="mt-5 rounded-xl border border-red-900/10 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={() => googleLogin()}
          disabled={loading}
          className="mt-7 inline-flex w-full items-center justify-center gap-3 rounded-full bg-[#1a1a1a] px-5 py-3.5 text-sm font-semibold text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-black disabled:opacity-50"
        >
          <svg className="size-5" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          {loading ? "Signing in..." : "Sign in with Google"}
        </button>
        <p className="mt-6 text-[11px] leading-5 text-zinc-400">Your document history stays tied to your verified Google account.</p>
      </div>
    </div>
  )
}
