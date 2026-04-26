// Pyodide Web Worker — runs Python off the main thread to prevent UI freezes.
// Loaded once; stays alive across runs so Pyodide doesn't reload on every execution.

let pyodide = null

const readyPromise = (async () => {
  self.postMessage({ type: "loading" })
  const mod = await import("https://cdn.jsdelivr.net/pyodide/v0.27.3/full/pyodide.mjs")
  pyodide = await mod.loadPyodide({ indexURL: "https://cdn.jsdelivr.net/pyodide/v0.27.3/full/" })
  self.postMessage({ type: "ready" })
})()

self.onmessage = async ({ data }) => {
  if (data.type !== "run") return

  try {
    await readyPromise
  } catch (e) {
    self.postMessage({ type: "error", text: "Failed to load Python: " + (e?.message || String(e)) })
    self.postMessage({ type: "done" })
    return
  }

  if (!pyodide) {
    self.postMessage({ type: "error", text: "Python runtime not available." })
    self.postMessage({ type: "done" })
    return
  }

  try {
    pyodide.setStdout({ batched: t => self.postMessage({ type: "stdout", text: t }) })
    pyodide.setStderr({ batched: t => self.postMessage({ type: "stderr", text: t }) })
    await pyodide.runPythonAsync(data.code)
    self.postMessage({ type: "done" })
  } catch (e) {
    const lines = (e.message || String(e)).split("\n").filter(Boolean)
    self.postMessage({ type: "error", text: lines[lines.length - 1] || String(e) })
    self.postMessage({ type: "done" })
  }
}
