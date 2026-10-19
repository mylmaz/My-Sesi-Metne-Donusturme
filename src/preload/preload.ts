import { contextBridge, ipcRenderer, webUtils } from "electron";

contextBridge.exposeInMainWorld("desktopApi", {
  chooseMediaFiles: () => ipcRenderer.invoke("files:choose"),
  getPathForFile: (file: File) => {
    try {
      return webUtils.getPathForFile(file);
    } catch {
      return "";
    }
  },
  inspectMediaFiles: (paths: string[]) => ipcRenderer.invoke("files:inspect", paths),
  prepareAudio: (sourceType: "file" | "youtube", sourcePath: string) => ipcRenderer.invoke("audio:prepare", sourceType, sourcePath),
  getSettings: () => ipcRenderer.invoke("settings:get"),
  saveSettings: (settings: unknown) => ipcRenderer.invoke("settings:save", settings),
  resetSettings: () => ipcRenderer.invoke("settings:reset"),
  getHistory: () => ipcRenderer.invoke("history:get"),
  saveHistory: (jobs: unknown) => ipcRenderer.invoke("history:save", jobs),
  getYouTubeInfo: (url: string) => ipcRenderer.invoke("youtube:info", url),
  transcribe: (job: unknown, settings: unknown) => ipcRenderer.invoke("transcribe:start", job, settings),
  cancelTranscription: (jobId: string) => ipcRenderer.invoke("transcribe:cancel", jobId),
  exportFile: (payload: unknown) => ipcRenderer.invoke("export:file", payload),
  revealPath: (path: string) => ipcRenderer.invoke("shell:reveal", path),
  playSound: (name: string) => ipcRenderer.invoke("sound:play", name),
  onProgress: (callback: (payload: unknown) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: unknown) => callback(payload);
    ipcRenderer.on("transcribe:progress", listener);
    return () => ipcRenderer.removeListener("transcribe:progress", listener);
  }
});
