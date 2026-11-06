import { zip } from 'fflate'
import type { ZipRequest, ZipResponse } from '../types'

/**
 * 打包 Worker：接收主线程转移过来的字节数组，用 fflate 打成 ZIP，再把 Blob 交回去。
 *
 * 两个刻意的选择：
 * - level: 0（store）。JPEG/WebP 已经是熵编码后的数据，deflate 只有 0–2% 收益，
 *   却要吃掉全部 CPU 并把峰值内存翻倍。
 * - 字节通过 postMessage 的 transfer 列表传入，不复制大缓冲区。
 */

const scope = self as unknown as DedicatedWorkerGlobalScope

function post(response: ZipResponse): void {
  scope.postMessage(response)
}

scope.onmessage = (event: MessageEvent<ZipRequest>) => {
  const request = event.data
  if (!request || request.type !== 'zip') return

  try {
    const entries: Record<string, Uint8Array> = {}
    for (const entry of request.entries) {
      entries[entry.name] = new Uint8Array(entry.buffer)
    }

    zip(entries, { level: 0 }, (error, data) => {
      if (error) {
        post({ type: 'zip-failed', jobId: request.jobId, message: error.message })
        return
      }

      // data 是 fflate 新分配的 Uint8Array；Blob 会复制一份字节，之后主线程拿到的
      // 只是一个不可变 Blob 引用，结构化克隆代价很小。
      const blob = new Blob([data as unknown as BlobPart], { type: 'application/zip' })
      post({ type: 'zipped', jobId: request.jobId, blob })
    })
  } catch (error) {
    // 同步抛错（例如条目名非法）不能让 onmessage 冒泡成 worker 级崩溃
    post({
      type: 'zip-failed',
      jobId: request.jobId,
      message: error instanceof Error ? error.message : String(error),
    })
  }
}
