import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import ReactFlow, {
  Background,
  MiniMap,
  addEdge,
  useEdgesState,
  useNodesState,
} from 'reactflow'
import 'reactflow/dist/style.css'
import './App.css'
import NodeCard from './nodes/NodeCard.jsx'
import BottomBar from './components/BottomBar.jsx'
import NodeEditorModal from './components/NodeEditorModal.jsx'
import ContextMenu from './components/ContextMenu.jsx'
import LeftDock from './components/LeftDock.jsx'
import Toast from './components/Toast.jsx'
import DashboardMenu from './components/DashboardMenu.jsx'
import ConfirmDialog from './components/ConfirmDialog.jsx'
import { createNodeData, getNodeTemplate } from './nodes/nodeDefinitions.js'
import {
  readPipelines,
  upsertPipeline,
  serialiseBoard,
  parseBoard,
  slugify,
  persistPipelines,
  deletePipeline,
} from './utils/pipelineStorage.js'
import SettingsOverlay from './components/SettingsOverlay.jsx'

// Memoized/static React Flow node types to avoid recreating objects each render (#002)
const nodeTypes = { card: NodeCard }

const SERVER_SETTINGS_KEY = 'visual-pipeline-dashboard:server-settings'

const makeNode = (id, templateKey, position, overrides = {}) => ({
  id,
  type: 'card',
  position,
  data: createNodeData(templateKey, overrides),
  sourcePosition: 'right',
  targetPosition: 'left',
})

const canEditNode = (node) => {
  if (!node) return false
  const templateKey = node.data?.templateKey
  if (!templateKey) {
    const params = node.data?.params
    return params && Object.keys(params).length > 0
  }
  const template = getNodeTemplate(templateKey)
  if (!template) {
    const params = node.data?.params
    return params && Object.keys(params).length > 0
  }
  return Boolean(template.editable)
}

const initialNodes = [
  // Input nodes (green) — no input, one output
  makeNode('in-a', 'input-dataset', { x: 0, y: 20 }, { subtitle: 'Dataset A' }),
  makeNode('in-b', 'input-dataset', { x: 0, y: 170 }, { subtitle: 'Dataset B' }),

  // Processing nodes (violet)
  makeNode('concat', 'processing-concat', { x: 240, y: 95 }),
  makeNode('seg', 'processing-segmentation', { x: 480, y: 95 }),
  makeNode('filter', 'processing-filter', { x: 720, y: 95 }),

  // Analytics nodes (red)
  makeNode('desc', 'analytics-structural', { x: 960, y: 20 }),
  makeNode('sim', 'analytics-simulation', { x: 960, y: 170 }),

  // Output nodes (azure) — one input, no output
  makeNode('fig', 'output-figure', { x: 1200, y: 0 }),
  makeNode('log', 'output-log', { x: 1200, y: 80 }),
]

const initialEdges = [
  // inputs to concat
  { id: 'e-in-a-concat', source: 'in-a', target: 'concat' },
  { id: 'e-in-b-concat', source: 'in-b', target: 'concat' },
  // processing chain
  { id: 'e-concat-seg', source: 'concat', target: 'seg' },
  { id: 'e-seg-filter', source: 'seg', target: 'filter' },
  // branch to analytics
  { id: 'e-filter-desc', source: 'filter', target: 'desc' },
  { id: 'e-filter-sim', source: 'filter', target: 'sim' },
  // outputs
  { id: 'e-desc-fig', source: 'desc', target: 'fig' },
  { id: 'e-desc-log', source: 'desc', target: 'log' },
  { id: 'e-sim-log', source: 'sim', target: 'log' },
]

function App() {
  const [nodes, setNodes, applyNodesChanges] = useNodesState(initialNodes)
  const [edges, setEdges, applyEdgesChanges] = useEdgesState(initialEdges)
  const [isDark, setIsDark] = useState(false)
  const [zoomPct, setZoomPct] = useState(100)
  const [rfInstance, setRfInstance] = useState(null)
  const [interactive, setInteractive] = useState(true)
  const [editingNode, setEditingNode] = useState(null)
  const [menu, setMenu] = useState({ open: false, x: 0, y: 0, node: null })
  const [activeDock, setActiveDock] = useState(null)
  const [idSeq, setIdSeq] = useState(1000)
  const [checking, setChecking] = useState(false)
  const [issueCount, setIssueCount] = useState(0)
  const [executing, setExecuting] = useState(false)
  const [execResult, setExecResult] = useState(null) // 'success' | 'error' | null
  const [toasts, setToasts] = useState([])
  const [compact, setCompact] = useState(false)
  const [paneMenu, setPaneMenu] = useState({ open: false, x: 0, y: 0 })
  const [confirmClear, setConfirmClear] = useState(false)
  const [pipelinePreview, setPipelinePreview] = useState(null)
  const [savedPipelines, setSavedPipelines] = useState([])
  const [currentPipelineId, setCurrentPipelineId] = useState(null)
  const [loadingPipeline, setLoadingPipeline] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsPipelineName, setSettingsPipelineName] = useState('Untitled pipeline')
  const [serverHost, setServerHost] = useState('localhost')
  const [serverUser, setServerUser] = useState('')
  const [serverPassword, setServerPassword] = useState('')
  const [testingConnection, setTestingConnection] = useState(false)
  const [serverConnected, setServerConnected] = useState(false)
  const [connectingServer, setConnectingServer] = useState(false)
  const fileInputRef = useRef(null)
  const serverSettingsInitialisedRef = useRef(false)

  useEffect(() => {
    if (typeof window === 'undefined') {
      serverSettingsInitialisedRef.current = true
      return
    }
    try {
      const raw = window.localStorage.getItem(SERVER_SETTINGS_KEY)
      if (raw) {
        const parsed = JSON.parse(raw)
        if (parsed && typeof parsed === 'object') {
          if (typeof parsed.host === 'string') setServerHost(parsed.host)
          if (typeof parsed.user === 'string') setServerUser(parsed.user)
          if (typeof parsed.password === 'string') setServerPassword(parsed.password)
          if (typeof parsed.connected === 'boolean') setServerConnected(parsed.connected)
        }
      }
    } catch {
    } finally {
      serverSettingsInitialisedRef.current = true
    }
  }, [])

  useEffect(() => {
    const stored = readPipelines()
    if (stored.length) {
      setSavedPipelines(stored)
    }
  }, [])

  useEffect(() => {
    if (settingsOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [settingsOpen])

  const currentPipelineRecord = useMemo(
    () => savedPipelines.find((p) => p.id === currentPipelineId) || null,
    [savedPipelines, currentPipelineId]
  )

  useEffect(() => {
    if (!settingsOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setSettingsOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [settingsOpen])

  useEffect(() => {
    if (currentPipelineRecord) {
      setSettingsPipelineName(currentPipelineRecord.name || 'Untitled pipeline')
      const server = currentPipelineRecord.meta?.server || {}
      setServerHost(server.host || 'localhost')
      setServerUser(server.user || '')
      setServerPassword(server.password || '')
      setServerConnected(Boolean(server.connected))
      setConnectingServer(false)
    }
  }, [currentPipelineRecord?.id])

  const onNodesChange = useCallback((changes) => {
    setCurrentPipelineId(null)
    applyNodesChanges(changes)
  }, [applyNodesChanges])

  const onEdgesChange = useCallback((changes) => {
    setCurrentPipelineId(null)
    applyEdgesChanges(changes)
  }, [applyEdgesChanges])

  const addToast = useCallback((message, type = 'error', duration = 5000) => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t, { id, message, type, duration }])
  }, [])

  const persistServerMeta = useCallback(
    (patch) => {
      if (!currentPipelineId) return
      setSavedPipelines((prev) => {
        const idx = prev.findIndex((p) => p.id === currentPipelineId)
        if (idx < 0) return prev
        const target = prev[idx]
        const currentServer = target.meta?.server || {}
        const nextServer = { ...currentServer, ...patch }
        if (
          currentServer.host === nextServer.host &&
          currentServer.user === nextServer.user &&
          currentServer.password === nextServer.password &&
          currentServer.connected === nextServer.connected
        ) {
          return prev
        }
        const updated = [...prev]
        updated[idx] = {
          ...target,
          meta: {
            ...(target.meta || {}),
            server: nextServer,
          },
        }
        persistPipelines(updated)
        return updated
      })
    },
    [currentPipelineId]
  )

  const requestClearDashboard = useCallback(() => {
    if (executing) {
      addToast('Cannot clear while executing.', 'error')
      return
    }
    setConfirmClear(true)
  }, [executing, addToast])

  useEffect(() => {
    if (!serverSettingsInitialisedRef.current) return
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(
          SERVER_SETTINGS_KEY,
          JSON.stringify({
            host: serverHost,
            user: serverUser,
            password: serverPassword,
            connected: serverConnected,
          })
        )
      } catch {
        // ignore storage errors silently
      }
    }
    persistServerMeta({
      host: serverHost,
      user: serverUser,
      password: serverPassword,
      connected: serverConnected,
    })
  }, [serverHost, serverUser, serverPassword, serverConnected, persistServerMeta])
  const dismissToast = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id))
  }, [])
  
  // Close dock/context menu on Escape
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        if (menu.open) setMenu({ open: false, x: 0, y: 0, node: null })
        if (activeDock) setActiveDock(null)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [menu.open, activeDock])

  const onConnect = useCallback((params) => {
    if (executing) {
      addToast('Cannot edit the graph while executing.', 'error')
      return
    }
    setCurrentPipelineId(null)
    setEdges((eds) => addEdge(params, eds))
  }, [executing, addToast])

  const toggleDock = (tab) => {
    setActiveDock((cur) => (cur === tab ? null : tab))
  }

  const cloneNodes = (list) =>
    (Array.isArray(list) ? list : []).map((node) => ({
      ...node,
      position: node?.position ? { ...node.position } : node.position,
      style: node?.style ? { ...node.style } : node.style,
      data: node?.data ? JSON.parse(JSON.stringify(node.data)) : node.data,
    }))

  const cloneEdges = (list) =>
    (Array.isArray(list) ? list : []).map((edge) => ({
      ...edge,
      data: edge?.data ? JSON.parse(JSON.stringify(edge.data)) : edge.data,
      style: edge?.style ? { ...edge.style } : edge.style,
    }))

  const buildPipelineSnapshot = ({ id, name, createdAt } = {}) => {
    const timestamp = new Date().toISOString()
    const baseId = id || currentPipelineRecord?.id || `pl-${Date.now()}`
    const baseName =
      (name || settingsPipelineName || currentPipelineRecord?.name || 'Untitled pipeline')
        .toString()
        .trim() || 'Untitled pipeline'
    return {
      id: baseId,
      name: baseName,
      createdAt: createdAt || currentPipelineRecord?.createdAt || timestamp,
      nodes: cloneNodes(nodes),
      edges: cloneEdges(edges),
      idSeq,
      preview: pipelinePreview,
      meta: {
        ...(currentPipelineRecord?.meta || {}),
        isDark,
        zoom: zoomPct,
        interactive,
        server: {
          host: serverHost,
          user: serverUser,
          password: serverPassword,
          connected: serverConnected,
        },
      },
    }
  }

  const openPipelinesDock = () => {
    setActiveDock('pipelines')
    setPaneMenu({ open: false, x: 0, y: 0 })
  }

  const handleSavePipeline = (nameOverride) => {
    if (executing) {
      addToast('Cannot save while execution is in progress.', 'error')
      return
    }
    const trimmed = String(
      typeof nameOverride === 'string' && nameOverride.length ? nameOverride : settingsPipelineName
    )
      .trim()
      || 'Untitled pipeline'
    if (!trimmed) {
      addToast('Pipeline name cannot be empty.', 'error')
      return
    }
    const base = buildPipelineSnapshot({
      id: currentPipelineRecord?.id,
      name: trimmed,
      createdAt: currentPipelineRecord?.createdAt,
    })
    const nextList = upsertPipeline(savedPipelines, { ...base, name: trimmed })
    setSavedPipelines(nextList)
    setCurrentPipelineId(base.id)
    setSettingsPipelineName(trimmed)
    addToast(`Saved "${trimmed}".`, 'success', 2600)
  }

  const handleDownloadPipeline = () => {
    const base = buildPipelineSnapshot({
      id: currentPipelineRecord?.id,
      name: currentPipelineRecord?.name || 'Current pipeline',
      createdAt: currentPipelineRecord?.createdAt,
    })
    if (!base.nodes.length && !base.edges.length) {
      addToast('Pipeline is empty; nothing to download.', 'error')
      return
    }
    const serialised = serialiseBoard(base)
    if (!serialised) {
      addToast('Failed to serialise pipeline.', 'error')
      return
    }
    try {
      const blob = new Blob([serialised], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const link = document.createElement('a')
      link.href = url
      link.download = `${slugify(base.name)}.board`
      document.body.appendChild(link)
      link.click()
      link.remove()
      URL.revokeObjectURL(url)
      addToast('Download started.', 'success', 2200)
    } catch (err) {
      console.error(err)
      addToast('Failed to download pipeline.', 'error')
    }
  }

  const handleRenamePipeline = (pipelineId, nextName) => {
    if (!pipelineId) return
    const trimmed = String(nextName ?? '').trim()
    const finalName = trimmed || 'Untitled pipeline'
    const timestamp = new Date().toISOString()
    setSavedPipelines((prev) => {
      if (!prev.some((p) => p.id === pipelineId)) return prev
      const next = prev
        .map((p) =>
          p.id === pipelineId ? { ...p, name: finalName, updatedAt: timestamp } : p
        )
        .sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
        )
      persistPipelines(next)
      return next
    })
    if (currentPipelineId === pipelineId) {
      setSettingsPipelineName(finalName)
    }
    addToast(`Renamed pipeline to "${finalName}".`, 'success', 2400)
  }

  const handleDeletePipeline = (pipelineId) => {
    if (!pipelineId) return
    let removedName = null
    setSavedPipelines((prev) => {
      const target = prev.find((p) => p.id === pipelineId)
      if (!target) return prev
      removedName = target.name
      return deletePipeline(prev, pipelineId)
    })
    if (!removedName) return
    if (currentPipelineId === pipelineId) {
      setCurrentPipelineId(null)
      setSettingsPipelineName('Untitled pipeline')
    }
    addToast(`Deleted "${removedName}".`, 'success', 2200)
  }

  const handleLoadPipeline = (pipelineId) => {
    if (!pipelineId) return
    const target = savedPipelines.find((p) => p.id === pipelineId)
    if (!target) {
      addToast('Saved pipeline not found.', 'error')
      return
    }
    if (executing) {
      addToast('Cannot load while execution is in progress.', 'error')
      return
    }
    setSettingsOpen(false)
    setLoadingPipeline(true)
    setTimeout(() => {
      try {
        const nextZoom = Number.isFinite(target.meta?.zoom) ? target.meta.zoom : 100
        const nextNodes = cloneNodes(target.nodes || [])
        const nextEdges = cloneEdges(target.edges || [])
        setNodes(nextNodes)
        setEdges(nextEdges)
        setIdSeq(Number.isFinite(target.idSeq) ? target.idSeq : 1000)
        setCurrentPipelineId(target.id)
        setSettingsPipelineName(target.name || 'Untitled pipeline')
        const server = target.meta?.server || {}
        setServerHost(server.host || 'localhost')
        setServerUser(server.user || '')
        setServerPassword(server.password || '')
        setServerConnected(Boolean(server.connected))
        setConnectingServer(false)
        setChecking(false)
        setIssueCount(0)
        setExecResult(null)
        const nextDark = typeof target.meta?.isDark === 'boolean' ? target.meta.isDark : isDark
        const nextInteractive =
          typeof target.meta?.interactive === 'boolean' ? target.meta.interactive : interactive
        setIsDark(nextDark)
        setZoomPct(nextZoom)
        setInteractive(nextInteractive)
        if (rfInstance && nextZoom) {
          rfInstance.zoomTo(nextZoom / 100, { duration: 0 })
        }
        setPipelinePreview(target.preview || null)
        setActiveDock(null)
        setMenu({ open: false, x: 0, y: 0, node: null })
        setPaneMenu({ open: false, x: 0, y: 0 })
        setSavedPipelines((prev) => {
          const next = prev.map((p) =>
            p.id === target.id
              ? {
                  ...p,
                  meta: {
                    ...(p.meta || {}),
                    lastOpenedAt: new Date().toISOString(),
                  },
                }
              : p
          )
          persistPipelines(next)
          return next
        })
        addToast(`Loaded "${target.name}".`, 'success', 2600)
      } catch (err) {
        console.error(err)
        addToast('Failed to load pipeline.', 'error')
      } finally {
        setLoadingPipeline(false)
      }
    }, 240)
  }

  const handleUploadPipeline = () => {
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
      fileInputRef.current.click()
    }
  }

  const handlePipelineFileSelected = (event) => {
    const file = event.target?.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const parsed = parseBoard(reader.result)
        const imported = {
          ...parsed,
          id: `pl-${Date.now()}`,
          name: parsed.name || file.name.replace(/\.board$/i, '') || 'Imported pipeline',
          preview: parsed.preview || null,
        }
        const nextList = upsertPipeline(savedPipelines, imported)
        setSavedPipelines(nextList)
        setSettingsPipelineName(imported.name)
        const importedServer = imported.meta?.server || {}
        setServerHost(importedServer.host || 'localhost')
        setServerUser(importedServer.user || '')
        setServerPassword(importedServer.password || '')
        setServerConnected(Boolean(importedServer.connected))
        setConnectingServer(false)
        addToast(`Imported "${imported.name}".`, 'success', 2800)
        if (typeof window !== 'undefined') {
          const openNow = window.confirm('Open the imported pipeline now?')
          if (openNow) {
            handleLoadPipeline(imported.id)
          }
        }
      } catch (err) {
        console.error(err)
        addToast(err.message || 'Failed to import pipeline.', 'error')
      } finally {
        if (event.target) event.target.value = ''
      }
    }
    reader.onerror = () => {
      addToast('Unable to read the selected file.', 'error')
      if (event.target) event.target.value = ''
    }
    reader.readAsText(file)
  }

  const handleLoadClick = () => {
    if (!savedPipelines.length) {
      addToast('No saved pipelines yet. Save one before loading.', 'info', 2600)
      return
    }
    openPipelinesDock()
  }

  const handleLoadLatestPipeline = () => {
    if (!savedPipelines.length) {
      addToast('No saved pipelines yet. Save one before loading.', 'info', 2600)
      return
    }
    handleLoadPipeline(savedPipelines[0].id)
  }

  const openSettings = () => {
    setSettingsOpen(true)
    setActiveDock(null)
    setPaneMenu({ open: false, x: 0, y: 0 })
  }

  const closeSettings = () => setSettingsOpen(false)

  const handleTestConnection = () => {
    if (testingConnection) return
    setTestingConnection(true)
    addToast('Testing connection...', 'info', 2000)
    setTimeout(() => {
      setTestingConnection(false)
      addToast('Connection successful.', 'success', 2600)
    }, 1400)
  }

  const handleToggleServerConnection = () => {
    if (connectingServer) return
    if (serverConnected) {
      setServerConnected(false)
      addToast('Disconnected from remote server.', 'info', 2200)
      return
    }
    setConnectingServer(true)
    addToast('Connecting to remote server...', 'info', 2000)
    setTimeout(() => {
      setConnectingServer(false)
      setServerConnected(true)
      addToast('Remote server connected.', 'success', 2600)
    }, 1400)
  }

  const rootClassName = [
    loadingPipeline ? 'pipeline-busy' : '',
    settingsOpen ? 'settings-blur' : '',
  ]
    .filter(Boolean)
    .join(' ')
  const currentPipelineName =
    settingsPipelineName || currentPipelineRecord?.name || 'Current pipeline'

  // Capture a high‑resolution preview from the MiniMap SVG as PNG
  const capturePipelinePreview = () => {
    try {
      const wrap = document.querySelector('.react-flow__minimap.glass-minimap')
      if (!wrap) return
      const svg = wrap.querySelector('svg')
      if (!svg) return
      const w = wrap.clientWidth || 200
      const h = wrap.clientHeight || 130
      const scale = Math.max(2, Math.min(4, Math.round((window.devicePixelRatio || 2))))
      const outW = Math.round(w * scale)
      const outH = Math.round(h * scale)

      // Clone and set explicit size + xmlns for correct rasterization
      const clone = svg.cloneNode(true)
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('width', String(outW))
      clone.setAttribute('height', String(outH))
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')

      const xml = new XMLSerializer().serializeToString(clone)
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)

      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = outW
          canvas.height = outH
          const ctx = canvas.getContext('2d', { alpha: true })
          if (!ctx) { setPipelinePreview(svgUrl); return }
          ctx.clearRect(0, 0, outW, outH)
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, outW, outH)
          const png = canvas.toDataURL('image/png')
          setPipelinePreview(png)
        } catch {
          setPipelinePreview(svgUrl)
        }
      }
      img.onerror = () => setPipelinePreview(svgUrl)
      img.src = svgUrl
    } catch (e) {
      // ignore failures silently
    }
  }

  // Utility that returns a Promise which resolves to a PNG (or SVG) data URL
  const captureMiniMapImage = () => new Promise((resolve) => {
    try {
      const wrap = document.querySelector('.react-flow__minimap.glass-minimap')
      if (!wrap) return resolve(null)
      const svg = wrap.querySelector('svg')
      if (!svg) return resolve(null)
      const w = wrap.clientWidth || 200
      const h = wrap.clientHeight || 130
      const scale = Math.max(2, Math.min(4, Math.round((window.devicePixelRatio || 2))))
      const outW = Math.round(w * scale)
      const outH = Math.round(h * scale)
      const clone = svg.cloneNode(true)
      clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
      clone.setAttribute('width', String(outW))
      clone.setAttribute('height', String(outH))
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet')
      const xml = new XMLSerializer().serializeToString(clone)
      const svgUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(xml)
      const img = new Image()
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          canvas.width = outW
          canvas.height = outH
          const ctx = canvas.getContext('2d', { alpha: true })
          if (!ctx) return resolve(svgUrl)
          ctx.clearRect(0, 0, outW, outH)
          ctx.imageSmoothingEnabled = true
          ctx.imageSmoothingQuality = 'high'
          ctx.drawImage(img, 0, 0, outW, outH)
          const png = canvas.toDataURL('image/png')
          resolve(png)
        } catch {
          resolve(svgUrl)
        }
      }
      img.onerror = () => resolve(svgUrl)
      img.src = svgUrl
    } catch {
      resolve(null)
    }
  })

  const downloadScreenshot = async () => {
    const el = document.getElementById('dashboard-root')
    const ts = new Date()
    const pad = (n) => String(n).padStart(2, '0')
    const fname = `dashboard-${ts.getFullYear()}${pad(ts.getMonth()+1)}${pad(ts.getDate())}-${pad(ts.getHours())}${pad(ts.getMinutes())}${pad(ts.getSeconds())}.png`
    if (el) {
      try {
        const mod = await import('html-to-image')
        const ratio = Math.max(2, Math.min(3, (window.devicePixelRatio || 2)))
        const dataUrl = await mod.toPng(el, { pixelRatio: ratio, cacheBust: true })
        const a = document.createElement('a')
        a.href = dataUrl
        a.download = fname
        document.body.appendChild(a)
        a.click()
        a.remove()
        return
      } catch (e) {
        addToast('High-res screenshot module not installed; falling back to MiniMap image.', 'error', 3500)
      }
    }
    const url = await captureMiniMapImage()
    if (!url) return
    const a = document.createElement('a')
    a.href = url
    a.download = fname
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  // Keep preview up-to-date after relevant changes
  useEffect(() => {
    const t = setTimeout(capturePipelinePreview, 120)
    return () => clearTimeout(t)
  }, [nodes, edges, isDark, zoomPct, rfInstance])

  const addNodeOf = (key, position) => {
    if (executing) {
      addToast('Cannot add nodes while executing.', 'error')
      return
    }
    const nextId = `n-${idSeq + 1}`
    setIdSeq((v) => v + 1)
    setCurrentPipelineId(null)

    const base = {
      id: nextId,
      type: 'card',
      position: position ?? { x: 180, y: 60 + nodes.length * 40 },
    }
    const template = getNodeTemplate(key)
    const data = template
      ? createNodeData(key)
      : {
          title: 'Node',
          subtitle: template?.subtitle ?? 'Custom',
          color: 'grey',
          targets: 1,
          sources: 1,
          templateKey: key,
          params: {},
        }

    setNodes((nds) => [
      ...nds,
      {
        ...base,
        data,
        sourcePosition: 'right',
        targetPosition: 'left',
      },
    ])
  }

  const toggleCheck = () => {
    if (executing) {
      addToast('Cannot check while executing.', 'error')
      return
    }
    const isOn = !checking
    setChecking(isOn)

    // animate edges when checking
    setEdges((eds) => eds.map((e) => ({ ...e, animated: isOn })))

    // always reset node visual status and alerts at the start of a check
    if (isOn) {
      setNodes((nds) =>
        nds.map((n) => ({ ...n, className: undefined, data: { ...n.data, alert: undefined } }))
      )
    }

    if (!isOn) {
      // reset node highlighting but keep last issueCount so the result persists
      setNodes((nds) => nds.map((n) => ({ ...n, className: undefined, style: { ...(n.style || {}) } })))
      return
    }

    // Count inbound/outbound edges per node
    const inCount = new Map()
    const outCount = new Map()
    edges.forEach((e) => {
      inCount.set(e.target, (inCount.get(e.target) || 0) + 1)
      outCount.set(e.source, (outCount.get(e.source) || 0) + 1)
    })

    let issues = 0
    setNodes((nds) =>
      nds.map((n) => {
        const requiredIn = Number(n?.data?.targets ?? 0)
        const requiredOut = Number(n?.data?.sources ?? 0)
        const haveIn = inCount.get(n.id) || 0
        const haveOut = outCount.get(n.id) || 0
        const allConnected = haveIn >= requiredIn && haveOut >= requiredOut
        if (!allConnected) issues += 1
        return { ...n, className: allConnected ? 'rf-node-ok' : 'rf-node-bad' }
      })
    )
    setIssueCount(issues)
  }

  // When checking is active, keep the issue count updated as nodes/edges change
  useEffect(() => {
    if (!checking) return
    const inCount = new Map()
    const outCount = new Map()
    edges.forEach((e) => {
      inCount.set(e.target, (inCount.get(e.target) || 0) + 1)
      outCount.set(e.source, (outCount.get(e.source) || 0) + 1)
    })
    let issues = 0
    nodes.forEach((n) => {
      const requiredIn = Number(n?.data?.targets ?? 0)
      const requiredOut = Number(n?.data?.sources ?? 0)
      const haveIn = inCount.get(n.id) || 0
      const haveOut = outCount.get(n.id) || 0
      const allConnected = haveIn >= requiredIn && haveOut >= requiredOut
      if (!allConnected) issues += 1
    })
    setIssueCount(issues)
  }, [checking, nodes, edges])

  // Clear the bar result highlight after 5s
  useEffect(() => {
    if (!execResult) return
    const t = setTimeout(() => setExecResult(null), 5000)
    return () => clearTimeout(t)
  }, [execResult])

  return (
    <div id="dashboard-root" className={rootClassName} style={{ width: '100%', height: '100vh' }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={(inst) => {
          setRfInstance(inst)
          // apply current zoom on init
          inst.zoomTo(zoomPct / 100)
        }}
        onPaneClick={() => {
          if (menu.open) setMenu({ open: false, x: 0, y: 0, node: null })
          if (activeDock) setActiveDock(null)
          if (paneMenu.open) setPaneMenu({ open: false, x: 0, y: 0 })
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault()
          setPaneMenu({ open: true, x: e.clientX, y: e.clientY })
        }}
        onNodeContextMenu={(e, node) => {
          e.preventDefault()
          if (executing) {
            addToast('Cannot edit the graph while executing.', 'error')
          } else {
            setMenu({ open: true, x: e.clientX, y: e.clientY, node })
          }
        }}
        onNodeDoubleClick={(_, node) => {
          if (executing) {
            addToast('Cannot edit nodes while executing.', 'error')
          } else if (!canEditNode(node)) {
            addToast('This node has no editable attributes.', 'info')
          } else {
            setEditingNode(node)
          }
        }}
        onDragOver={(event) => {
          if (executing) return
          event.preventDefault()
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
        }}
        onDrop={(event) => {
          if (executing) return
          event.preventDefault()
          const key = event.dataTransfer?.getData('application/reactflow')
          if (!key || !rfInstance) return
          const bounds = event.currentTarget.getBoundingClientRect()
          const position = rfInstance.project({ x: event.clientX - bounds.left, y: event.clientY - bounds.top })
          addNodeOf(key, position)
        }}
        nodesDraggable={interactive && !executing}
        nodesConnectable={interactive && !executing}
        elementsSelectable={interactive && !executing}
        panOnDrag={interactive && !executing}
        zoomOnScroll={interactive && !executing}
        zoomOnPinch={interactive && !executing}
        selectionOnDrag={interactive && !executing}
        defaultEdgeOptions={{ type: 'smoothstep' }}
        nodeTypes={nodeTypes}
        fitView
      >
        {!compact && (
        <MiniMap
          className="glass-minimap"
          style={{ width: 200, height: 130, top: 18, right: 18, borderRadius: 14 }}
          pannable
          zoomable
          maskColor={isDark ? 'rgba(2,6,23,0.35)' : 'rgba(255,255,255,0.35)'}
          nodeStrokeColor={(n) => {
            const c = n?.data?.color
            switch (c) {
              case 'green':
                return '#22c55e'
              case 'violet':
                return '#7c3aed'
              case 'red':
                return '#ef4444'
              case 'azure':
                return '#3b82f6'
              case 'orange':
                return '#f97316'
              case 'yellow':
                return '#eab308'
              default:
                return isDark ? '#94a3b8' : '#64748b'
            }
          }}
          nodeColor={(n) => (isDark ? 'rgba(148,163,184,0.25)' : 'rgba(100,116,139,0.18)')}
          nodeBorderRadius={6}
        />)}
        <Background variant="dots" color={isDark ? '#475569' : '#cbd5e1'} gap={18} size={1} />
      </ReactFlow>
      {!compact && (
        <LeftDock
          active={activeDock}
          onToggle={toggleDock}
          onAddNode={addNodeOf}
          disabled={executing}
          preview={pipelinePreview}
          pipelines={savedPipelines}
          currentPipelineId={currentPipelineId}
          currentPipelineName={currentPipelineName}
          onLoadPipeline={handleLoadPipeline}
          onQuickLoad={handleLoadLatestPipeline}
          onSavePipeline={handleSavePipeline}
          onDownloadPipeline={handleDownloadPipeline}
          onUploadPipeline={handleUploadPipeline}
          onOpenSettings={openSettings}
          onClearDashboard={requestClearDashboard}
          onDeletePipeline={handleDeletePipeline}
          onRenamePipeline={handleRenamePipeline}
        />
      )}
      {paneMenu.open ? (
        <DashboardMenu
          x={paneMenu.x}
          y={paneMenu.y}
          onAddNode={() => {
            if (executing) addToast('Cannot add nodes while executing.', 'error')
            setActiveDock('nodes')
          }}
          onResetNodes={() => {
            setNodes((nds) => nds.map((n) => ({ ...n, className: undefined, data: { ...n.data, alert: undefined } })))
            setEdges((eds) => eds.map((e) => ({ ...e, animated: false })))
          }}
          onClear={requestClearDashboard}
          onToggleCompact={() => setCompact((v) => !v)}
          onClose={() => setPaneMenu({ open: false, x: 0, y: 0 })}
          onSavePipeline={handleSavePipeline}
          onLoadPipeline={handleLoadClick}
          onDownloadPipeline={handleDownloadPipeline}
          onUploadPipeline={handleUploadPipeline}
          onOpenSettings={openSettings}
        />
      ) : null}
      {menu.open && menu.node ? (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          canEdit={canEditNode(menu.node)}
          onEdit={() => {
            if (!canEditNode(menu.node)) {
              addToast('This node has no editable attributes.', 'info')
            } else {
              setEditingNode(menu.node)
            }
            setMenu({ open: false, x: 0, y: 0, node: null })
          }}
          onDelete={() => {
            const id = menu.node.id
            setCurrentPipelineId(null)
            setNodes((nds) => nds.filter((n) => n.id !== id))
            setEdges((eds) => eds.filter((e) => e.source !== id && e.target !== id))
            setMenu({ open: false, x: 0, y: 0, node: null })
          }}
          onClose={() => setMenu({ open: false, x: 0, y: 0, node: null })}
        />
      ) : null}
      {editingNode ? (
        <NodeEditorModal
          node={editingNode}
          onClose={() => setEditingNode(null)}
          onSave={({ title, params }) => {
            setNodes((nds) =>
              nds.map((n) =>
                n.id === editingNode.id ? { ...n, data: { ...n.data, title, params } } : n
              )
            )
            setEditingNode(null)
          }}
        />
      ) : null}
      <input
        type="file"
        accept=".board,application/json"
        ref={fileInputRef}
        style={{ display: 'none' }}
        onChange={handlePipelineFileSelected}
      />
      <BottomBar
        nodesCount={nodes.length}
        isDark={isDark}
        onToggleDark={() => setIsDark((d) => !d)}
        zoom={zoomPct}
        onZoomChange={(pct) => {
          setZoomPct(pct)
          if (rfInstance) rfInstance.zoomTo(pct / 100, { duration: 120 })
        }}
        onZoomStep={(delta) => {
          const next = Math.min(150, Math.max(50, zoomPct + delta))
          setZoomPct(next)
          if (rfInstance) rfInstance.zoomTo(next / 100, { duration: 120 })
        }}
        interactive={interactive}
        onToggleInteractive={() => setInteractive((v) => !v)}
        onFitView={() => {
          if (!rfInstance) return
          rfInstance.fitView({ padding: 0.2, duration: 200 })
        }}
        checking={checking}
        onToggleCheck={toggleCheck}
        issueCount={issueCount}
        executing={executing}
        execResult={execResult}
        compact={compact}
        onScreenshot={downloadScreenshot}
        onSavePipeline={handleSavePipeline}
        onLoadPipeline={handleLoadClick}
        onDownloadPipeline={handleDownloadPipeline}
        onUploadPipeline={handleUploadPipeline}
        onOpenSettings={openSettings}
        onRun={async () => {
          if (executing) return
          setExecResult(null)
          setExecuting(true)
          // reset node statuses and alerts at the start of a run
          setNodes((nds) => nds.map((n) => ({ ...n, className: undefined, data: { ...n.data, alert: undefined } })))
          // animate edges
          setEdges((eds) => eds.map((e) => ({ ...e, animated: true })))
          // helper to set node class by ids
          const setStatus = (ids, status) => {
            setNodes((nds) => nds.map((n) => (ids.includes(n.id) ? { ...n, className: status === 'running' ? 'rf-node-running' : status === 'success' ? 'rf-node-ok' : 'rf-node-bad' } : n)))
          }
          const getByTitle = (title) => nodes.filter((n) => n.data?.title === title).map((n) => n.id)
          const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

          try {
            // Inputs
            let stage = getByTitle('Input')
            setStatus(stage, 'running')
            await sleep(700)
            setStatus(stage, 'success')
            await sleep(200)
            // Processing
            stage = getByTitle('Processing')
            if (stage.length) {
              // randomly fail one processing node with 50% chance
              const fail = Math.random() < 0.5
              const failId = fail ? stage[Math.floor(Math.random() * stage.length)] : null
              setStatus(stage, 'running')
              await sleep(900)
              if (failId) {
                setStatus([failId], 'error')
                setExecResult('error')
                addToast('Execution stopped: a processing node failed.', 'error')
                // stop edges animation
                setEdges((eds) => eds.map((e) => ({ ...e, animated: false })))
                setExecuting(false)
                // keep alerts on nodes
                setNodes((nds) => nds.map((n) => (n.id === failId ? { ...n, data: { ...n.data, alert: { color: 'red', message: 'Execution error' } } } : n)))
                return
              }
              setStatus(stage, 'success')
              await sleep(200)
            }
            // Analytics
            stage = getByTitle('Analytics')
            setStatus(stage, 'running')
            await sleep(800)
            setStatus(stage, 'success')
            await sleep(200)
            // Outputs
            stage = getByTitle('Output')
            setStatus(stage, 'running')
            await sleep(700)
            setStatus(stage, 'success')
            setExecResult('success')
          } finally {
            // stop edge animation and end execution with bar feedback
            setEdges((eds) => eds.map((e) => ({ ...e, animated: false })))
            setExecuting(false)
            // Show a brief state in navbar via class on bottom bar handled by CSS using executing/execution result
            // Add green alerts to successful nodes if none present
            setNodes((nds) => nds.map((n) => (n.className === 'rf-node-ok' && !n.data?.alert ? { ...n, data: { ...n.data, alert: { color: 'green', message: 'Completed' } } } : n)))
          }
        }}
      />
      <Toast toasts={toasts} onDismiss={dismissToast} />
      <ConfirmDialog
        open={confirmClear}
        title="Clear dashboard?"
        message="This will remove all nodes and edges. This action cannot be undone."
        onCancel={() => setConfirmClear(false)}
        onConfirm={() => {
          setConfirmClear(false)
          setPaneMenu({ open: false, x: 0, y: 0 })
          setCurrentPipelineId(null)
          setNodes([])
          setEdges([])
        }}
      />
      <SettingsOverlay
        open={settingsOpen}
        onClose={closeSettings}
        pipelineName={settingsPipelineName}
        onPipelineNameChange={setSettingsPipelineName}
        onSavePipeline={handleSavePipeline}
        onDownloadPipeline={handleDownloadPipeline}
        onUploadPipeline={handleUploadPipeline}
        onClearDashboard={requestClearDashboard}
        serverHost={serverHost}
        onServerHostChange={setServerHost}
        serverUser={serverUser}
        onServerUserChange={setServerUser}
        serverPassword={serverPassword}
        onServerPasswordChange={setServerPassword}
        onTestConnection={handleTestConnection}
        testingConnection={testingConnection}
        onConnectToggle={handleToggleServerConnection}
        connecting={connectingServer}
        connected={serverConnected}
      />
      {loadingPipeline ? (
        <div className="loading-overlay">
          <div className="loading-spinner" />
          <div className="loading-text">Switching pipeline...</div>
        </div>
      ) : null}
    </div>
  )
}

export default App
