import { Bell, FileText, LayoutDashboard, LogOut, Plus, ShieldCheck, Users, Settings, ArrowUpRight } from "lucide-react"
import { useState } from "react"
import { UploadCard } from "@/components/UploadCard"
import { Button } from "@/components/ui/button"

const activity = [
  { name: "Notice of Hearing.pdf", status: "Evidence supports it", tone: "text-pine", date: "Today, 10:42 AM" },
  { name: "Collection letter.jpg", status: "Cannot confirm", tone: "text-amber-700", date: "Yesterday" },
  { name: "Court summons.pdf", status: "Scam warning signs", tone: "text-coral", date: "Jul 14, 2026" },
]

export function App() {
  const [showUpload, setShowUpload] = useState(false)
  return <div className="min-h-screen bg-[#f7f8f6] text-ink">
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-border bg-white p-5 lg:block">
      <div className="flex items-center gap-3 text-lg font-semibold"><span className="grid size-9 place-items-center rounded-xl bg-pine text-white">S</span>Served</div>
      <nav className="mt-10 space-y-1 text-sm"><a className="flex items-center gap-3 rounded-lg bg-pine/10 px-3 py-2 font-medium text-pine" href="#"><LayoutDashboard size={17}/> Dashboard</a><a className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted" href="#history"><FileText size={17}/> My documents</a><a className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted" href="#team"><Users size={17}/> Team</a><a className="flex items-center gap-3 rounded-lg px-3 py-2 text-muted-foreground hover:bg-muted" href="#settings"><Settings size={17}/> Settings</a></nav>
      <div className="absolute bottom-5 left-5 right-5"><button className="flex items-center gap-3 px-3 py-2 text-sm text-muted-foreground"><LogOut size={17}/> Sign out</button></div>
    </aside>
    <main className="lg:ml-64">
      <header className="flex items-center justify-between border-b border-border bg-white px-5 py-4 sm:px-8"><div><p className="text-sm text-muted-foreground">Good morning</p><h1 className="text-xl font-semibold">Your evidence dashboard</h1></div><div className="flex items-center gap-3"><button className="rounded-lg p-2 text-muted-foreground hover:bg-muted"><Bell size={19}/></button><div className="flex items-center gap-2 rounded-full border border-border bg-white py-1 pl-1 pr-3 text-sm"><span className="grid size-7 place-items-center rounded-full bg-pine text-xs text-white">YK</span> Yordanos</div></div></header>
      <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 sm:px-8">
        <div className="flex flex-wrap items-center justify-between gap-4"><div><h2 className="text-2xl font-semibold tracking-tight">Overview</h2><p className="mt-1 text-sm text-muted-foreground">Review letters and keep your next steps organized.</p></div><Button onClick={() => setShowUpload(true)}><Plus size={17}/> Analyze a document</Button></div>
        {showUpload && <div className="max-w-2xl"><UploadCard /></div>}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><div className="rounded-xl border border-border bg-white p-5"><p className="text-sm text-muted-foreground">Documents checked</p><p className="mt-2 text-3xl font-semibold">24</p><p className="mt-1 text-xs text-pine">+6 this month</p></div><div className="rounded-xl border border-border bg-white p-5"><p className="text-sm text-muted-foreground">Evidence supported</p><p className="mt-2 text-3xl font-semibold">15</p><p className="mt-1 text-xs text-pine">62.5% of total</p></div><div className="rounded-xl border border-border bg-white p-5"><p className="text-sm text-muted-foreground">Need review</p><p className="mt-2 text-3xl font-semibold">6</p><p className="mt-1 text-xs text-amber-700">Action recommended</p></div><div className="rounded-xl border border-border bg-white p-5"><p className="text-sm text-muted-foreground">Scam warnings</p><p className="mt-2 text-3xl font-semibold">3</p><p className="mt-1 text-xs text-coral">Handle with care</p></div></div>
        <section id="history" className="rounded-xl border border-border bg-white"><div className="flex items-center justify-between border-b border-border px-5 py-4"><div><h3 className="font-semibold">Recent documents</h3><p className="text-sm text-muted-foreground">Your latest analyses and recommendations.</p></div><a className="flex items-center gap-1 text-sm font-medium text-pine" href="#">View all <ArrowUpRight size={15}/></a></div><div className="divide-y divide-border">{activity.map((item) => <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4" key={item.name}><div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-muted"><FileText size={17}/></span><div><p className="text-sm font-medium">{item.name}</p><p className="text-xs text-muted-foreground">{item.date}</p></div></div><span className={`text-xs font-semibold ${item.tone}`}>{item.status}</span></div>)}</div></section>
        <div className="flex items-center gap-3 rounded-xl border border-pine/20 bg-pine/5 p-4 text-sm"><ShieldCheck className="text-pine" size={20}/><p><strong>Your privacy matters.</strong> Documents are encrypted and processed only for your analysis.</p></div>
      </div>
    </main>
  </div>
}
