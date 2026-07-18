/// <reference types="vite/client" />

type PlaidInstitution = { institution_id: string; name: string }

type PlaidLinkHandler = {
  open: () => void
  exit: (options?: { force?: boolean }) => void
  destroy: () => void
}

interface Window {
  Plaid?: {
    create: (options: {
      token: string
      onSuccess: (
        publicToken: string,
        metadata: { institution: PlaidInstitution | null },
      ) => void
      onExit: (error: { error_message?: string } | null) => void
    }) => PlaidLinkHandler
  }
}
