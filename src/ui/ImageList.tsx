import { useEffect, useRef, useState } from 'react'
import type { ImageItem } from '../types'
import { ImageRow } from './ImageRow'

/**
 * 固定行高的窗口化列表：只渲染视口内 + 上下各 OVERSCAN 行。
 *
 * 行高固定（84px）是这个方案成立的前提，因此 ImageRow 里所有内容都必须收敛在
 * 一行内（错误信息替换掉元数据行，而不是另起一行）。
 *
 * 滚出视口的行会被卸载，useObjectUrl 的 cleanup 随即 revoke 掉缩略图的
 * objectURL —— 这正是「滚动不留内存」的关键，不需要额外的清理逻辑。
 */
const ROW_HEIGHT = 84
const OVERSCAN = 2

interface ImageListProps {
  items: ImageItem[]
  onRemove: (id: string) => void
}

export function ImageList({ items, onRemove }: ImageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const previousLength = useRef(items.length)
  const [range, setRange] = useState({ start: 0, end: 12 })
  const doneCount = items.filter((item) => item.status === 'done').length

  // 移除某一行时，被聚焦的删除按钮随行一起卸载，焦点会掉回 <body>。
  // 把焦点交还给列表容器，键盘用户可以接着往下 Tab。
  useEffect(() => {
    if (items.length < previousLength.current && document.activeElement === document.body) {
      scrollRef.current?.focus({ preventScroll: true })
    }
    previousLength.current = items.length
  }, [items.length])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    let frame = 0
    const measure = () => {
      frame = 0
      const start = Math.max(0, Math.floor(el.scrollTop / ROW_HEIGHT) - OVERSCAN)
      const end = Math.min(
        items.length,
        Math.ceil((el.scrollTop + el.clientHeight) / ROW_HEIGHT) + OVERSCAN,
      )
      setRange((prev) => (prev.start === start && prev.end === end ? prev : { start, end }))
    }
    const onScroll = () => {
      if (frame === 0) frame = requestAnimationFrame(measure)
    }

    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(el)

    return () => {
      el.removeEventListener('scroll', onScroll)
      observer.disconnect()
      if (frame !== 0) cancelAnimationFrame(frame)
    }
  }, [items.length])

  // 列表变短（删除 / 清空）后把视口拉回有效范围
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const maxScroll = Math.max(0, items.length * ROW_HEIGHT - el.clientHeight)
    if (el.scrollTop > maxScroll) el.scrollTop = maxScroll
  }, [items.length])

  const start = Math.min(range.start, Math.max(0, items.length - 1))
  const end = Math.min(items.length, Math.max(range.end, start + 1))
  const visible = items.slice(start, end)

  return (
    <section className="overflow-hidden rounded-2xl border border-line bg-surface shadow-sm">
      <header className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 className="text-sm font-semibold text-ink">图片列表</h2>
        <span aria-live="polite" className="tabular text-xs text-muted">
          {doneCount} / {items.length} 已完成
        </span>
      </header>

      {/* 视口高度上限 540px；行数随列表增长，但渲染的 DOM 节点数恒定为视口行数 */}
      <div
        ref={scrollRef}
        role="list"
        aria-label={`图片列表，共 ${items.length} 张`}
        tabIndex={-1}
        className="max-h-[min(60vh,540px)] overflow-y-auto overscroll-contain outline-none"
      >
        <div style={{ position: 'relative', height: items.length * ROW_HEIGHT }}>
          {visible.map((item, index) => (
            <div
              key={item.id}
              role="listitem"
              // 虚拟化只挂载视口内的行；这两个属性让读屏软件知道真实的总数与位置
              aria-setsize={items.length}
              aria-posinset={start + index + 1}
              className="absolute inset-x-0 border-b border-line"
              style={{ top: (start + index) * ROW_HEIGHT, height: ROW_HEIGHT }}
            >
              <ImageRow item={item} onRemove={onRemove} />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
