import { useEffect } from 'react'
import { useCompressionPipeline } from './pipeline/useCompressionPipeline'
import { BatchActions } from './ui/BatchActions'
import { DownloadBar } from './ui/DownloadBar'
import { DropZone } from './ui/DropZone'
import { ImageList } from './ui/ImageList'
import { SettingsBar } from './ui/SettingsBar'
import { ThemeToggle } from './ui/ThemeToggle'

export default function App() {
  const {
    items,
    settings,
    setSettings,
    addFiles,
    removeItem,
    clearAll,
    cancelAll,
    rerun,
    downloadZip,
    zipState,
    notice,
    support,
    poolSize,
  } = useCompressionPipeline()

  // 拖到拖拽区以外的地方时，浏览器默认会「导航到该文件」，页面连同所有已处理
  // 的结果一起丢失。在 window 上兜住，只允许 DropZone 自己处理。
  useEffect(() => {
    const prevent = (event: DragEvent) => event.preventDefault()
    window.addEventListener('dragover', prevent)
    window.addEventListener('drop', prevent)
    return () => {
      window.removeEventListener('dragover', prevent)
      window.removeEventListener('drop', prevent)
    }
  }, [])

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-surface/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="min-w-0">
            <h1 className="text-base font-semibold tracking-tight text-ink sm:text-lg">
              图片压缩工作台
            </h1>
            <p className="mt-0.5 truncate text-xs text-muted">
              全部处理在浏览器本地完成，图片不会上传到任何服务器
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span className="hidden items-center gap-1.5 rounded-full border border-line px-3 py-1 text-[11px] font-medium text-muted lg:flex">
              <span className="h-1.5 w-1.5 rounded-full bg-success" />
              纯前端 · Canvas + Web Worker
            </span>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl grid-cols-1 gap-6 px-4 py-5 sm:px-6 sm:py-6 lg:grid-cols-[300px_minmax(0,1fr)] lg:items-start">
        <aside className="order-2 space-y-4 lg:order-1 lg:sticky lg:top-24">
          <SettingsBar settings={settings} support={support} onChange={setSettings} />
          <DownloadBar
            items={items}
            zipState={zipState}
            onDownload={() => void downloadZip()}
            onClear={clearAll}
          />
          <BatchActions
            items={items}
            onCancelAll={cancelAll}
            onRerunFailed={() => rerun('failed')}
            onRerunAll={() => rerun('all')}
          />
        </aside>

        <section className="order-1 min-w-0 space-y-4 lg:order-2">
          <DropZone onFiles={addFiles} compact={items.length > 0} />

          {notice ? (
            <p
              role="status"
              aria-live="polite"
              className="rounded-xl border border-warn/30 bg-warn-soft px-3 py-2 text-xs text-warn"
            >
              {notice}
            </p>
          ) : null}

          {items.length > 0 ? <ImageList items={items} onRemove={removeItem} /> : null}

          <p className="text-center text-[11px] leading-relaxed text-faint">
            解码与编码全部在 Worker 内完成 · {poolSize} 路并发 · 取消即时生效（排队出队 / 运行中终止 worker）
          </p>
        </section>
      </main>
    </div>
  )
}
