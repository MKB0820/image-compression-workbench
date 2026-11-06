import { useMemo } from 'react'
import { formatBytes, savings } from '../lib/format'
import type { ZipState } from '../pipeline/useCompressionPipeline'
import type { ImageItem } from '../types'

interface DownloadBarProps {
  items: ImageItem[]
  zipState: ZipState
  onDownload: () => void
  onClear: () => void
}

export function DownloadBar({ items, zipState, onDownload, onClear }: DownloadBarProps) {
  const stats = useMemo(() => {
    const done = items.filter((item) => item.status === 'done' && item.result)
    const original = done.reduce((sum, item) => sum + item.originalSize, 0)
    const compressed = done.reduce((sum, item) => sum + (item.result?.blob.size ?? 0), 0)
    return {
      doneCount: done.length,
      original,
      compressed,
      saved: savings(original, compressed),
      failed: items.filter((item) => item.status === 'error').length,
    }
  }, [items])

  const zipping = zipState.status === 'zipping'
  const disabled = stats.doneCount === 0 || zipping

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">打包下载</h2>

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-zinc-500">已完成</dt>
          <dd className="tabular font-medium text-zinc-900">{stats.doneCount} 张</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">原始 / 输出</dt>
          <dd className="tabular font-medium text-zinc-900">
            {formatBytes(stats.original)} → {formatBytes(stats.compressed)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-zinc-500">体积变化</dt>
          <dd
            className={[
              'tabular font-semibold',
              stats.saved < 0 ? 'text-amber-600' : 'text-emerald-600',
            ].join(' ')}
          >
            {stats.doneCount === 0
              ? '—'
              : stats.saved < 0
                ? `+${Math.round(Math.abs(stats.saved) * 100)}%`
                : `−${Math.round(stats.saved * 100)}%`}
          </dd>
        </div>
      </dl>

      {stats.failed > 0 ? (
        <p className="mt-2 text-[11px] text-amber-600">
          {stats.failed} 张处理失败，不会被打进压缩包。
        </p>
      ) : null}
      {zipState.status === 'error' ? (
        <p className="mt-2 text-[11px] text-red-600">打包失败：{zipState.message}</p>
      ) : null}

      <button
        type="button"
        onClick={onDownload}
        disabled={disabled}
        className="mt-4 w-full rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-zinc-200 disabled:text-zinc-400"
      >
        {zipping ? '正在打包…' : `打包下载${stats.doneCount > 0 ? ` (${stats.doneCount})` : ''}`}
      </button>

      <button
        type="button"
        onClick={onClear}
        disabled={items.length === 0}
        className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-medium text-zinc-500 transition hover:bg-zinc-100 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-40"
      >
        清空列表
      </button>

      <p className="mt-3 text-center text-[11px] text-zinc-400">ZIP · 不重新压缩，直接封装</p>
    </section>
  )
}
