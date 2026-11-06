import { createWorkerClient, type WorkerClient } from './workerClient'

/**
 * 有界并发的 Worker 池。
 *
 * 调度模型：
 * - 每个 entry 是一个常驻 Worker，同一时刻只跑一个 job；
 * - 队列先进先出；有空闲 entry 就直接派活，没有且未到上限就新建；
 * - 取消分两档：
 *     排队中 → 直接从队列 splice 掉，零成本；
 *     运行中 → createImageBitmap / convertToBlob 都不接受 AbortSignal，
 *              唯一能真正停下 CPU 的方式是 terminate() 掉这个 worker，
 *              然后**立刻新建一个同类型 worker 补位**，保持池容量不变。
 *
 * 池大小：min(4, max(2, hardwareConcurrency - 1))
 * 不取满核：worker 是重量级线程，留下的核要留给主线程做合成和输入响应。
 */

const MAX_POOL_SIZE = 4
const MIN_POOL_SIZE = 2
const FALLBACK_CORES = 4
/** 看门狗：解码/编码卡死时不能让一个 slot 永远占着，也不能让一行永远停在「压缩中」 */
const JOB_TIMEOUT_MS = 60_000

export interface RunOptions {
  transfer?: Transferable[]
  /** 真正被派到某个 worker 上时触发：UI 靠它把「排队中」切成「压缩中」 */
  onStart?: () => void
}

export type CancelOutcome = 'queued' | 'running' | 'unknown'

interface PoolJob<Req extends { jobId: string }, Res extends { jobId: string }> {
  request: Req
  transfer: Transferable[]
  onStart?: () => void
  resolve: (response: Res) => void
  reject: (error: Error) => void
  settled: boolean
  state: 'queued' | 'running'
  entry: PoolEntry<Req, Res> | null
  timer: ReturnType<typeof setTimeout> | null
}

interface PoolEntry<Req extends { jobId: string }, Res extends { jobId: string }> {
  client: WorkerClient<Req, Res>
  jobId: string | null
}

export function abortError(message = '任务已取消'): DOMException {
  return new DOMException(message, 'AbortError')
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

export function defaultPoolSize(): number {
  const cores = navigator.hardwareConcurrency || FALLBACK_CORES
  return Math.min(MAX_POOL_SIZE, Math.max(MIN_POOL_SIZE, cores - 1))
}

export class WorkerPool<Req extends { jobId: string }, Res extends { jobId: string }> {
  private readonly factory: () => Worker
  private readonly entries = new Set<PoolEntry<Req, Res>>()
  private readonly queue: PoolJob<Req, Res>[] = []
  private readonly jobs = new Map<string, PoolJob<Req, Res>>()
  private destroyed = false
  readonly size: number

  constructor(factory: () => Worker, size: number) {
    this.factory = factory
    this.size = Math.max(1, size)
  }

  run(request: Req, options: RunOptions = {}): Promise<Res> {
    if (this.destroyed) {
      return Promise.reject(abortError('Worker 池已销毁'))
    }
    if (this.jobs.has(request.jobId)) {
      return Promise.reject(new Error(`重复的 jobId：${request.jobId}`))
    }

    return new Promise<Res>((resolve, reject) => {
      const job: PoolJob<Req, Res> = {
        request,
        transfer: options.transfer ?? [],
        onStart: options.onStart,
        resolve,
        reject,
        settled: false,
        state: 'queued',
        entry: null,
        timer: null,
      }

      this.jobs.set(request.jobId, job)
      this.queue.push(job)
      this.drain()
    })
  }

  /** 返回这次取消命中在哪一档，调用方可以据此决定要不要提示用户 */
  cancel(jobId: string): CancelOutcome {
    const job = this.jobs.get(jobId)
    if (!job) return 'unknown'

    if (job.state === 'queued') {
      const index = this.queue.indexOf(job)
      if (index >= 0) this.queue.splice(index, 1)
      job.settled = true
      this.clearTimer(job)
      this.jobs.delete(jobId)
      job.reject(abortError())
      return 'queued'
    }

    const entry = job.entry
    job.settled = true
    this.clearTimer(job)
    this.jobs.delete(jobId)

    if (entry) {
      this.entries.delete(entry)
      // terminate 会立刻停掉这个 worker 上的 canvas 编码工作，
      // 该 client 的 pending 请求随之 reject（已被 settled 挡住，不会重复处理）
      entry.client.terminate()
      this.spawn() // 立刻补位，保证池容量不变
    }

    job.reject(abortError())
    this.drain()
    return 'running'
  }

  cancelAll(): number {
    const jobIds = [...this.jobs.keys()]
    for (const jobId of jobIds) this.cancel(jobId)
    return jobIds.length
  }

  destroy(): void {
    this.destroyed = true

    for (const job of this.queue.splice(0)) {
      job.settled = true
      this.jobs.delete(job.request.jobId)
      job.reject(abortError('Worker 池已销毁'))
    }

    for (const entry of [...this.entries]) {
      this.entries.delete(entry)
      entry.client.terminate()
    }

    for (const job of [...this.jobs.values()]) {
      job.settled = true
      job.reject(abortError('Worker 池已销毁'))
    }
    this.jobs.clear()
  }

  private drain(): void {
    if (this.destroyed) return
    this.pruneDead()

    while (this.queue.length > 0) {
      const job = this.queue[0]
      const entry = this.takeIdle()

      if (entry) {
        this.queue.shift()
        this.start(entry, job)
        continue
      }

      if (this.entries.size < this.size) {
        this.queue.shift()
        this.start(this.spawn(), job)
        continue
      }

      return // 所有 worker 都在忙，剩下的留在队列里等 release
    }
  }

  private pruneDead(): void {
    for (const entry of [...this.entries]) {
      if (entry.client.dead && entry.jobId === null) this.entries.delete(entry)
    }
  }

  private takeIdle(): PoolEntry<Req, Res> | null {
    for (const entry of this.entries) {
      if (entry.jobId === null && !entry.client.dead) return entry
    }
    return null
  }

  private spawn(): PoolEntry<Req, Res> {
    const entry: PoolEntry<Req, Res> = {
      client: createWorkerClient<Req, Res>(this.factory),
      jobId: null,
    }
    this.entries.add(entry)
    return entry
  }

  private start(entry: PoolEntry<Req, Res>, job: PoolJob<Req, Res>): void {
    job.state = 'running'
    job.entry = entry
    entry.jobId = job.request.jobId
    job.timer = setTimeout(() => this.timeout(job), JOB_TIMEOUT_MS)

    job.onStart?.()

    entry.client
      .request(job.request, job.transfer)
      .then(
        (response) => this.settle(job, null, response),
        (error: Error) => this.settle(job, error),
      )
      .finally(() => {
        // entry 已被 cancel 移出池子时不能再释放它 —— 那个 worker 已经 terminate 了
        if (!this.entries.has(entry)) return
        entry.jobId = null
        this.drain()
      })
  }

  private settle(job: PoolJob<Req, Res>, error: Error | null, response?: Res): void {
    if (job.settled) return
    job.settled = true
    this.clearTimer(job)
    this.jobs.delete(job.request.jobId)

    if (error) job.reject(error)
    else job.resolve(response as Res)
  }

  /**
   * 看门狗到期：这个 slot 上没有任何响应。
   * 与「运行中取消」走同一套收尾 —— 终止 worker、补位、把这一行落到失败态。
   */
  private timeout(job: PoolJob<Req, Res>): void {
    if (job.settled) return
    job.settled = true
    job.timer = null
    this.jobs.delete(job.request.jobId)

    const entry = job.entry
    if (entry) {
      this.entries.delete(entry)
      entry.client.terminate()
      this.spawn()
    }

    job.reject(new Error('处理超时：该文件可能过大或已损坏'))
    this.drain()
  }

  private clearTimer(job: PoolJob<Req, Res>): void {
    if (job.timer !== null) {
      clearTimeout(job.timer)
      job.timer = null
    }
  }
}
