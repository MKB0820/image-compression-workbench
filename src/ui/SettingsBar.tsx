import type { CompressSettings, EncoderSupport, OutputFormat } from '../types'

interface SettingsBarProps {
  settings: CompressSettings
  /** 启动时的能力探测结果：不可用的编码器直接禁用，而不是让用户选了再静默降级 */
  support: EncoderSupport
  onChange: (next: CompressSettings) => void
}

const FORMATS: Array<{ value: OutputFormat; label: string }> = [
  { value: 'original', label: '保持原格式' },
  { value: 'jpeg', label: 'JPEG' },
  { value: 'webp', label: 'WebP' },
]

function parseDimension(raw: string): number | null {
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) return null
  return Math.floor(value)
}

export function SettingsBar({ settings, support, onChange }: SettingsBarProps) {
  const qualityPercent = Math.round(settings.quality * 100)

  function isDisabled(format: OutputFormat): boolean {
    if (format === 'jpeg') return !support.jpeg
    if (format === 'webp') return !support.webp
    return false
  }

  return (
    <section className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
      <h2 className="text-sm font-semibold text-zinc-900">压缩设置</h2>

      {/* 质量 */}
      <div className="mt-5">
        <div className="flex items-baseline justify-between">
          <label htmlFor="quality" className="text-xs font-medium text-zinc-600">
            质量
          </label>
          <span className="tabular text-xs font-semibold text-zinc-900">{qualityPercent}%</span>
        </div>
        <input
          id="quality"
          type="range"
          min={0.1}
          max={1}
          step={0.01}
          value={settings.quality}
          onChange={(event) => onChange({ ...settings, quality: Number(event.target.value) })}
          className="mt-2 w-full accent-blue-600"
        />
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
          PNG 是无损格式，质量滑块对 PNG 输出无效。
        </p>
      </div>

      {/* 输出格式 */}
      <div className="mt-5">
        <span className="text-xs font-medium text-zinc-600">输出格式</span>
        <div
          role="group"
          aria-label="输出格式"
          className="mt-2 grid grid-cols-3 gap-1 rounded-lg bg-zinc-100 p-1"
        >
          {FORMATS.map((format) => {
            const active = settings.format === format.value
            const disabled = isDisabled(format.value)
            return (
              <button
                key={format.value}
                type="button"
                aria-pressed={active}
                disabled={disabled}
                title={disabled ? '当前浏览器无法从 canvas 编码该格式' : undefined}
                onClick={() => onChange({ ...settings, format: format.value })}
                className={[
                  'rounded-md px-2 py-1.5 text-xs font-medium transition',
                  active
                    ? 'bg-white text-zinc-900 shadow-sm'
                    : 'text-zinc-500 hover:text-zinc-800',
                  disabled ? 'cursor-not-allowed opacity-40 hover:text-zinc-500' : '',
                ].join(' ')}
              >
                {format.label}
              </button>
            )
          })}
        </div>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-400">
          {support.webp ? (
            <>&ldquo;保持原格式&rdquo;下，PNG 仍输出 PNG，不会偷偷转成有损。</>
          ) : (
            <>当前浏览器无法从 canvas 编码 WebP，已禁用该选项。</>
          )}
        </p>
      </div>

      {/* 尺寸限制 */}
      <div className="mt-5">
        <span className="text-xs font-medium text-zinc-600">最大尺寸（px，留空不缩放）</span>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="flex items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 focus-within:border-blue-500">
            <span className="text-[11px] text-zinc-400">宽</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="不限"
              value={settings.maxWidth ?? ''}
              onChange={(event) =>
                onChange({ ...settings, maxWidth: parseDimension(event.target.value) })
              }
              className="tabular w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-300"
            />
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-zinc-200 px-2.5 py-1.5 focus-within:border-blue-500">
            <span className="text-[11px] text-zinc-400">高</span>
            <input
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="不限"
              value={settings.maxHeight ?? ''}
              onChange={(event) =>
                onChange({ ...settings, maxHeight: parseDimension(event.target.value) })
              }
              className="tabular w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-300"
            />
          </label>
        </div>
      </div>
    </section>
  )
}
