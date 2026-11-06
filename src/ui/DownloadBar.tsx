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
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-ink">打包下载</h2>

      <dl className="mt-3 space-y-1.5 text-xs">
        <div className="flex justify-between">
          <dt className="text-muted">已完成</dt>
          <dd className="tabular font-medium text-ink">{stats.doneCount} 张</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">原始 / 输出</dt>
          <dd className="tabular font-medium text-ink">
            {formatBytes(stats.original)} → {formatBytes(stats.compressed)}
          </dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted">体积变化</dt>
          <dd
            className={[
              'tabular font-semibold',
              stats.saved < 0 ? 'text-warn' : 'text-success',
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
        <p className="mt-2 text-[11px] text-warn">
          {stats.failed} 张处理失败，不会被打进压缩包。
        </p>
      ) : null}
      {zipState.status === 'error' ? (
        <p className="mt-2 text-[11px] text-danger">打包失败：{zipState.message}</p>
      ) : null}

      <button
        type="button"
        onClick={onDownload}
        disabled={disabled}
        className="mt-4 w-full rounded-xl bg-accent px-4 py-2.5 text-sm font-semibold text-accent-ink transition hover:bg-accent-hover disabled:cursor-not-allowed disabled:bg-sunken disabled:text-faint"
      >
        {zipping ? '正在打包…' : `打包下载${stats.doneCount > 0 ? ` (${stats.doneCount})` : ''}`}
      </button>

      <button
        type="button"
        onClick={onClear}
        disabled={items.length === 0}
        className="mt-2 w-full rounded-xl px-4 py-2 text-xs font-medium text-muted transition hover:bg-sunken hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        清空列表
      </button>

      <p className="mt-3 text-center text-[11px] text-faint">ZIP · 不重新压缩，直接封装</p>
    </section>
  )
}
