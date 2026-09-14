"use client"

import { useEffect, useMemo, useState, type ComponentType } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Clapperboard,
  Cloud,
  FileCode2,
  FileText,
  Files,
  FolderOpen,
  GraduationCap,
  History,
  ListTodo,
  LoaderCircle,
  Search,
  Sparkles,
} from "lucide-react"
import { listCloudProjects, type CloudProject, type CloudProjectTask } from "@/lib/atlas-cloud"

type Section = "overview" | "tasks" | "history" | "files"
type Filter = "active" | "paused" | "completed" | "all"
type IconType = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

const ICONS: Record<string, IconType> = {
  cloud: Cloud,
  book: BookOpen,
  film: Clapperboard,
  graduation: GraduationCap,
  folder: FolderOpen,
}

const STATUS = {
  active: { label: "Active", dot: "bg-emerald-500", pill: "bg-emerald-500/10 text-emerald-700" },
  paused: { label: "Paused", dot: "bg-amber-400", pill: "bg-amber-400/12 text-amber-700" },
  completed: { label: "Completed", dot: "bg-sky-500", pill: "bg-sky-500/10 text-sky-700" },
  archived: { label: "Archived", dot: "bg-slate-400", pill: "bg-slate-400/10 text-slate-600" },
} as const

const TASK_LABEL: Record<CloudProjectTask["status"], string> = {
  "in-progress": "In Progress",
  waiting: "Waiting",
  planned: "Planned",
  completed: "Completed",
  failed: "Failed",
  interrupted: "Interrupted",
}

function StatusPill({ project }: { project: CloudProject }) {
  const meta = STATUS[project.status]
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.pill}`}><span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />{meta.label}</span>
}

function Progress({ value }: { value: number }) {
  return <div className="h-1.5 overflow-hidden rounded-full bg-secondary"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} /></div>
}

function ProjectCard({ project, onOpen }: { project: CloudProject; onOpen: () => void }) {
  const Icon = ICONS[project.icon] || FolderOpen
  const activeTasks = project.tasks.filter((task) => !["completed", "failed"].includes(task.status)).length
  return (
    <button type="button" onClick={onOpen} className="group flex min-h-[260px] flex-col rounded-[1.6rem] border border-white/55 bg-white/55 p-5 text-left shadow-[0_18px_50px_-30px_rgba(45,90,145,0.6)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/80 hover:bg-white/68">
      <div className="flex items-start justify-between gap-3"><span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span><StatusPill project={project} /></div>
      <div className="mt-4"><p className="font-display text-xl font-semibold tracking-tight text-foreground">{project.name}</p><p className="mt-0.5 text-xs font-medium text-muted-foreground">{project.category}</p><p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground/85">{project.description}</p></div>
      <div className="mt-auto pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/65">Current focus</p><p className="mt-1 text-sm font-medium text-foreground/85">{project.currentFocus}</p>
        {typeof project.progress === "number" && <div className="mt-3"><div className="mb-1.5 flex justify-between text-[10px] text-muted-foreground"><span>Project pulse</span><span>{project.progress}%</span></div><Progress value={project.progress} /></div>}
        <div className="mt-4 flex items-center justify-between border-t border-border/45 pt-3 text-xs text-muted-foreground"><span>{activeTasks} active {activeTasks === 1 ? "task" : "tasks"}</span><span className="flex items-center gap-1 font-medium text-primary/80">Open <ArrowRight className="h-3.5 w-3.5 group-hover:translate-x-0.5" /></span></div>
      </div>
    </button>
  )
}

function SectionCard({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return <section className="rounded-[1.5rem] border border-white/55 bg-white/55 p-5 shadow-[0_16px_45px_-32px_rgba(45,90,145,0.55)] backdrop-blur-xl">{eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/65">{eyebrow}</p>}<h3 className={`${eyebrow ? "mt-1" : ""} font-display text-base font-semibold text-foreground`}>{title}</h3><div className="mt-4">{children}</div></section>
}

function TaskList({ tasks }: { tasks: CloudProjectTask[] }) {
  return <div className="space-y-2.5">{tasks.map((task) => <div key={task.id} className="rounded-2xl border border-border/45 bg-white/40 px-4 py-3"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium text-foreground/90">{task.title}</p>{task.detail && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{task.detail}</p>}</div><span className="shrink-0 rounded-full bg-secondary px-2 py-1 text-[10px] font-semibold text-muted-foreground">{TASK_LABEL[task.status]}</span></div>{typeof task.progress === "number" && task.status !== "completed" && <div className="mt-3 flex items-center gap-3"><div className="min-w-0 flex-1"><Progress value={task.progress} /></div><span className="w-8 text-right text-[10px] text-muted-foreground">{task.progress}%</span></div>}</div>)}</div>
}

function ProjectOverview({ project }: { project: CloudProject }) {
  const active = project.tasks.filter((task) => task.status !== "completed").slice(0, 3)
  return <div className="grid gap-4 xl:grid-cols-2">
    <SectionCard eyebrow="Right now" title="Current Focus"><div className="rounded-2xl bg-primary/[0.07] p-4"><p className="font-display text-lg font-semibold text-foreground">{project.currentFocus}</p><p className="mt-2 text-sm leading-relaxed text-muted-foreground">{project.description}</p><div className="mt-4"><StatusPill project={project} /></div></div></SectionCard>
    <SectionCard eyebrow="Alice's project model" title="Project Context"><div className="space-y-3">{project.context.length ? project.context.map((fact) => <div key={fact} className="flex gap-3 text-sm leading-relaxed text-foreground/78"><span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><Check className="h-3 w-3" /></span><p>{fact}</p></div>) : <p className="text-sm text-muted-foreground">No project context has been written to Atlas cloud yet.</p>}</div></SectionCard>
    <SectionCard eyebrow="Project tasks" title="Active Work">{active.length ? <TaskList tasks={active} /> : <p className="text-sm text-muted-foreground">Nothing active right now.</p>}</SectionCard>
    <SectionCard eyebrow="Project memory" title="Recent Changes"><div className="space-y-3">{project.history.slice(0, 4).map((item) => <div key={item.id} className="rounded-2xl bg-white/38 p-4"><p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/65">{new Date(item.happenedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</p><p className="mt-1 text-sm font-medium text-foreground/90">{item.title}</p>{item.detail && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>}</div>)}{project.history.length === 0 && <p className="text-sm text-muted-foreground">No history recorded yet.</p>}</div></SectionCard>
  </div>
}

function ProjectDetail({ project, onBack }: { project: CloudProject; onBack: () => void }) {
  const [section, setSection] = useState<Section>("overview")
  const Icon = ICONS[project.icon] || FolderOpen
  return <div className="themed-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 md:px-8 lg:px-10"><div className="mx-auto max-w-6xl">
    <button type="button" onClick={onBack} className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-white/50 hover:text-foreground"><ArrowLeft className="h-4 w-4" /> All projects</button>
    <section className="rounded-[1.8rem] border border-white/55 bg-white/55 p-5 shadow-[0_20px_55px_-32px_rgba(45,90,145,0.6)] backdrop-blur-xl md:p-6"><div className="flex items-start gap-4"><span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-primary/10 text-primary"><Icon className="h-6 w-6" /></span><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">{project.name}</h1><StatusPill project={project} /></div><p className="mt-1 text-sm text-muted-foreground">{project.category}</p><p className="mt-3 max-w-3xl text-sm leading-relaxed text-foreground/75">{project.description}</p></div></div></section>
    <div className="themed-scroll my-4 flex gap-1 overflow-x-auto rounded-full border border-white/50 bg-white/45 p-1.5 backdrop-blur-xl">{([['overview','Overview',Sparkles],['tasks','Tasks',ListTodo],['history','History',History],['files','Files',Files]] as Array<[Section,string,IconType]>).map(([id,label,TabIcon]) => <button key={id} type="button" onClick={() => setSection(id)} className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition ${section === id ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-white/55 hover:text-foreground"}`}><TabIcon className="h-3.5 w-3.5" />{label}</button>)}</div>
    {section === "overview" && <ProjectOverview project={project} />}
    {section === "tasks" && <div className="grid gap-4 lg:grid-cols-2">{(["in-progress","waiting","planned","completed","failed","interrupted"] as CloudProjectTask["status"][]).map((status) => { const tasks = project.tasks.filter((task) => task.status === status); return tasks.length ? <SectionCard key={status} title={TASK_LABEL[status]}><TaskList tasks={tasks} /></SectionCard> : null })}</div>}
    {section === "history" && <div className="mx-auto max-w-4xl"><SectionCard eyebrow="Chronological project memory" title="History"><div className="space-y-3">{project.history.map((item) => <div key={item.id} className="rounded-2xl bg-white/38 p-4"><p className="text-xs font-semibold text-muted-foreground">{new Date(item.happenedAt).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</p><p className="mt-1 text-sm font-medium text-foreground/90">{item.title}</p>{item.detail && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>}</div>)}</div></SectionCard></div>}
    {section === "files" && <div className="mx-auto max-w-4xl"><SectionCard eyebrow="Important references, not a file browser" title="Project Files"><div className="space-y-2.5">{project.files.map((file) => { const FileIcon = file.kind === "code" ? FileCode2 : FileText; return <div key={file.id} className="flex items-start gap-3 rounded-2xl border border-border/45 bg-white/40 p-4"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><FileIcon className="h-4 w-4" /></span><div><p className="break-all font-mono text-xs font-semibold text-foreground/90">{file.path}</p><p className="mt-1 text-xs leading-relaxed text-muted-foreground">{file.description}</p></div></div> })}{project.files.length === 0 && <p className="text-sm text-muted-foreground">No project files pinned yet.</p>}</div></SectionCard></div>}
  </div></div>
}

export function CloudProjectsView() {
  const [projects, setProjects] = useState<CloudProject[]>([])
  const [selected, setSelected] = useState<string | null>(null)
  const [filter, setFilter] = useState<Filter>("active")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try { const data = await listCloudProjects(); if (!cancelled) { setProjects(data); setError(null) } }
      catch { if (!cancelled) setError("Unlock Atlas cloud to load shared project state.") }
      finally { if (!cancelled) setLoading(false) }
    }
    void load()
    const timer = setInterval(() => void load(), 30_000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const visible = useMemo(() => projects.filter((project) => (filter === "all" || project.status === filter) && (!query.trim() || `${project.name} ${project.category} ${project.currentFocus}`.toLowerCase().includes(query.toLowerCase()))), [projects, filter, query])
  const project = projects.find((item) => item.id === selected)
  if (project) return <ProjectDetail project={project} onBack={() => setSelected(null)} />

  return <div className="themed-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-5 md:px-8 lg:px-10"><div className="mx-auto max-w-6xl">
    <div className="mb-5"><p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary/70">Shared project state</p><h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">Projects</h1><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">Project state now comes from Atlas cloud instead of this device, so Alice and every client can work from the same source of truth.</p></div>
    <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex flex-wrap gap-1 rounded-full border border-white/50 bg-white/45 p-1.5 backdrop-blur-xl">{(["active","paused","completed","all"] as Filter[]).map((item) => <button key={item} type="button" onClick={() => setFilter(item)} className={`rounded-full px-3 py-1.5 text-xs font-semibold capitalize transition ${filter === item ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-white/55"}`}>{item}</button>)}</div><label className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search projects" className="w-full rounded-full border border-white/55 bg-white/50 py-2 pl-9 pr-4 text-xs outline-none backdrop-blur-xl sm:w-56" /></label></div>
    {loading && <div className="flex items-center gap-2 text-sm text-muted-foreground"><LoaderCircle className="h-4 w-4 animate-spin" /> Loading projects…</div>}
    {error && !loading && <p className="rounded-2xl border border-border/50 bg-white/45 p-4 text-sm text-muted-foreground">{error}</p>}
    {!loading && !error && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{visible.map((item) => <ProjectCard key={item.id} project={item} onOpen={() => setSelected(item.id)} />)}{visible.length === 0 && <p className="text-sm text-muted-foreground">No projects match this view.</p>}</div>}
  </div></div>
}
