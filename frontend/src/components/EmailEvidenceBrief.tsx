import { Check, FileText, LockKeyhole, Mail, Send } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import { useAuth } from "@/AuthContext"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { emailEvidenceBrief } from "@/lib/api"

type SendState = "idle" | "sending" | "sent" | "error"

export function EmailEvidenceBrief({ analysisId, documentName, compact = false }: {
  analysisId: string
  documentName?: string
  compact?: boolean
}) {
  const { credential, user } = useAuth()
  const [open, setOpen] = useState(false)
  const [sendState, setSendState] = useState<SendState>("idle")
  const [error, setError] = useState<string | null>(null)
  const [recipient, setRecipient] = useState(user?.email ?? "")
  const requestController = useRef<AbortController | null>(null)

  useEffect(() => () => requestController.current?.abort(), [])

  const sendBrief = async () => {
    if (!credential || sendState === "sending") return
    requestController.current?.abort()
    const controller = new AbortController()
    requestController.current = controller
    setSendState("sending")
    setError(null)
    try {
      const response = await emailEvidenceBrief(analysisId, credential, controller.signal)
      if (requestController.current !== controller) return
      setRecipient(response.recipient)
      setSendState("sent")
    } catch (cause) {
      if (controller.signal.aborted || requestController.current !== controller) return
      setError(cause instanceof Error ? cause.message : "The evidence brief could not be sent.")
      setSendState("error")
    } finally {
      if (requestController.current === controller) requestController.current = null
    }
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    if (!nextOpen && sendState === "sending") {
      requestController.current?.abort()
      requestController.current = null
      setSendState("idle")
    }
  }

  return <Dialog open={open} onOpenChange={handleOpenChange}>
    <DialogTrigger asChild>
      <Button type="button" variant="outline" className={compact ? "px-4 py-2 text-xs" : undefined}><Mail size={16} /> Email me the evidence brief</Button>
    </DialogTrigger>
    <DialogContent className="max-w-xl shadow-none">
      {sendState === "sent" ? <>
        <div className="grid size-11 place-items-center rounded-full bg-brand-soft"><Check size={20} aria-hidden="true" /></div>
        <DialogHeader>
          <DialogTitle>Evidence brief sent</DialogTitle>
          <DialogDescription>
            A copy was sent to <strong className="font-semibold text-zinc-700">{recipient}</strong>. You can forward it intentionally to an attorney, bookkeeper, or trusted adviser.
          </DialogDescription>
        </DialogHeader>
        <Alert className="rounded-2xl border-black/10 bg-white/60">
          <FileText size={16} aria-hidden="true" />
          <AlertTitle>Informational handoff only</AlertTitle>
          <AlertDescription>This brief is not legal advice, a court filing, or proof that the original document is authentic.</AlertDescription>
        </Alert>
        <DialogFooter><DialogClose asChild><Button type="button">Done</Button></DialogClose></DialogFooter>
      </> : <>
        <DialogHeader>
          <div className="mb-2 grid size-11 place-items-center rounded-full bg-brand-soft"><Mail size={19} aria-hidden="true" /></div>
          <DialogTitle>Email your evidence brief</DialogTitle>
          <DialogDescription>
            Send the saved facts, evidence references, limitations, code-decided result, and official next step for {documentName ? <strong className="font-semibold text-zinc-700">{documentName}</strong> : "this analysis"}.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-2xl border border-black/10 bg-white/60 p-4">
          <div className="flex items-start gap-3">
            <LockKeyhole className="mt-0.5 shrink-0 text-zinc-500" size={16} aria-hidden="true" />
            <div>
              <p className="text-sm font-semibold">Sent only to your signed-in account</p>
              <p className="mt-1 break-all text-sm text-zinc-600">{user?.email}</p>
              <p className="mt-2 text-xs leading-5 text-zinc-500">There is no open recipient field. Served never sends to an address printed on the uploaded letter.</p>
            </div>
          </div>
        </div>

        <Alert className="rounded-2xl border-amber-200 bg-amber-50 text-amber-950">
          <FileText size={16} aria-hidden="true" />
          <AlertTitle>The original letter is not attached</AlertTitle>
          <AlertDescription className="text-amber-900/75">Served does not retain uploaded file bytes. The email contains the saved structured analysis and source links. It is informational, not legal advice or a court filing.</AlertDescription>
        </Alert>

        {sendState === "error" && <Alert variant="destructive" className="rounded-2xl bg-red-50">
          <AlertTitle>Email not sent</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>}

        <DialogFooter>
          <DialogClose asChild><Button type="button" variant="outline">Cancel</Button></DialogClose>
          <Button type="button" onClick={() => { void sendBrief() }} disabled={!credential || sendState === "sending"}>
            <Send size={15} aria-hidden="true" /> {sendState === "sending" ? "Sending…" : sendState === "error" ? "Try again" : "Send evidence brief"}
          </Button>
        </DialogFooter>
      </>}
    </DialogContent>
  </Dialog>
}
