import type { ImageItem } from '../types'

interface BatchActionsProps {
  items: ImageItem[]
  onCancelAll: () => void
  onRerunFailed: () => void
  onRerunAll: () => void
}

export function BatchActions({ items, onCancelAll, onRerunFailed, onRerunAll }: BatchActionsProps) {
  const pending = items.filter(
    (item) => item.status === 'queued' || item.status === 'processing',
  ).length
  const failed = items.filter((item) => item.status === 'error').length

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">批量操作</h2>

      <div className="mt-3 space-y-2">
        <button
          type="button"
          onClick={onCancelAll}
          disabled={pending === 0}
          className="w-full rounded-xl border border-red-200 px-3 py-2 text-xs font-medium text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:border-zinc-200 disabled:text-zinc-300 disabled:hover:bg-transparent"
        >
          全部取消{pending > 0 ? ` (${pending})` : ''}
        </button>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onRerunFailed}
            disabled={failed === 0}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
          >
            重跑失败{failed > 0 ? ` (${failed})` : ''}
          </button>
          <button
            type="button"
            onClick={onRerunAll}
            disabled={items.length === 0}
            className="rounded-xl border border-zinc-200 px-3 py-2 text-xs font-medium text-zinc-700 transition hover:bg-zinc-50 disabled:cursor-not-allowed disabled:text-zinc-300 disabled:hover:bg-transparent"
          >
            全部重跑
          </button>
        </div>
      </div>

      <p className="mt-3 text-[11px] leading-relaxed text-zinc-400">
        改完设置点「全部重跑」即可应用到已完成项；重跑会先取消进行中的任务。
      </p>
    </section>
  )
}
