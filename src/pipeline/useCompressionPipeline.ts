import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { toZipEntryName } from '../lib/entryName'
import { ALL_SUPPORTED, isAcceptedMime, resolveTargetMime } from '../lib/format'
import { newId } from '../lib/id'
import { itemsReducer } from '../state/itemsReducer'
import type {
  CompressRequest,
  CompressResponse,
  CompressResult,
  CompressSettings,
  EncoderSupport,
  ImageItem,
  ZipRequest,
  ZipResponse,
} from '../types'
import { detectEncoders } from './capabilities'
import { sniffMime } from './imageProbe'
import { createWorkerClient, type WorkerClient } from './workerClient'
import { defaultPoolSize, isAbortError, WorkerPool } from './workerPool'

const NOTICE_TIMEOUT_MS = 5000
const OBJECT_URL_REVOKE_DELAY_MS = 1000

const DEFAULT_SETTINGS: CompressSettings = {
  quality: 0.8,
  format: 'original',
  maxWidth: null,
  maxHeight: null,
}

export interface ZipState {
  status: 'idle' | 'zipping' | 'error'
  message?: string
}

type RerunMode = 'all' | 'failed'

function createItem(file: File): ImageItem {
  return {
    id: newId(),
    file,
    name: file.name,
    originalSize: file.size,
    originalType: file.type,
    status: 'queued',
    result: null,
    error: null,
  }
}

/**
 * 主线程与 pipeline 的唯一接触面：React 只出现在这个文件里。
 *
 * item.id 与 jobId 是分开的：一次重跑会发一个新 jobId，但列表行的 key 不变。
 * activeJobs 记录「这一行当前对应哪个 jobId」，用来丢弃被取消 / 被重跑覆盖的
 * 迟到结果 —— 这是取消语义正确的关键。
 */
export function useCompressionPipeline() {
  const [items, dispatch] = useReducer(itemsReducer, [] as ImageItem[])
  const [settings, setSettings] = useState<CompressSettings>(DEFAULT_SETTINGS)
  const [zipState, setZipState] = useState<ZipState>({ status: 'idle' })
  const [notice, setNotice] = useState<string | null>(null)
  const [support, setSupport] = useState<EncoderSupport>(ALL_SUPPORTED)
  const [poolSize] = useState(defaultPoolSize)

  const aliveRef = useRef(true)

  const settingsRef = useRef(settings)
  const itemsRef = useRef(items)
  const supportRef = useRef(support)
  useEffect(() => {
    settingsRef.current = settings
  }, [settings])
  useEffect(() => {
    itemsRef.current = items
  }, [items])
  useEffect(() => {
    supportRef.current = support
  }, [support])

  const poolRef = useRef<WorkerPool<CompressRequest, CompressResponse> | null>(null)
  const zipRef = useRef<WorkerClient<ZipRequest, ZipResponse> | null>(null)
  /** itemId → 当前 jobId */
  const activeJobsRef = useRef(new Map<string, string>())

  const getPool = useCallback(() => {
    poolRef.current ??= new WorkerPool<CompressRequest, CompressResponse>(
      () => new Worker(new URL('./compress.worker.ts', import.meta.url), { type: 'module' }),
      poolSize,
    )
    return poolRef.current
  }, [poolSize])

  const getZipClient = useCallback(() => {
    const current = zipRef.current
    if (current && !current.dead) return current

    const client = createWorkerClient<ZipRequest, ZipResponse>(
      () => new Worker(new URL('./zip.worker.ts', import.meta.url), { type: 'module' }),
    )
    zipRef.current = client
    return client
  }, [])

  useEffect(() => {
    aliveRef.current = true
    return () => {
      aliveRef.current = false
      poolRef.current?.destroy()
      poolRef.current = null
      zipRef.current?.terminate()
      zipRef.current = null
      activeJobsRef.current.clear()
    }
  }, [])

  useEffect(() => {
    if (!notice) return
    const timer = setTimeout(() => setNotice(null), NOTICE_TIMEOUT_MS)
    return () => clearTimeout(timer)
  }, [notice])

  // 启动时探测一次：Safari 不支持 canvas 编码 WebP，且请求不支持的 MIME
  // 不会抛错而是静默给 PNG
  useEffect(() => {
    let cancelled = false
    void detectEncoders().then((result) => {
      if (!cancelled) setSupport(result)
    })
    return () => {
      cancelled = true
    }
  }, [])

  /** 提交一张图。onStart 由池在真正派活时触发，所以排队期间状态仍是「排队中」。 */
  const submit = useCallback(
    async (item: { id: string; file: File }) => {
      const jobId = newId()
      activeJobsRef.current.set(item.id, jobId)

      try {
        const response = await getPool().run(
          {
            type: 'compress',
            jobId,
            file: item.file,
            settings: settingsRef.current,
            targetMime: resolveTargetMime(
              settingsRef.current.format,
              item.file.type,
              supportRef.current,
            ),
          },
          {
            onStart: () => {
              if (!aliveRef.current) return
              if (activeJobsRef.current.get(item.id) !== jobId) return
              dispatch({ type: 'start', id: item.id })
            },
          },
        )

        if (!aliveRef.current) return
        if (activeJobsRef.current.get(item.id) !== jobId) return // 已取消 / 已重跑

        if (response.type === 'compressed') {
          dispatch({ type: 'succeed', id: item.id, result: response.result })
        } else {
          dispatch({ type: 'fail', id: item.id, message: response.message })
        }
      } catch (error) {
        if (!aliveRef.current) return
        if (activeJobsRef.current.get(item.id) !== jobId) return

        if (isAbortError(error)) {
          dispatch({ type: 'cancel', id: item.id })
        } else {
          dispatch({
            type: 'fail',
            id: item.id,
            message: error instanceof Error ? error.message : String(error),
          })
        }
      } finally {
        if (activeJobsRef.current.get(item.id) === jobId) {
          activeJobsRef.current.delete(item.id)
        }
      }
    },
    [getPool],
  )

  const addFiles = useCallback(
    async (files: File[]) => {
      const accepted: File[] = []
      let rejected = 0

      for (const file of files) {
        if (isAcceptedMime(file.type)) {
          accepted.push(file)
          continue
        }

        // 拖拽绕过 <input accept>，且部分来源（Android 内容提供方、第三方应用）
        // 的 File.type 是空串。只按 type 判断会把能正常解码的图片误拒，所以按魔数兜底。
        const mime = await sniffMime(file)
        if (!mime) {
          rejected += 1
          continue
        }
        accepted.push(file.type === mime ? file : new File([file], file.name, { type: mime }))
      }

      if (rejected > 0) {
        setNotice(`已跳过 ${rejected} 个不支持的文件：仅接受 JPEG / PNG / WebP`)
      }
      if (accepted.length === 0) return

      const next = accepted.map(createItem)
      dispatch({ type: 'add', items: next })
      for (const item of next) void submit(item)
    },
    [submit],
  )

  /** 摘掉这一行与 jobId 的映射：映射一没，迟到结果就再也落不到这一行上 */
  const cancelActiveJob = useCallback(
    (id: string) => {
      const jobId = activeJobsRef.current.get(id)
      if (!jobId) return
      getPool().cancel(jobId)
      activeJobsRef.current.delete(id)
    },
    [getPool],
  )

  const cancelItem = useCallback(
    (id: string) => {
      cancelActiveJob(id)
      dispatch({ type: 'cancel', id })
    },
    [cancelActiveJob],
  )

  const cancelAll = useCallback(() => {
    const pending = itemsRef.current.filter(
      (item) => item.status === 'queued' || item.status === 'processing',
    )
    for (const item of pending) cancelItem(item.id)
  }, [cancelItem])

  const removeItem = useCallback(
    (id: string) => {
      cancelActiveJob(id)
      dispatch({ type: 'remove', id })
    },
    [cancelActiveJob],
  )

  const clearAll = useCallback(() => {
    getPool().cancelAll()
    activeJobsRef.current.clear()
    dispatch({ type: 'clear' })
  }, [getPool])

  /** 按当前设置重跑：先取消在跑的任务，再重新入队 */
  const rerun = useCallback(
    (mode: RerunMode) => {
      const targets = itemsRef.current.filter(
        (item) => mode === 'all' || item.status === 'error',
      )
      if (targets.length === 0) return

      for (const item of targets) {
        cancelActiveJob(item.id)
        dispatch({ type: 'requeue', id: item.id })
        void submit(item)
      }
    },
    [cancelActiveJob, submit],
  )

  const downloadZip = useCallback(async () => {
    const done = itemsRef.current.filter(
      (item): item is ImageItem & { result: CompressResult } =>
        item.status === 'done' && item.result !== null,
    )
    if (done.length === 0) return

    setZipState({ status: 'zipping' })
    try {
      const used = new Set<string>()
      // map 回调里先同步取名字再 await，因此去重顺序与列表顺序一致
      const entries = await Promise.all(
        done.map(async (item) => {
          return {
            name: toZipEntryName(item.name, item.result.mime, used),
            buffer: await item.result.blob.arrayBuffer(),
          }
        }),
      )

      const response = await getZipClient().request(
        { type: 'zip', jobId: newId(), entries },
        entries.map((entry) => entry.buffer),
      )

      if (response.type !== 'zipped') throw new Error(response.message)

      const url = URL.createObjectURL(response.blob)
      try {
        const anchor = document.createElement('a')
        anchor.href = url
        anchor.download = `compressed-${done.length}-images.zip`
        anchor.click()
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), OBJECT_URL_REVOKE_DELAY_MS)
      }

      setZipState({ status: 'idle' })
    } catch (error) {
      setZipState({
        status: 'error',
        message: error instanceof Error ? error.message : String(error),
      })
    }
  }, [getZipClient])

  return {
    items,
    settings,
    setSettings,
    support,
    poolSize,
    addFiles,
    cancelAll,
    removeItem,
    clearAll,
    rerun,
    downloadZip,
    zipState,
    notice,
  }
}
