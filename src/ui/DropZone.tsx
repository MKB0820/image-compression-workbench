import { useRef, useState } from 'react'

interface DropZoneProps {
  /** 可能是异步的：未知 MIME 的文件需要先按魔数嗅探格式 */
  onFiles: (files: File[]) => void | Promise<void>
  compact?: boolean
}

export function DropZone({ onFiles, compact = false }: DropZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const dragDepth = useRef(0)
  const [isOver, setIsOver] = useState(false)

  function openPicker() {
    inputRef.current?.click()
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="拖拽图片到此处，或点击选择文件"
      onClick={openPicker}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          openPicker()
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault()
        dragDepth.current += 1
        setIsOver(true)
      }}
      onDragOver={(event) => {
        event.preventDefault()
      }}
      onDragLeave={(event) => {
        event.preventDefault()
        // 子元素间移动也会触发 dragleave，用计数器抵消
        dragDepth.current = Math.max(0, dragDepth.current - 1)
        if (dragDepth.current === 0) setIsOver(false)
      }}
      onDrop={(event) => {
        event.preventDefault()
        dragDepth.current = 0
        setIsOver(false)
        void onFiles(Array.from(event.dataTransfer.files))
      }}
      className={[
        'group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed text-center outline-none transition',
        'focus-visible:ring-2 focus-visible:ring-blue-500/40',
        compact ? 'gap-1 px-6 py-5' : 'gap-2 px-6 py-16',
        isOver
          ? 'border-blue-500 bg-blue-50'
          : 'border-zinc-300 bg-white hover:border-zinc-400 hover:bg-zinc-50',
      ].join(' ')}
    >
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        // 隐藏 input 的 click 会冒泡回外层 div，不拦住会递归触发
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const files = Array.from(event.target.files ?? [])
          if (files.length > 0) void onFiles(files)
          event.target.value = ''
        }}
      />

      <svg
        aria-hidden="true"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className={[
          'text-zinc-400 transition group-hover:text-zinc-500',
          compact ? 'h-5 w-5' : 'h-9 w-9',
        ].join(' ')}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 7.5 12 3m0 0L7.5 7.5M12 3v13.5"
        />
      </svg>

      <p className={compact ? 'text-sm font-medium text-zinc-700' : 'text-base font-medium text-zinc-800'}>
        {compact ? '继续添加图片' : '把图片拖到这里'}
      </p>
      <p className="text-xs text-zinc-500">
        {compact ? '或点击选择' : '也可以点击选择 · 支持 JPEG / PNG / WebP，可多选'}
      </p>
    </div>
  )
}
