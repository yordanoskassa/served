import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react"

import { type UserProfile, verifyGoogleToken } from "@/lib/api"

type AuthState = {
  user: UserProfile | null
  credential: string | null
  loading: boolean
  login: (credential: string) => Promise<void>
  logout: () => void
}

const AuthContext = createContext<AuthState>({
  user: null,
  credential: null,
  loading: true,
  login: async () => {},
  logout: () => {},
})

const STORAGE_KEY = "served_auth"

type StoredAuth = {
  credential: string
  user: UserProfile
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile | null>(null)
  const [credential, setCredential] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      try {
        const parsed: StoredAuth = JSON.parse(stored)
        setUser(parsed.user)
        setCredential(parsed.credential)
      } catch {
        localStorage.removeItem(STORAGE_KEY)
      }
    }
    setLoading(false)
  }, [])

  const login = useCallback(async (token: string) => {
    const profile = await verifyGoogleToken(token)
    const auth: StoredAuth = { credential: token, user: profile }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(auth))
    setUser(profile)
    setCredential(token)
  }, [])

  const logout = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY)
    setUser(null)
    setCredential(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, credential, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
