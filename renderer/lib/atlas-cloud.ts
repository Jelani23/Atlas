"use client"

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js"
import type { ConversationSummary, StoredMessage } from "./types"

const DEFAULT_SUPABASE_URL = "https://yilvpuudszkgcwmzcndt.supabase.co"
const DEFAULT_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_oPoH7vKRIimW0Ots8CVGiQ_WTvdLnQO"
const ATLAS_OWNER_EMAIL = "jittters03@gmail.com"

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL
const SUPABASE_PUBLISHABLE_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || DEFAULT_SUPABASE_PUBLISHABLE_KEY

export type AtlasCloudState = "checking" | "locked" | "online" | "offline"

export type CloudProjectStatus = "active" | "paused" | "completed" | "archived"
export type CloudTaskStatus = "in-progress" | "waiting" | "planned" | "completed" | "failed" | "interrupted"

export interface CloudProjectTask {
  id: string
  projectId: string | null
  title: string
  status: CloudTaskStatus
  progress: number | null
  stage: string | null
  detail: string | null
  result: string | null
  error: string | null
  updatedAt: string
}

export interface CloudProjectHistoryItem {
  id: number | string
  projectId: string
  title: string
  detail: string | null
  happenedAt: string
}

export interface CloudProjectFile {
  id: number | string
  projectId: string
  path: string
  description: string
  kind: "code" | "document" | "link"
  note: string | null
}

export interface CloudProject {
  id: string
  name: string
  category: string
  description: string
  status: CloudProjectStatus
  currentFocus: string
  progress: number | null
  icon: string
  updatedAt: string
  context: string[]
  tasks: CloudProjectTask[]
  history: CloudProjectHistoryItem[]
  files: CloudProjectFile[]
}

export interface CloudDevice {
  id: string
  name: string
  type: string
  platform: string | null
  role: string | null
  status: string
  currentActivity: string | null
  lastSeen: string
  capabilities: string[]
}

let client: SupabaseClient | null = null
let cloudState: AtlasCloudState = "checking"
let initialized = false
let heartbeatTimer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<(state: AtlasCloudState) => void>()

function publish(next: AtlasCloudState) {
  cloudState = next
  listeners.forEach((listener) => listener(next))
}

function cacheKey(key: string) {
  return `atlas.cloud.cache.${key}`
}

function saveCache(key: string, value: unknown) {
  if (typeof window === "undefined") return
  try {
    window.localStorage.setItem(cacheKey(key), JSON.stringify(value))
  } catch {
    // Cache failure should never block live cloud data.
  }
}

function loadCache<T>(key: string): T | null {
  if (typeof window === "undefined") return null
  try {
    const raw = window.localStorage.getItem(cacheKey(key))
    return raw ? (JSON.parse(raw) as T) : null
  } catch {
    return null
  }
}

export function getAtlasCloudClient() {
  if (!client) {
    client = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  }
  return client
}

export function getAtlasCloudState() {
  return cloudState
}

export function subscribeAtlasCloud(listener: (state: AtlasCloudState) => void) {
  listeners.add(listener)
  listener(cloudState)
  return () => listeners.delete(listener)
}

export async function initializeAtlasCloud() {
  if (initialized) return cloudState
  initialized = true

  const supabase = getAtlasCloudClient()
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    publish(data.session ? "online" : "locked")
    if (data.session) startDeviceHeartbeat()
  } catch {
    publish("offline")
  }

  supabase.auth.onAuthStateChange((_event, session) => {
    publish(session ? "online" : "locked")
    if (session) startDeviceHeartbeat()
    else stopDeviceHeartbeat()
  })

  if (typeof window !== "undefined") {
    window.addEventListener("online", () => {
      void refreshAtlasCloudState()
    })
    window.addEventListener("offline", () => publish("offline"))
  }

  return cloudState
}

export async function refreshAtlasCloudState() {
  const supabase = getAtlasCloudClient()
  try {
    const { data, error } = await supabase.auth.getSession()
    if (error) throw error
    publish(data.session ? "online" : "locked")
    return cloudState
  } catch {
    publish("offline")
    return cloudState
  }
}

export async function getAtlasCloudSession(): Promise<Session | null> {
  try {
    const { data } = await getAtlasCloudClient().auth.getSession()
    return data.session ?? null
  } catch {
    return null
  }
}

export async function unlockAtlasCloud(password: string) {
  const { data, error } = await getAtlasCloudClient().auth.signInWithPassword({
    email: ATLAS_OWNER_EMAIL,
    password,
  })
  if (error) {
    publish("locked")
    return { ok: false, error: error.message }
  }
  publish("online")
  startDeviceHeartbeat()
  return { ok: true, session: data.session }
}

export async function lockAtlasCloud() {
  stopDeviceHeartbeat()
  await getAtlasCloudClient().auth.signOut()
  publish("locked")
}

function requireOnlineSession(session: Session | null) {
  if (!session) throw new Error("Atlas cloud is locked")
}

export async function listCloudConversations(): Promise<ConversationSummary[]> {
  const cacheName = "conversations"
  try {
    const session = await getAtlasCloudSession()
    requireOnlineSession(session)
    const supabase = getAtlasCloudClient()
    const { data: sessions, error } = await supabase
      .from("sessions")
      .select("id, started_at, ended_at, title")
      .order("started_at", { ascending: false })
      .limit(50)
    if (error) throw error
    if (!sessions?.length) {
      saveCache(cacheName, [])
      return []
    }

    const ids = sessions.map((row) => row.id)
    const { data: messages, error: previewError } = await supabase
      .from("conversations")
      .select("session_id, content, id")
      .in("session_id", ids)
      .eq("role", "user")
      .order("id", { ascending: true })
    if (previewError) throw previewError

    const previews = new Map<string, string>()
    for (const message of messages || []) {
      const key = String(message.session_id)
      if (!previews.has(key)) previews.set(key, String(message.content || ""))
    }

    const result = sessions.map((row) => ({
      id: String(row.id),
      startedAt: row.started_at,
      endedAt: row.ended_at,
      title: row.title,
      preview: previews.get(String(row.id)) || "",
      isCurrent: false,
    }))
    saveCache(cacheName, result)
    publish("online")
    return result
  } catch (error) {
    if (typeof navigator !== "undefined" && !navigator.onLine) publish("offline")
    const cached = loadCache<ConversationSummary[]>(cacheName)
    if (cached) return cached
    throw error
  }
}

export async function getCloudConversation(sessionId: string): Promise<StoredMessage[]> {
  const cacheName = `conversation.${sessionId}`
  try {
    const session = await getAtlasCloudSession()
    requireOnlineSession(session)
    const { data, error } = await getAtlasCloudClient()
      .from("conversations")
      .select("role, content, timestamp")
      .eq("session_id", sessionId)
      .order("id", { ascending: true })
    if (error) throw error
    const result = (data || []) as StoredMessage[]
    saveCache(cacheName, result)
    publish("online")
    return result
  } catch (error) {
    const cached = loadCache<StoredMessage[]>(cacheName)
    if (cached) return cached
    throw error
  }
}

export async function renameCloudConversation(sessionId: string, title: string) {
  const session = await getAtlasCloudSession()
  requireOnlineSession(session)
  const cleanTitle = title.trim() || null
  const { error } = await getAtlasCloudClient().from("sessions").update({ title: cleanTitle }).eq("id", sessionId)
  if (error) throw error
  return { ok: true, title: cleanTitle }
}

export async function deleteCloudConversation(sessionId: string) {
  const session = await getAtlasCloudSession()
  requireOnlineSession(session)
  const { error } = await getAtlasCloudClient().from("sessions").delete().eq("id", sessionId)
  if (error) throw error
  return { ok: true, newSessionId: null as string | null }
}

function projectSubjectMatches(project: { id: string; name: string }, subject: string) {
  const normalized = subject.trim().toLowerCase()
  return normalized === project.id.toLowerCase() || normalized === project.name.toLowerCase()
}

export async function listCloudProjects(): Promise<CloudProject[]> {
  const cacheName = "projects"
  try {
    const session = await getAtlasCloudSession()
    requireOnlineSession(session)
    const supabase = getAtlasCloudClient()

    const [projectsResult, tasksResult, historyResult, filesResult, contextResult, memoryResult] = await Promise.all([
      supabase.from("atlas_projects").select("*").order("sort_order", { ascending: true }),
      supabase.from("atlas_tasks").select("*").order("updated_at", { ascending: false }),
      supabase.from("atlas_project_history").select("*").order("happened_at", { ascending: false }),
      supabase.from("atlas_project_files").select("*").order("sort_order", { ascending: true }),
      supabase.from("atlas_project_context").select("*").order("sort_order", { ascending: true }),
      supabase.from("project_memory").select("subject, key, value, created_at").order("created_at", { ascending: false }).limit(500),
    ])

    for (const result of [projectsResult, tasksResult, historyResult, filesResult, contextResult, memoryResult]) {
      if (result.error) throw result.error
    }

    const taskRows = tasksResult.data || []
    const historyRows = historyResult.data || []
    const fileRows = filesResult.data || []
    const contextRows = contextResult.data || []
    const memoryRows = memoryResult.data || []

    const result: CloudProject[] = (projectsResult.data || []).map((project) => {
      const curated = contextRows
        .filter((row) => row.project_id === project.id)
        .map((row) => String(row.value))
      const memory = memoryRows
        .filter((row) => projectSubjectMatches(project, String(row.subject || "")))
        .map((row) => String(row.value))
      const context = Array.from(new Set([...curated, ...memory])).slice(0, 12)

      return {
        id: project.id,
        name: project.name,
        category: project.category || "Project",
        description: project.description || "",
        status: project.status as CloudProjectStatus,
        currentFocus: project.current_focus || "No current focus",
        progress: typeof project.progress === "number" ? project.progress : null,
        icon: project.icon || "folder",
        updatedAt: project.updated_at,
        context,
        tasks: taskRows
          .filter((row) => row.project_id === project.id)
          .map((row) => ({
            id: row.id,
            projectId: row.project_id,
            title: row.title,
            status: row.status as CloudTaskStatus,
            progress: row.progress,
            stage: row.stage,
            detail: row.detail,
            result: row.result,
            error: row.error,
            updatedAt: row.updated_at,
          })),
        history: historyRows
          .filter((row) => row.project_id === project.id)
          .map((row) => ({
            id: row.id,
            projectId: row.project_id,
            title: row.title,
            detail: row.detail,
            happenedAt: row.happened_at,
          })),
        files: fileRows
          .filter((row) => row.project_id === project.id)
          .map((row) => ({
            id: row.id,
            projectId: row.project_id,
            path: row.path,
            description: row.description || "",
            kind: row.kind || "document",
            note: row.note,
          })),
      }
    })

    saveCache(cacheName, result)
    publish("online")
    return result
  } catch (error) {
    const cached = loadCache<CloudProject[]>(cacheName)
    if (cached) return cached
    throw error
  }
}

export async function listCloudTasks(): Promise<CloudProjectTask[]> {
  const cacheName = "tasks"
  try {
    const session = await getAtlasCloudSession()
    requireOnlineSession(session)
    const { data, error } = await getAtlasCloudClient()
      .from("atlas_tasks")
      .select("*")
      .order("updated_at", { ascending: false })
    if (error) throw error
    const result = (data || []).map((row) => ({
      id: row.id,
      projectId: row.project_id,
      title: row.title,
      status: row.status as CloudTaskStatus,
      progress: row.progress,
      stage: row.stage,
      detail: row.detail,
      result: row.result,
      error: row.error,
      updatedAt: row.updated_at,
    }))
    saveCache(cacheName, result)
    return result
  } catch (error) {
    const cached = loadCache<CloudProjectTask[]>(cacheName)
    if (cached) return cached
    throw error
  }
}

export async function listCloudDevices(): Promise<CloudDevice[]> {
  const cacheName = "devices"
  try {
    const session = await getAtlasCloudSession()
    requireOnlineSession(session)
    const { data, error } = await getAtlasCloudClient()
      .from("atlas_devices")
      .select("*")
      .order("last_seen", { ascending: false })
    if (error) throw error
    const result = (data || []).map((row) => ({
      id: row.id,
      name: row.name,
      type: row.type,
      platform: row.platform,
      role: row.role,
      status: row.status,
      currentActivity: row.current_activity,
      lastSeen: row.last_seen,
      capabilities: Array.isArray(row.capabilities) ? row.capabilities : [],
    }))
    saveCache(cacheName, result)
    return result
  } catch (error) {
    const cached = loadCache<CloudDevice[]>(cacheName)
    if (cached) return cached
    throw error
  }
}

function inferClientPlatform() {
  if (typeof navigator === "undefined") return { type: "web", platform: "Web" }
  const ua = navigator.userAgent.toLowerCase()
  if (/iphone|ipad|ipod/.test(ua)) return { type: "phone", platform: "iOS" }
  if (/macintosh|mac os/.test(ua)) return { type: "computer", platform: "macOS" }
  if (/windows/.test(ua)) return { type: "computer", platform: "Windows" }
  return { type: "web", platform: navigator.platform || "Web" }
}

function getClientDeviceId() {
  if (typeof window === "undefined") return "web-client"
  const key = "atlas.deviceId"
  const existing = window.localStorage.getItem(key)
  if (existing) return existing
  const next = `client-${crypto.randomUUID()}`
  window.localStorage.setItem(key, next)
  return next
}

async function touchClientDevice() {
  const session = await getAtlasCloudSession()
  if (!session) return
  const platform = inferClientPlatform()
  const id = getClientDeviceId()
  const name = platform.platform === "macOS" ? "Mac client" : platform.platform === "iOS" ? "iPhone client" : "Atlas client"
  await getAtlasCloudClient().from("atlas_devices").upsert(
    {
      id,
      name,
      type: platform.type,
      platform: platform.platform,
      role: "client",
      status: "online",
      current_activity: "Atlas UI",
      last_seen: new Date().toISOString(),
      capabilities: ["ui", "cloud-data"],
    },
    { onConflict: "id" },
  )
}

function startDeviceHeartbeat() {
  if (heartbeatTimer || typeof window === "undefined") return
  void touchClientDevice()
  heartbeatTimer = setInterval(() => void touchClientDevice(), 30_000)
}

function stopDeviceHeartbeat() {
  if (!heartbeatTimer) return
  clearInterval(heartbeatTimer)
  heartbeatTimer = null
}
