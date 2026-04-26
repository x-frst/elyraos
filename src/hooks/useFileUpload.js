import { useState, useCallback } from 'react'
import { useStore } from '../store/useStore'
import { fsUploadStream, getJWT } from '../utils/db'

// File extensions that are plain text — kept for external callers that may inspect
// the type before deciding how to open a file (e.g. CodeEditor, Notepad).
export const TEXT_EXTENSIONS = new Set([
  'csv','tsv','txt','log','md','markdown','xml','json','yaml','yml','ini',
  'cfg','conf','html','htm','css','js','jsx','ts','tsx','py','sh','bash',
  'rb','php','c','cpp','h','java','rs','go','sql','toml','env','svg',
])

/**
 * Shared upload hook used by both Files and Desktop.
 * ALL files — regardless of size or type — are uploaded as raw bytes via the
 * streaming XHR endpoint (`PUT /api/fs/stream`).  No base64 / DataURL encoding
 * is ever used, so binary files (images, zips, videos, …) are never corrupted.
 *
 * Returns { uploads, uploadFiles } where:
 *  - uploads: Array<{ id, name, progress: 0–1, cancel() }>
 *  - uploadFiles(files, targetFolderId): triggers upload for all files
 */
export function useFileUpload() {
  const [uploads, setUploads] = useState([])
  const createNodeEntry     = useStore(s => s.createNodeEntry)
  const updateNodeSize      = useStore(s => s.updateNodeSize)
  const permanentDeleteNode = useStore(s => s.permanentDeleteNode)

  const uploadFiles = useCallback((files, targetId) => {
    // Guests cannot upload files — their session is ephemeral and content is not persisted
    if (!getJWT()) {
      useStore.setState({
        notification: {
          message: 'Guest users cannot upload files. Sign up for a free account.',
          id: Math.random().toString(36).slice(2),
        },
      })
      return
    }
    Array.from(files).forEach(file => {
      // Always stream — raw bytes, no base64 overhead, with progress tracking
      const uploadId  = Math.random().toString(36).slice(2)
      const abortCtrl = new AbortController()
      const nodeId    = createNodeEntry(targetId, file.name)
      setUploads(u => [...u, { id: uploadId, name: file.name, progress: 0, cancel: () => abortCtrl.abort() }])
      fsUploadStream(
        nodeId, file,
        (progress) => setUploads(u => u.map(x => x.id === uploadId ? { ...x, progress } : x)),
        abortCtrl.signal
      )
        .then(() => {
          updateNodeSize(nodeId, file.size)
          setUploads(u => u.filter(x => x.id !== uploadId))
        })
        .catch(() => {
          // Remove tree entry on cancel or error — nothing was written to disk.
          setUploads(u => u.filter(x => x.id !== uploadId))
          permanentDeleteNode(nodeId)
        })
    })
  }, [createNodeEntry, updateNodeSize, permanentDeleteNode])

  return { uploads, uploadFiles }
}
