import { extensionForMime } from './format'

const UNSAFE = /[<>:"/\\|?*\u0000-\u001f]/g

function sanitizeBase(name: string): string {
  const withoutExt = name.replace(/\.[^./\\]+$/, '')
  const cleaned = withoutExt.replace(UNSAFE, '_').trim()
  // 按码点截断：按 UTF-16 单元切会把 emoji 劈成半个代理对，编码成 ZIP 条目名时变成 U+FFFD
  return Array.from(cleaned).slice(0, 80).join('') || 'image'
}

/**
 * 生成 ZIP 条目名：
 * - 去掉任何路径分隔符（ZIP 里的 ../ 是路径穿越）；
 * - 扩展名取自真实 blob.type，而不是用户选择的格式；
 * - 重名时追加 (1)(2)，否则同名文件会在压缩包里互相覆盖。
 */
export function toZipEntryName(originalName: string, mime: string, used: Set<string>): string {
  const base = sanitizeBase(originalName)
  const ext = extensionForMime(mime)

  let candidate = `${base}.${ext}`
  let index = 1
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base} (${index}).${ext}`
    index += 1
  }
  used.add(candidate.toLowerCase())
  return candidate
}
