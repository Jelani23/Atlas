"use client"

export type AtlasActiveTab =
  | "home"
  | "conversations"
  | "projects"
  | "tasks"
  | "devices"
  | "settings"

const ACTIVE_TAB_EVENT = "atlas:active-tab-changed"

let currentTab: AtlasActiveTab = "home"

export function getAtlasActiveTab(): AtlasActiveTab {
  return currentTab
}

export function setAtlasActiveTab(tab: AtlasActiveTab) {
  if (currentTab === tab) return
  currentTab = tab
  window.dispatchEvent(new CustomEvent<AtlasActiveTab>(ACTIVE_TAB_EVENT, { detail: tab }))
}

export function subscribeAtlasActiveTab(listener: (tab: AtlasActiveTab) => void) {
  const handler = (event: Event) => {
    listener((event as CustomEvent<AtlasActiveTab>).detail)
  }

  window.addEventListener(ACTIVE_TAB_EVENT, handler)
  return () => window.removeEventListener(ACTIVE_TAB_EVENT, handler)
}
