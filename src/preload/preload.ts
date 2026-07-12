import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("desktopApi", {
  chooseMediaFiles: () => ipcRenderer.invoke("files:choose"),
  inspectMediaFiles: (paths: string[]) => ipcRenderer.invoke("files:inspect", paths),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  getHistory: () => ipcRenderer.invoke("history:get"),
  saveHistory: (jobs: unknown) => ipcRenderer.invoke("history:save", jobs),
  getYouTubeInfo: (url: string) => ipcRenderer.invoke("youtube:info", url),
  prepareYouTubeAudio: (url: string, jobId?: string) => ipcRenderer.invoke("youtube:prepare", url, jobId),
  transcribe: (job: unknown, settings: unknown) => ipcRenderer.invoke("transcribe:start", job, settings),
  cancelTranscription: (jobId: string) => ipcRenderer.invoke("transcribe:cancel", jobId),
  exportFile: (payload: unknown) => ipcRenderer.invoke("export:file", payload),
  revealPath: (path: string) => ipcRenderer.invoke("shell:reveal", path),
  openDiagnostics: () => ipcRenderer.invoke("shell:diagnostics"),
  onProgress: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("transcribe:progress", listener);
    return () => ipcRenderer.removeListener("transcribe:progress", listener);
  }
});
