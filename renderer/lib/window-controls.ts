// Unrelated to Atlas itself — just the custom title bar's window chrome
// (the BrowserWindow is created with frame: false in electron/main.js).

export interface WindowControlsBridge {
  minimize: () => Promise<void>
  maximize: () => Promise<void>
  close: () => Promise<void>
  isMaximized: () => Promise<boolean>
  onMaximizeChange: (callback: (maximized: boolean) => void) => () => void
}

declare global {
  interface Window {
    windowControls?: WindowControlsBridge
  }
}
