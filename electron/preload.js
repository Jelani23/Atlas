const { contextBridge, ipcRenderer } = require('electron');

// Everything the renderer is allowed to do lives here. It talks to "Atlas",
// full stop — no backend file or function names ever cross this bridge.
contextBridge.exposeInMainWorld('atlasBridge', {
    sendMessage: (text) => ipcRenderer.invoke('atlas:sendMessage', text),
    getState: () => ipcRenderer.invoke('atlas:getState'),
    listModes: () => ipcRenderer.invoke('atlas:listModes'),
    setMode: (mode) => ipcRenderer.invoke('atlas:setMode', mode),
    resetConversation: () => ipcRenderer.invoke('atlas:resetConversation'),
    listConversations: () => ipcRenderer.invoke('atlas:listConversations'),
    getConversation: (sessionId) => ipcRenderer.invoke('atlas:getConversation', sessionId),
    newConversation: () => ipcRenderer.invoke('atlas:newConversation'),
    deleteConversation: (sessionId) => ipcRenderer.invoke('atlas:deleteConversation', sessionId),
    renameConversation: (sessionId, title) => ipcRenderer.invoke('atlas:renameConversation', sessionId, title),

    // Subscribe to the standardized Atlas event stream. Returns an
    // unsubscribe function.
    onEvent: (callback) => {
        const handler = (_event, message) => callback(message);
        ipcRenderer.on('atlas:event', handler);
        return () => ipcRenderer.removeListener('atlas:event', handler);
    },
});

// Custom title bar's window chrome — separate bridge from atlasBridge since
// it talks to the BrowserWindow itself, not the Atlas backend.
contextBridge.exposeInMainWorld('windowControls', {
    minimize: () => ipcRenderer.invoke('window:minimize'),
    maximize: () => ipcRenderer.invoke('window:maximize'),
    close: () => ipcRenderer.invoke('window:close'),
    isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
    onMaximizeChange: (callback) => {
        const handler = (_event, maximized) => callback(maximized);
        ipcRenderer.on('window:maximized-changed', handler);
        return () => ipcRenderer.removeListener('window:maximized-changed', handler);
    },
});
