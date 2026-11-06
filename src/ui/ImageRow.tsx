import { formatBytes, labelForMime, savings } from '../lib/format'
import { useObjectUrl } from '../lib/useObjectUrl'
import type { ImageItem, JobStatus } from '../types'

interface ImageRowProps {
  item: ImageItem
  onRemove: (id: string) => void
}

const STATUS_LABEL: Record<JobStatus, string> = {
  queued: '排队中',
  processing: '压缩中',
  done: '已完成',
  error: '失败',
  canceled: '已取消',
}

const STATUS_STYLE: Record<JobStatus, string> = {
  queued: 'bg-sunken text-muted',
  processing: 'bg-accent-soft text-accent',
  done: 'bg-success-soft text-success',
  error: 'bg-danger-soft text-danger',
  canceled: 'bg-sunken text-faint',
}

function RatioBadge({ originalSize, compressedSize }: { originalSize: number; compressedSize: number }) {
  const saved = savings(originalSize, compressedSize)
  const percent = Math.round(Math.abs(saved) * 100)
  const grew = saved < 0

  return (
    <span
      className={[
        'tabular shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-semibold',
        grew ? 'bg-warn-soft text-warn' : 'bg-success-soft text-success',
      ].join(' ')}
      title={grew ? '压缩后变大了' : '体积减少'}
    >
      {grew ? `+${percent}%` : `−${percent}%`}
    </span>
  )
}

export function ImageRow({ item, onRemove }: ImageRowProps) {
  // 处理完成前显示原图，完成后显示压缩结果本身 —— 所见即最终产物。
  // 行被虚拟列表卸载时，useObjectUrl 的 cleanup 会立刻 revoke 这个 URL。
  const result = item.result
  const previewUrl = useObjectUrl(result?.blob ?? item.file)

  const failed = item.status === 'error' && Boolean(item.error)

  return (
    <div className="flex h-full items-center gap-3 px-4">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-sunken ring-1 ring-line">
        {previewUrl ? (
          <img
            src={previewUrl}
            alt=""
            className="h-full w-full object-cover"
            loading="lazy"
            // 损坏的文件解码失败时，隐藏浏览器自带的「图片破损」图标，只留灰色占位
            onError={(event) => {
              event.currentTarget.style.visibility = 'hidden'
            }}
          />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-ink" title={item.name}>
          {item.name}
        </p>

        {failed ? (
          <p className="mt-1 truncate text-xs text-danger" title={item.error ?? ''}>
            {item.error}
          </p>
        ) : (
          <div className="tabular mt-1 flex min-w-0 items-center gap-1.5 overflow-hidden whitespace-nowrap text-xs text-muted">
            <span className="shrink-0">{formatBytes(item.originalSize)}</span>
            <span className="shrink-0 text-faint/60">→</span>
            <span className="shrink-0 text-ink">
              {result ? formatBytes(result.blob.size) : '—'}
            </span>
            <span className="shrink-0 text-faint/60">·</span>
            <span className="shrink-0">{labelForMime(result?.mime ?? item.originalType)}</span>
            {result && result.width > 0 ? (
              <span className="shrink-0">
                <span className="text-faint/60">· </span>
                {result.width} × {result.height}
              </span>
            ) : null}
            {result ? (
              <span className="shrink-0">
                <span className="text-faint/60">· </span>
                {result.ms} ms
              </span>
            ) : null}
          </div>
        )}
      </div>

      {result ? <RatioBadge originalSize={item.originalSize} compressedSize={result.blob.size} /> : null}

      <span
        className={[
          'shrink-0 rounded-md px-1.5 py-0.5 text-[11px] font-medium',
          STATUS_STYLE[item.status],
        ].join(' ')}
      >
        {item.status === 'processing' ? (
          <span className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            {STATUS_LABEL[item.status]}
          </span>
        ) : (
          STATUS_LABEL[item.status]
        )}
      </span>

      <button
        type="button"
        onClick={() => onRemove(item.id)}
        aria-label={`移除 ${item.name}`}
        className="shrink-0 rounded-md p-1.5 text-faint transition hover:bg-sunken hover:text-ink"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-3.5 w-3.5" aria-hidden="true">
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  )
}
