const LINK_TOKEN_KEY = "served_plaid_link_token"
const LINK_ANALYSIS_KEY = "served_plaid_analysis_id"

type PlaidInstitution = { institution_id: string; name: string }

export function plaidOAuthReturnUrl(): URL | null {
  if (typeof window === "undefined") return null
  const url = new URL(window.location.href)
  if (!url.searchParams.has("oauth_state_id")) return null
  return url
}

export function clearPlaidOAuthQueryParams(): void {
  const url = plaidOAuthReturnUrl()
  if (!url) return
  url.searchParams.delete("oauth_state_id")
  const next = `${url.pathname}${url.search}${url.hash}`
  window.history.replaceState({}, "", next || url.pathname)
}

function waitForPlaidScript(timeoutMs = 12_000): Promise<typeof window.Plaid> {
  return new Promise((resolve, reject) => {
    const started = Date.now()
    const tick = () => {
      if (window.Plaid) {
        resolve(window.Plaid)
        return
      }
      if (Date.now() - started > timeoutMs) {
        reject(new Error("Plaid Link did not load. Refresh and try again."))
        return
      }
      window.setTimeout(tick, 50)
    }
    tick()
  })
}

export async function openPlaidLink(options: {
  fetchLinkToken: () => Promise<string>
  onSuccess: (publicToken: string, institution: PlaidInstitution | null) => void | Promise<void>
  onExit?: (message: string | null) => void
  analysisIdForLegacyApi?: string | null
}): Promise<void> {
  const Plaid = await waitForPlaidScript()
  const oauthReturn = plaidOAuthReturnUrl()
  let linkToken = sessionStorage.getItem(LINK_TOKEN_KEY)

  if (!linkToken && !oauthReturn) {
    linkToken = await options.fetchLinkToken()
    sessionStorage.setItem(LINK_TOKEN_KEY, linkToken)
    if (options.analysisIdForLegacyApi) {
      sessionStorage.setItem(LINK_ANALYSIS_KEY, options.analysisIdForLegacyApi)
    } else {
      sessionStorage.removeItem(LINK_ANALYSIS_KEY)
    }
  }

  if (!linkToken) {
    throw new Error("Plaid Link session expired. Close this tab and connect again from Settings.")
  }

  await new Promise<void>((resolve, reject) => {
    if (!Plaid) {
      options.onExit?.("Plaid Link did not load.")
      resolve()
      return
    }
    let handler: PlaidLinkHandler | null = null
    handler = Plaid.create({
      token: linkToken!,
      ...(oauthReturn ? { receivedRedirectUri: oauthReturn.href } : {}),
      onSuccess: (publicToken, metadata) => {
        void Promise.resolve(options.onSuccess(publicToken, metadata.institution))
          .then(resolve)
          .catch(reject)
          .finally(() => {
            sessionStorage.removeItem(LINK_TOKEN_KEY)
            sessionStorage.removeItem(LINK_ANALYSIS_KEY)
            clearPlaidOAuthQueryParams()
            handler?.destroy()
          })
      },
      onExit: (linkError) => {
        if (!oauthReturn) sessionStorage.removeItem(LINK_TOKEN_KEY)
        const message = linkError?.error_message ?? null
        options.onExit?.(message)
        handler?.destroy()
        resolve()
      },
    })
    handler.open()
  })
}

export function storedPlaidLinkAnalysisId(): string | null {
  if (typeof window === "undefined") return null
  return sessionStorage.getItem(LINK_ANALYSIS_KEY)
}

/** Resume Plaid Link after an OAuth redirect (first launch must omit receivedRedirectUri). */
export async function resumePlaidOAuthIfNeeded(options: {
  fetchLinkToken: () => Promise<string>
  onSuccess: (publicToken: string, institution: PlaidInstitution | null) => void | Promise<void>
  onExit?: (message: string | null) => void
  analysisIdForLegacyApi?: string | null
}): Promise<boolean> {
  if (!plaidOAuthReturnUrl()) return false
  if (!sessionStorage.getItem(LINK_TOKEN_KEY)) {
    clearPlaidOAuthQueryParams()
    options.onExit?.("Plaid Link session expired after bank sign-in. Connect again from Settings.")
    return true
  }
  await openPlaidLink({
    ...options,
    analysisIdForLegacyApi: options.analysisIdForLegacyApi ?? storedPlaidLinkAnalysisId(),
  })
  return true
}
