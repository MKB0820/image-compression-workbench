/**
 * 主线程与两个 Worker 之间唯一的契约。
 *
 * 规则：这个文件会被 app 项目（DOM lib）和 worker 项目（WebWorker lib）同时编译，
 * 所以它只能使用两边都存在的类型 —— 不要在这里 import 任何 React 或 DOM 专属模块。
 */

/* ─────────────────────────── 领域模型 ─────────────────────────── */

export type OutputFormat = 'original' | 'jpeg' | 'webp'

/** 当前环境实际能编码的格式。由 capabilities.ts 在启动时探测，不要靠 UA 猜。 */
export interface EncoderSupport {
  jpeg: boolean
  png: boolean
  webp: boolean
}

export interface CompressSettings {
  /** 0.1 – 1.0；PNG 输出时无效（画布 PNG 是无损的） */
  quality: number
  format: OutputFormat
  /** 最长边限制，null = 不限制 */
  maxWidth: number | null
  maxHeight: number | null
}

export type JobStatus = 'queued' | 'processing' | 'done' | 'error' | 'canceled'

export interface CompressResult {
  blob: Blob
  /** 真实编码出来的 MIME，而不是用户请求的格式 —— Safari 会静默回退 PNG */
  mime: string
  /** 输出像素尺寸（方向校正后） */
  width: number
  height: number
  /** worker 内耗时，毫秒 */
  ms: number
}

export interface ImageItem {
  id: string
  /** 原始文件在整个生命周期内保留：缩略图和重试都靠它 */
  file: File
  name: string
  originalSize: number
  originalType: string
  status: JobStatus
  result: CompressResult | null
  error: string | null
}

/* ─────────────────────────── 压缩 Worker 协议 ─────────────────────────── */

export interface CompressRequest {
  type: 'compress'
  jobId: string
  file: File
  settings: CompressSettings
  /** 主线程按 capability 探测结果解析好的目标 MIME，worker 不再猜 */
  targetMime: string
}

export type CompressResponse =
  | { type: 'compressed'; jobId: string; result: CompressResult }
  | { type: 'failed'; jobId: string; message: string }

/* ─────────────────────────── 打包 Worker 协议 ─────────────────────────── */

export interface ZipEntryInput {
  /** 已按真实 blob.type 修正过扩展名、并去过重的最终条目名 */
  name: string
  buffer: ArrayBuffer
}

export interface ZipRequest {
  type: 'zip'
  jobId: string
  entries: ZipEntryInput[]
}

export type ZipResponse =
  | { type: 'zipped'; jobId: string; blob: Blob }
  | { type: 'zip-failed'; jobId: string; message: string }
