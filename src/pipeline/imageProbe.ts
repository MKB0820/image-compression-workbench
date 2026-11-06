/**
 * 只读文件头，拿到「解码后会有多大」以及 EXIF 方向。
 *
 * 用途仅有一个：在 createImageBitmap 之前算出目标尺寸，让解码器直接按缩小后的
 * 尺寸出图（resizeWidth / resizeHeight），避免 50 MP 原图先解出 200 MB 的
 * RGBA 位图再缩放 —— 那是移动端标签页崩溃的主因。
 *
 * 这里读 EXIF 方向**只用于预测显示后的宽高**（方向 5–8 会交换宽高），
 * 绝不用于旋转像素。真正的绘制永远使用 bitmap.width / bitmap.height。
 * 任何解析异常都返回 null，调用方退回全尺寸解码。
 */

export interface ImageProbe {
  /** 文件里存储的像素宽（未考虑方向） */
  width: number
  /** 文件里存储的像素高（未考虑方向） */
  height: number
  /** EXIF Orientation，1–8；无法读取时为 1 */
  orientation: number
}

/** 头部通常远小于这个值；超过就放弃，退回全尺寸解码 */
const MAX_HEADER_BYTES = 256 * 1024

/**
 * 按魔数识别格式，只读前 16 字节。
 *
 * 用途：拖拽绕过了 <input accept>，而来自 Android 内容提供方、某些桌面环境或
 * 第三方应用的 File 常常 type === ''。只看 file.type 会把能正常解码的图片误拒。
 */
export async function sniffMime(file: Blob): Promise<string | null> {
  try {
    const head = new Uint8Array(await file.slice(0, 16).arrayBuffer())

    if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) {
      return 'image/jpeg'
    }
    if (head.length >= 8 && head[0] === 0x89 && ascii(head, 1, 4) === 'PNG') {
      return 'image/png'
    }
    if (head.length >= 12 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 12) === 'WEBP') {
      return 'image/webp'
    }
    return null
  } catch {
    return null
  }
}

export async function probeImage(file: Blob): Promise<ImageProbe | null> {
  try {
    const header = await file.slice(0, Math.min(file.size, MAX_HEADER_BYTES)).arrayBuffer()
    const view = new DataView(header)
    const bytes = new Uint8Array(header)

    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
      return probeJpeg(view, bytes)
    }
    if (bytes.length >= 24 && bytes[0] === 0x89 && ascii(bytes, 1, 4) === 'PNG') {
      return probePng(view)
    }
    if (bytes.length >= 30 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 12) === 'WEBP') {
      return probeWebp(view, bytes)
    }
    return null
  } catch {
    return null
  }
}

/* ─────────────────────────────── JPEG ─────────────────────────────── */

function probeJpeg(view: DataView, bytes: Uint8Array): ImageProbe | null {
  let offset = 2
  let width = 0
  let height = 0
  let orientation = 1

  while (offset + 4 <= bytes.length) {
    if (bytes[offset] !== 0xff) {
      offset += 1 // 记号失步时向前重新对齐
      continue
    }

    const marker = bytes[offset + 1]

    // 无长度字段的标记
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0xd8) {
      offset += 2
      continue
    }
    if (marker === 0xd9 || marker === 0xda) break // EOI / 扫描开始

    const length = view.getUint16(offset + 2, false)
    if (length < 2) break

    const segmentStart = offset + 4
    const segmentEnd = offset + 2 + length
    if (segmentEnd > bytes.length) break

    // APP1 + "Exif\0\0"
    if (marker === 0xe1 && segmentStart + 6 <= segmentEnd && ascii(bytes, segmentStart, segmentStart + 4) === 'Exif') {
      orientation = readExifOrientation(view, segmentStart + 6, segmentEnd) ?? orientation
    }

    // SOF0–SOF15，排除 DHT(C4) / JPG(C8) / DAC(CC)
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc
    if (isSof && segmentStart + 5 <= segmentEnd) {
      height = view.getUint16(segmentStart + 1, false)
      width = view.getUint16(segmentStart + 3, false)
    }

    offset = segmentEnd
    if (width > 0 && height > 0 && orientation !== 1) break
  }

  return width > 0 && height > 0 ? { width, height, orientation } : null
}

/* ─────────────────────────────── PNG ─────────────────────────────── */

function probePng(view: DataView): ImageProbe | null {
  // 8 字节签名 + chunk length(4) + 'IHDR'(4) + width(4) + height(4)
  if (view.byteLength < 24 || ascii(new Uint8Array(view.buffer, view.byteOffset), 12, 16) !== 'IHDR') {
    return null
  }
  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  return width > 0 && height > 0 ? { width, height, orientation: 1 } : null
}

/* ─────────────────────────────── WebP ─────────────────────────────── */

function probeWebp(view: DataView, bytes: Uint8Array): ImageProbe | null {
  let offset = 12
  let width = 0
  let height = 0
  let orientation = 1

  while (offset + 8 <= bytes.length) {
    const type = ascii(bytes, offset, offset + 4)
    const size = view.getUint32(offset + 4, true)
    const dataStart = offset + 8
    const dataEnd = Math.min(bytes.length, dataStart + size)

    if (type === 'VP8X' && dataStart + 10 <= bytes.length) {
      width = 1 + readUint24LE(bytes, dataStart + 4)
      height = 1 + readUint24LE(bytes, dataStart + 7)
    } else if (type === 'VP8 ' && dataStart + 10 <= bytes.length) {
      const startCode = bytes[dataStart + 3] === 0x9d && bytes[dataStart + 4] === 0x01 && bytes[dataStart + 5] === 0x2a
      if (startCode && width === 0) {
        width = view.getUint16(dataStart + 6, true) & 0x3fff
        height = view.getUint16(dataStart + 8, true) & 0x3fff
      }
    } else if (type === 'VP8L' && dataStart + 5 <= bytes.length) {
      if (bytes[dataStart] === 0x2f && width === 0) {
        const b0 = bytes[dataStart + 1]
        const b1 = bytes[dataStart + 2]
        const b2 = bytes[dataStart + 3]
        const b3 = bytes[dataStart + 4]
        width = 1 + (((b1 & 0x3f) << 8) | b0)
        height = 1 + (((b3 & 0x0f) << 10) | (b2 << 2) | ((b1 & 0xc0) >> 6))
      }
    } else if (type === 'EXIF' && dataStart + 8 <= dataEnd) {
      orientation = readExifOrientation(view, dataStart, dataEnd) ?? orientation
    }

    offset = dataStart + size + (size & 1) // chunk 按偶数字节对齐
  }

  return width > 0 && height > 0 ? { width, height, orientation } : null
}

/* ─────────────────────────────── EXIF ─────────────────────────────── */

/** 读 TIFF/IFD0 里的 Orientation(0x0112)。任何越界都返回 null。 */
function readExifOrientation(view: DataView, start: number, end: number): number | null {
  if (start + 8 > end) return null

  const byteOrder = view.getUint16(start, false)
  let little: boolean
  if (byteOrder === 0x4949) little = true
  else if (byteOrder === 0x4d4d) little = false
  else return null

  if (view.getUint16(start + 2, little) !== 0x002a) return null

  const ifdOffset = view.getUint32(start + 4, little)
  const ifd = start + ifdOffset
  if (ifd + 2 > end) return null

  const count = view.getUint16(ifd, little)
  for (let i = 0; i < count; i += 1) {
    const entry = ifd + 2 + i * 12
    if (entry + 12 > end) return null

    if (view.getUint16(entry, little) === 0x0112) {
      if (view.getUint16(entry + 2, little) !== 3) return null // SHORT
      const value = view.getUint16(entry + 8, little)
      return value >= 1 && value <= 8 ? value : null
    }
  }
  return null
}

/* ─────────────────────────────── 工具 ─────────────────────────────── */

function ascii(bytes: Uint8Array, start: number, end: number): string {
  let result = ''
  for (let i = start; i < end && i < bytes.length; i += 1) result += String.fromCharCode(bytes[i])
  return result
}

function readUint24LE(bytes: Uint8Array, offset: number): number {
  return bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16)
}
