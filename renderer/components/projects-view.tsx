"use client"

import { useMemo, useState, type ComponentType } from "react"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Circle,
  Clapperboard,
  Cloud,
  Code2,
  FileCode2,
  FileText,
  Files,
  FolderOpen,
  GraduationCap,
  History,
  ListTodo,
  Pause,
  Plus,
  Search,
  Sparkles,
} from "lucide-react"

type ProjectStatus = "active" | "paused" | "completed" | "archived"
type ProjectSection = "overview" | "tasks" | "history" | "files"
type ProjectFilter = "active" | "paused" | "completed" | "all"
type ProjectIcon = ComponentType<{ className?: string; "aria-hidden"?: boolean }>

interface ProjectTask {
  id: string
  title: string
  status: "in-progress" | "waiting" | "planned" | "completed"
  progress?: number
  detail?: string
}

interface ProjectHistoryGroup {
  date: string
  items: Array<{ title: string; detail?: string }>
}

interface ProjectFile {
  path: string
  description: string
  kind: "code" | "document"
  note?: string
}

interface Project {
  id: string
  name: string
  category: string
  description: string
  status: ProjectStatus
  focus: string
  activeTasks: number
  updated: string
  progress?: number
  icon: ProjectIcon
  context: string[]
  tasks: ProjectTask[]
  history: ProjectHistoryGroup[]
  files: ProjectFile[]
}

const PROJECTS: Project[] = [
  {
    id: "atlas",
    name: "ATLAS",
    category: "Personal AI Assistant",
    description: "Alice's local-first assistant system, memory architecture, tools, voice, and cross-device interface.",
    status: "active",
    focus: "Mac & iOS PWA interface",
    activeTasks: 3,
    updated: "Today",
    progress: 68,
    icon: Cloud,
    context: [
      "Alice is the assistant identity running on the ATLAS system.",
      "The Windows PC is the primary host for the backend, local models, memory, and voice services.",
      "Mac and iOS clients reuse the same renderer and connect back to the host through Tailscale.",
      "The visual language uses sky, sunlight, and a central cloud avatar rather than a conventional dashboard assistant.",
      "High-impact actions should require a second verification step before execution.",
    ],
    tasks: [
      {
        id: "pwa-shell",
        title: "Mac / iOS PWA shell",
        status: "in-progress",
        progress: 68,
        detail: "Shared renderer, remote bridge, offline state, and responsive UI prototyping.",
      },
      {
        id: "project-ui",
        title: "Project workspace UI",
        status: "in-progress",
        progress: 35,
        detail: "Design the project overview, context, work, history, and file surfaces.",
      },
      {
        id: "device-presence",
        title: "Connected-device presence",
        status: "planned",
        detail: "Expose PC, Mac, phone, and future watch status to the Devices page.",
      },
      {
        id: "task-runtime",
        title: "Background task runtime",
        status: "planned",
        detail: "Support long-running, deeply tested work with progress and checkpoints.",
      },
      {
        id: "conversation-history",
        title: "Conversation history",
        status: "completed",
        progress: 100,
        detail: "Persistent conversation list and resume flow in the renderer.",
      },
    ],
    history: [
      {
        date: "Today",
        items: [
          {
            title: "Projects workspace prototype started",
            detail: "Replaced the placeholder Projects page with an interactive UI-first workspace.",
          },
          {
            title: "Navigation updated",
            detail: "The primary tabs now reflect Home, Conversations, Projects, Tasks, Devices, and Settings.",
          },
          {
            title: "PWA development path stabilized",
            detail: "Separated development behavior from production service-worker caching and fixed static manifest export.",
          },
        ],
      },
      {
        date: "Sep 14",
        items: [
          {
            title: "Mac / iOS client shell added",
            detail: "The browser bridge now mirrors the Electron atlasBridge API and reconnects to the Windows host.",
          },
          {
            title: "Tailscale host configured in the client",
            detail: "The prototype knows the Windows host and Atlas backend port while remaining usable offline.",
          },
        ],
      },
    ],
    files: [
      {
        path: "renderer/components/atlas-app.tsx",
        description: "Shared application shell and top-level view switching.",
        kind: "code",
        note: "Core UI",
      },
      {
        path: "renderer/lib/web-atlas-bridge.ts",
        description: "Browser-side implementation of the Electron-compatible Atlas bridge.",
        kind: "code",
        note: "PWA connection",
      },
      {
        path: "backend/src/server.js",
        description: "Atlas HTTP and WebSocket server used by Electron and remote clients.",
        kind: "code",
        note: "Backend entry",
      },
      {
        path: "docs/PWA_SETUP.md",
        description: "Mac/iOS development and Tailscale connection notes.",
        kind: "document",
        note: "Setup guide",
      },
    ],
  },
  {
    id: "bindex",
    name: "Bindex",
    category: "Pokémon TCG Collection",
    description: "Collection tracking, binder layouts, owned-card pricing, and Collector+ account features.",
    status: "active",
    focus: "Collection and pricing pipeline",
    activeTasks: 1,
    updated: "Recently",
    progress: 54,
    icon: BookOpen,
    context: [
      "Bindex tracks a Pokémon TCG collection across desktop and PWA clients.",
      "Owned-card pricing is refreshed from external card data on a scheduled cadence.",
      "Collector+ supports monthly and annual subscription states.",
    ],
    tasks: [
      { id: "pricing", title: "Owned-card price refresh", status: "in-progress", progress: 54 },
      { id: "binder", title: "Binder layout polish", status: "planned" },
      { id: "auth", title: "Supabase authentication", status: "completed", progress: 100 },
    ],
    history: [
      {
        date: "Recent",
        items: [
          { title: "Pricing pipeline refined", detail: "Refresh work is focused on owned cards rather than the full catalog." },
          { title: "Collector+ billing connected", detail: "Subscription state is synchronized through Stripe webhooks." },
        ],
      },
    ],
    files: [
      { path: "Bindex application", description: "Project files are not linked into this prototype yet.", kind: "document" },
    ],
  },
  {
    id: "short-films",
    name: "Short Films",
    category: "Writing & Film",
    description: "Story development, screenwriting, thematic exploration, and future film production work.",
    status: "paused",
    focus: "Story refinement and reflection",
    activeTasks: 0,
    updated: "A few days ago",
    icon: Clapperboard,
    context: [
      "Story work is treated as an evolving creative project rather than disposable chat context.",
      "Unsent Letters (送れない手紙) is one of the established stories in the collection.",
      "Character psychology and thematic intent should remain consistent across revisions.",
    ],
    tasks: [
      { id: "unsent-revision", title: "Unsent Letters revision", status: "waiting", progress: 72 },
      { id: "identity-story", title: "Artificial Individuality story concept", status: "planned" },
    ],
    history: [
      {
        date: "Recent",
        items: [
          { title: "Unsent Letters interaction revised", detail: "The central exchange shifted toward reflection through an outside perspective." },
        ],
      },
    ],
    files: [
      { path: "okurenai_tegami_script.docx", description: "Canonical surviving screenplay for Unsent Letters.", kind: "document", note: "Reference" },
    ],
  },
  {
    id: "cs445",
    name: "CS 445",
    category: "Artificial Intelligence",
    description: "Fall 2026 AI course project centered on ATLAS, Alice, and progressively more autonomous capabilities.",
    status: "active",
    focus: "Build toward the October progress milestone",
    activeTasks: 2,
    updated: "This week",
    progress: 30,
    icon: GraduationCap,
    context: [
      "ATLAS is the individual semester project for CS 445.",
      "Cross-device access, task management, memory stability, and sandboxed self-improvement are core project goals.",
      "The final demo should make Alice feel like a coherent assistant rather than a collection of disconnected features.",
    ],
    tasks: [
      { id: "progress", title: "Progress milestone", status: "in-progress", progress: 30, detail: "Prepare demonstrable progress for the October checkpoint." },
      { id: "demo", title: "Cross-device demo", status: "in-progress", progress: 45 },
      { id: "final", title: "Final presentation", status: "planned" },
    ],
    history: [
      {
        date: "Semester",
        items: [
          { title: "Project proposal approved", detail: "ATLAS selected as the individual AI project." },
        ],
      },
    ],
    files: [
      { path: "ATLAS project materials", description: "Course-specific files will be linked when the Projects backend is connected.", kind: "document" },
    ],
  },
]

const STATUS_META: Record<ProjectStatus, { label: string; dot: string; pill: string }> = {
  active: {
    label: "Active",
    dot: "bg-emerald-500",
    pill: "bg-emerald-500/10 text-emerald-700",
  },
  paused: {
    label: "Paused",
    dot: "bg-amber-400",
    pill: "bg-amber-400/12 text-amber-700",
  },
  completed: {
    label: "Completed",
    dot: "bg-sky-500",
    pill: "bg-sky-500/10 text-sky-700",
  },
  archived: {
    label: "Archived",
    dot: "bg-slate-400",
    pill: "bg-slate-400/10 text-slate-600",
  },
}

const TASK_META: Record<ProjectTask["status"], { label: string; className: string }> = {
  "in-progress": { label: "In Progress", className: "bg-primary/10 text-primary" },
  waiting: { label: "Waiting", className: "bg-amber-400/15 text-amber-700" },
  planned: { label: "Planned", className: "bg-secondary text-muted-foreground" },
  completed: { label: "Completed", className: "bg-emerald-500/10 text-emerald-700" },
}

const SECTION_ITEMS: Array<{ id: ProjectSection; label: string; icon: ProjectIcon }> = [
  { id: "overview", label: "Overview", icon: Sparkles },
  { id: "tasks", label: "Tasks", icon: ListTodo },
  { id: "history", label: "History", icon: History },
  { id: "files", label: "Files", icon: Files },
]

function StatusPill({ status }: { status: ProjectStatus }) {
  const meta = STATUS_META[status]
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${meta.pill}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${meta.dot}`} />
      {meta.label}
    </span>
  )
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
      <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  )
}

function ProjectCard({ project, onOpen }: { project: Project; onOpen: () => void }) {
  const Icon = project.icon

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex min-h-[260px] flex-col rounded-[1.6rem] border border-white/55 bg-white/55 p-5 text-left shadow-[0_18px_50px_-30px_rgba(45,90,145,0.6)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-white/80 hover:bg-white/68 hover:shadow-[0_22px_55px_-28px_rgba(45,90,145,0.7)]"
    >
      <div className="flex items-start justify-between gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>
        <StatusPill status={project.status} />
      </div>

      <div className="mt-4">
        <p className="font-display text-xl font-semibold tracking-tight text-foreground">{project.name}</p>
        <p className="mt-0.5 text-xs font-medium text-muted-foreground">{project.category}</p>
        <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-muted-foreground/85">{project.description}</p>
      </div>

      <div className="mt-auto pt-5">
        <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/65">Current focus</p>
        <p className="mt-1 text-sm font-medium text-foreground/85">{project.focus}</p>

        {typeof project.progress === "number" && (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between text-[10px] font-medium text-muted-foreground">
              <span>Project pulse</span>
              <span>{project.progress}%</span>
            </div>
            <ProgressBar value={project.progress} />
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-border/45 pt-3 text-xs text-muted-foreground">
          <span>{project.activeTasks} active {project.activeTasks === 1 ? "task" : "tasks"}</span>
          <span className="flex items-center gap-1 font-medium text-primary/80">
            Open <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
          </span>
        </div>
      </div>
    </button>
  )
}

function SectionCard({ title, eyebrow, children }: { title: string; eyebrow?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-[1.5rem] border border-white/55 bg-white/55 p-5 shadow-[0_16px_45px_-32px_rgba(45,90,145,0.55)] backdrop-blur-xl">
      {eyebrow && <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground/65">{eyebrow}</p>}
      <h3 className={`${eyebrow ? "mt-1" : ""} font-display text-base font-semibold text-foreground`}>{title}</h3>
      <div className="mt-4">{children}</div>
    </section>
  )
}

function TaskList({ tasks, compact = false }: { tasks: ProjectTask[]; compact?: boolean }) {
  return (
    <div className="space-y-2.5">
      {tasks.map((task) => {
        const meta = TASK_META[task.status]
        return (
          <div key={task.id} className="rounded-2xl border border-border/45 bg-white/40 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground/90">{task.title}</p>
                {!compact && task.detail && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{task.detail}</p>}
              </div>
              <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${meta.className}`}>{meta.label}</span>
            </div>
            {typeof task.progress === "number" && task.status !== "completed" && (
              <div className="mt-3 flex items-center gap-3">
                <div className="min-w-0 flex-1"><ProgressBar value={task.progress} /></div>
                <span className="w-8 text-right text-[10px] font-medium text-muted-foreground">{task.progress}%</span>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ProjectOverview({ project }: { project: Project }) {
  const activeWork = project.tasks.filter((task) => task.status !== "completed").slice(0, 3)
  const recent = project.history.flatMap((group) => group.items.map((item) => ({ ...item, date: group.date }))).slice(0, 4)

  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <SectionCard eyebrow="Right now" title="Current Focus">
        <div className="rounded-2xl bg-primary/[0.07] p-4">
          <p className="font-display text-lg font-semibold text-foreground">{project.focus}</p>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{project.description}</p>
          <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <StatusPill status={project.status} />
            <span className="rounded-full bg-white/60 px-2.5 py-1">Updated {project.updated.toLowerCase()}</span>
          </div>
        </div>
      </SectionCard>

      <SectionCard eyebrow="Alice's project model" title="Project Context">
        <div className="space-y-3">
          {project.context.map((fact) => (
            <div key={fact} className="flex gap-3 text-sm leading-relaxed text-foreground/78">
              <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Check className="h-3 w-3" aria-hidden="true" />
              </span>
              <p>{fact}</p>
            </div>
          ))}
        </div>
      </SectionCard>

      <SectionCard eyebrow="Project tasks" title="Active Work">
        {activeWork.length ? <TaskList tasks={activeWork} compact /> : <p className="text-sm text-muted-foreground">Nothing active right now.</p>}
      </SectionCard>

      <SectionCard eyebrow="Project memory" title="Recent Changes">
        <div className="space-y-4">
          {recent.map((item, index) => (
            <div key={`${item.date}-${item.title}-${index}`} className="flex gap-3">
              <div className="flex w-12 shrink-0 flex-col items-center">
                <span className="mt-1 h-2 w-2 rounded-full bg-primary" />
                {index !== recent.length - 1 && <span className="mt-1 h-full min-h-8 w-px bg-border/70" />}
              </div>
              <div className="min-w-0 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground/65">{item.date}</p>
                <p className="mt-0.5 text-sm font-medium text-foreground/90">{item.title}</p>
                {item.detail && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function ProjectTasks({ project }: { project: Project }) {
  const groups: Array<{ status: ProjectTask["status"]; title: string }> = [
    { status: "in-progress", title: "In Progress" },
    { status: "waiting", title: "Waiting" },
    { status: "planned", title: "Planned" },
    { status: "completed", title: "Completed" },
  ]

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {groups.map((group) => {
        const tasks = project.tasks.filter((task) => task.status === group.status)
        if (!tasks.length) return null
        return (
          <SectionCard key={group.status} title={group.title}>
            <TaskList tasks={tasks} />
          </SectionCard>
        )
      })}
    </div>
  )
}

function ProjectHistory({ project }: { project: Project }) {
  return (
    <div className="mx-auto max-w-4xl">
      <SectionCard eyebrow="Chronological project memory" title="History">
        <div className="space-y-7">
          {project.history.map((group) => (
            <div key={group.date} className="grid gap-3 sm:grid-cols-[110px_1fr]">
              <p className="pt-1 text-xs font-semibold text-muted-foreground">{group.date}</p>
              <div className="space-y-3 border-l border-border/70 pl-5">
                {group.items.map((item) => (
                  <div key={item.title} className="relative rounded-2xl bg-white/38 p-4">
                    <span className="absolute -left-[1.55rem] top-5 h-2 w-2 rounded-full bg-primary ring-4 ring-background/80" />
                    <p className="text-sm font-medium text-foreground/90">{item.title}</p>
                    {item.detail && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{item.detail}</p>}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  )
}

function ProjectFiles({ project }: { project: Project }) {
  return (
    <div className="mx-auto max-w-4xl">
      <SectionCard eyebrow="Important references, not a file browser" title="Project Files">
        <div className="space-y-2.5">
          {project.files.map((file) => {
            const Icon = file.kind === "code" ? FileCode2 : FileText
            return (
              <div key={file.path} className="flex items-start gap-3 rounded-2xl border border-border/45 bg-white/40 p-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="break-all font-mono text-xs font-semibold text-foreground/90">{file.path}</p>
                    {file.note && <span className="rounded-full bg-secondary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground">{file.note}</span>}
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{file.description}</p>
                </div>
              </div>
            )
          })}
        </div>
      </SectionCard>
    </div>
  )
}

function ProjectDetail({ project, onBack }: { project: Project; onBack: () => void }) {
  const [section, setSection] = useState<ProjectSection>("overview")
  const Icon = project.icon

  return (
    <div className="themed-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 md:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs font-semibold text-muted-foreground transition hover:bg-white/50 hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          All projects
        </button>

        <section className="rounded-[1.8rem] border border-white/55 bg-white/55 p-5 shadow-[0_20px_55px_-32px_rgba(45,90,145,0.6)] backdrop-blur-xl md:p-6">
          <div className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
            <div className="flex min-w-0 items-start gap-4">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[1.25rem] bg-primary/10 text-primary shadow-sm">
                <Icon className="h-6 w-6" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2.5">
                  <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground md:text-3xl">{project.name}</h1>
                  <StatusPill status={project.status} />
                </div>
                <p className="mt-1 text-sm text-muted-foreground">{project.category}</p>
                <p className="mt-3 max-w-2xl text-sm leading-relaxed text-foreground/72">{project.description}</p>
              </div>
            </div>

            <div className="rounded-2xl bg-primary/[0.07] px-4 py-3 md:min-w-[250px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/65">Current focus</p>
              <p className="mt-1 text-sm font-semibold text-foreground/90">{project.focus}</p>
              <p className="mt-2 text-[11px] text-muted-foreground">{project.activeTasks} active {project.activeTasks === 1 ? "task" : "tasks"} · Updated {project.updated.toLowerCase()}</p>
            </div>
          </div>

          <div className="themed-scroll mt-6 flex max-w-full gap-1 overflow-x-auto border-t border-border/45 pt-4">
            {SECTION_ITEMS.map((item) => {
              const SectionIcon = item.icon
              const active = section === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setSection(item.id)}
                  className={`flex shrink-0 items-center gap-2 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                    active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                  }`}
                >
                  <SectionIcon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </section>

        <div className="mt-4">
          {section === "overview" && <ProjectOverview project={project} />}
          {section === "tasks" && <ProjectTasks project={project} />}
          {section === "history" && <ProjectHistory project={project} />}
          {section === "files" && <ProjectFiles project={project} />}
        </div>
      </div>
    </div>
  )
}

export function ProjectsView() {
  const [filter, setFilter] = useState<ProjectFilter>("active")
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [query, setQuery] = useState("")
  const [showPrototypeNote, setShowPrototypeNote] = useState(false)

  const selectedProject = PROJECTS.find((project) => project.id === selectedProjectId) ?? null

  const filteredProjects = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    return PROJECTS.filter((project) => {
      const matchesFilter = filter === "all" || project.status === filter
      const matchesQuery =
        !normalizedQuery ||
        project.name.toLowerCase().includes(normalizedQuery) ||
        project.category.toLowerCase().includes(normalizedQuery) ||
        project.focus.toLowerCase().includes(normalizedQuery)
      return matchesFilter && matchesQuery
    })
  }, [filter, query])

  if (selectedProject) {
    return <ProjectDetail project={selectedProject} onBack={() => setSelectedProjectId(null)} />
  }

  const filters: Array<{ id: ProjectFilter; label: string }> = [
    { id: "active", label: "Active" },
    { id: "paused", label: "Paused" },
    { id: "completed", label: "Completed" },
    { id: "all", label: "All" },
  ]

  return (
    <div className="themed-scroll min-h-0 flex-1 overflow-y-auto px-4 pb-10 pt-4 md:px-8 lg:px-10">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.15em] text-primary/75">
              <FolderOpen className="h-4 w-4" aria-hidden="true" />
              Workspace
            </div>
            <h1 className="mt-1 font-display text-3xl font-semibold tracking-tight text-foreground">Projects</h1>
            <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              The work Alice knows about, what each project is focused on, and where things currently stand.
            </p>
          </div>

          <div className="relative self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setShowPrototypeNote((value) => !value)}
              className="inline-flex items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:brightness-105"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              New Project
            </button>
            {showPrototypeNote && (
              <div className="absolute right-0 top-12 z-30 w-64 rounded-2xl border border-white/60 bg-white/85 p-3 text-xs leading-relaxed text-muted-foreground shadow-xl backdrop-blur-xl">
                Project creation is visual-only in this prototype. We can decide the real creation flow after the page layout feels right.
              </div>
            )}
          </div>
        </div>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="themed-scroll flex max-w-full gap-1 overflow-x-auto rounded-full border border-border/55 bg-white/42 p-1 backdrop-blur-lg">
            {filters.map((item) => {
              const active = filter === item.id
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setFilter(item.id)}
                  className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                    active ? "bg-white text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {item.label}
                </button>
              )
            })}
          </div>

          <label className="flex w-full items-center gap-2 rounded-full border border-border/55 bg-white/48 px-3.5 py-2.5 text-muted-foreground backdrop-blur-lg transition focus-within:border-primary/45 focus-within:bg-white/65 lg:w-72">
            <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search projects"
              className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground/65"
            />
          </label>
        </div>

        {filteredProjects.length ? (
          <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map((project) => (
              <ProjectCard key={project.id} project={project} onOpen={() => setSelectedProjectId(project.id)} />
            ))}
          </div>
        ) : (
          <div className="mt-8 flex min-h-[280px] flex-col items-center justify-center rounded-[1.6rem] border border-dashed border-border/70 bg-white/30 px-6 text-center backdrop-blur-lg">
            <Search className="h-6 w-6 text-muted-foreground/55" aria-hidden="true" />
            <p className="mt-3 font-display text-base font-semibold text-foreground/80">No projects here</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">Try another filter or search term.</p>
          </div>
        )}

        <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 rounded-2xl border border-white/50 bg-white/35 px-4 py-3 text-[11px] text-muted-foreground backdrop-blur-lg">
          <span className="flex items-center gap-1.5"><Circle className="h-3 w-3 fill-emerald-500 text-emerald-500" /> Active work</span>
          <span className="flex items-center gap-1.5"><Pause className="h-3 w-3 text-amber-600" /> Paused, not forgotten</span>
          <span className="flex items-center gap-1.5"><Code2 className="h-3 w-3 text-primary" /> Mock data for UI prototyping</span>
        </div>
      </div>
    </div>
  )
}
