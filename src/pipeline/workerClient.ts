/**
 * 极简 RPC 客户端：一条请求一个 jobId，响应按 jobId 配对。
 *
 * 为什么不用 Comlink：
 * - createImageBitmap / convertToBlob 都不接受 AbortSignal，取消唯一的可靠手段是
 *   terminate() 掉整个 worker 再重建。代理式的生命周期管理在这里反而碍事。
 * - 我们需要显式控制 transfer 列表（zip 的 ArrayBuffer），手写比绕代理更直白。
 *
 * 关键不变量：worker 一旦进入 dead 状态，后续 request() 必须立刻 reject。
 * 否则请求会被 postMessage 到一个已经关闭的端口并永远不返回 —— 在串行队列里
 * 这会卡住整条流水线，而且没有任何报错。
 */

export interface WorkerClient<Req extends { jobId: string }, Res extends { jobId: string }> {
  request(req: Req, transfer?: Transferable[]): Promise<Res>
  terminate(): void
  readonly dead: boolean
}

export function createWorkerClient<Req extends { jobId: string }, Res extends { jobId: string }>(
  /** 传工厂而不是 URL：Vite 只识别内联的 new Worker(new URL(...), ...) 写法 */
  factory: () => Worker,
): WorkerClient<Req, Res> {
  const worker = factory()
  const pending = new Map<
    string,
    { resolve: (response: Res) => void; reject: (error: Error) => void }
  >()
  let dead = false

  function rejectAll(error: Error): void {
    for (const entry of pending.values()) entry.reject(error)
    pending.clear()
  }

  worker.onmessage = (event: MessageEvent<Res>) => {
    const { jobId } = event.data
    const entry = pending.get(jobId)
    if (!entry) return // 已取消 / 已结算：迟到结果直接丢弃
    pending.delete(jobId)
    entry.resolve(event.data)
  }

  // onerror 只覆盖脚本级崩溃（加载失败、语法错误、未捕获异常）。
  // 业务错误走 response 通道，不会走到这里。
  worker.onerror = (event) => {
    if (dead) return
    dead = true
    worker.terminate()
    rejectAll(new Error(event.message || 'Worker 异常终止'))
  }

  return {
    get dead() {
      return dead
    },

    request(req, transfer = []) {
      if (dead) {
        return Promise.reject(new Error('Worker 已终止，请重试'))
      }
      if (pending.has(req.jobId)) {
        return Promise.reject(new Error(`重复的 jobId：${req.jobId}`))
      }

      return new Promise<Res>((resolve, reject) => {
        pending.set(req.jobId, { resolve, reject })
        try {
          worker.postMessage(req, transfer)
        } catch (error) {
          // postMessage 可能因不可克隆 / 重复 transfer 同步抛错；不清理会留下孤儿条目
          pending.delete(req.jobId)
          reject(error instanceof Error ? error : new Error(String(error)))
        }
      })
    },

    terminate() {
      dead = true
      worker.terminate()
      rejectAll(new Error('Worker 已终止'))
    },
  }
}
