import type { EncoderSupport, OutputFormat } from '../types'

/** 能力探测完成前的乐观默认值：探测通常几毫秒内结束 */
export const ALL_SUPPORTED: EncoderSupport = { jpeg: true, png: true, webp: true }

/** 画布只能稳定地编码 JPEG / PNG / WebP，其它格式一律不接收 */
export const ACCEPTED_MIME = ['image/jpeg', 'image/png', 'image/webp'] as const
export type AcceptedMime = (typeof ACCEPTED_MIME)[number]

export function isAcceptedMime(type: string): type is AcceptedMime {
  return (ACCEPTED_MIME as readonly string[]).includes(type)
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '—'
  if (bytes < 1024) return `${Math.round(bytes)} B`

  const units = ['KB', 'MB', 'GB'] as const
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value >= 100 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

/** 返回 0–1 的节省比例；负数表示压缩后反而变大了 */
export function savings(originalSize: number, compressedSize: number): number {
  if (originalSize <= 0) return 0
  return 1 - compressedSize / originalSize
}

/**
 * 把用户选择解析成一个**本机真的能编码**的具体 MIME。
 *
 * 编码器不支持时绝不能原样传下去：canvas 会静默退回 PNG，于是用户拿到一个
 * 后缀与内容不符的文件。这里提前降级，UI 也会把不可用的选项置灰。
 */
export function resolveTargetMime(
  format: OutputFormat,
  sourceType: string,
  support: EncoderSupport = ALL_SUPPORTED,
): string {
  if (format === 'jpeg') {
    return support.jpeg ? 'image/jpeg' : 'image/png'
  }

  if (format === 'webp') {
    if (support.webp) return 'image/webp'
    return support.jpeg ? 'image/jpeg' : 'image/png'
  }

  const source = isAcceptedMime(sourceType) ? sourceType : 'image/png'
  if (source === 'image/jpeg' && !support.jpeg) return 'image/png'
  if (source === 'image/webp' && !support.webp) {
    return support.jpeg ? 'image/jpeg' : 'image/png'
  }
  return source
}

export function extensionForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    default:
      return 'bin'
  }
}

export function labelForMime(mime: string): string {
  switch (mime) {
    case 'image/jpeg':
      return 'JPEG'
    case 'image/png':
      return 'PNG'
    case 'image/webp':
      return 'WebP'
    default:
      return mime || '未知'
  }
}
