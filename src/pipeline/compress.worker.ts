import type { CompressRequest, CompressResponse } from '../types'
import { probeImage } from './imageProbe'

/**
 * 压缩 Worker：解码 → 等比缩放 → （仅 JPEG）白底 → 编码 → 回传 Blob。
 *
 * 三条不能破的规则：
 * 1. 不解析 EXIF、不调用 rotate。createImageBitmap 的规范默认值是
 *    imageOrientation: 'from-image'，解码时方向已经烘进像素，宽高也已交换。
 *    再按 0x0112 转一次就是二次旋转。
 * 2. 只用 convertToBlob。OffscreenCanvas 没有 toBlob；Firefox 的废弃桩
 *    toBlob 返回一个永不 resolve 的 Promise，探测它会让整条队列挂死。
 * 3. 回传 blob.type 而不是请求的 MIME。请求不支持的格式时浏览器静默给 PNG。
 */

const scope = self as unknown as DedicatedWorkerGlobalScope

interface CanvasTarget {
  canvas: OffscreenCanvas
  ctx: OffscreenCanvasRenderingContext2D
}

// 每个 worker 复用一个画布：反复 new OffscreenCanvas 会让 GPU 侧不断重新分配
let surface: CanvasTarget | null = null

function post(response: CompressResponse): void {
  scope.postMessage(response)
}

scope.onmessage = (event: MessageEvent<CompressRequest>) => {
  const request = event.data
  if (!request || request.type !== 'compress') return
  void handle(request)
}

async function handle(request: CompressRequest): Promise<void> {
  const startedAt = performance.now()
  let bitmap: ImageBitmap | null = null

  try {
    const { settings, targetMime } = request

    // 解码。方向在这里被正确应用，bitmap.width/height 已经是「摆正后」的尺寸，
    // 所以后面的缩放计算不能用任何 EXIF 里的原始宽高。
    //
    // 如果设了最大宽/高，先读文件头算出目标尺寸，让解码器**直接按缩小后的尺寸出图**：
    // 50 MP 原图全尺寸解码会产生约 200 MB 的 RGBA 位图，这正是移动端崩标签页的原因。
    const hint = await resizeHint(request)
    bitmap = hint ? await createImageBitmap(request.file, hint) : await createImageBitmap(request.file)

    const size = fitInside(bitmap.width, bitmap.height, settings.maxWidth, settings.maxHeight)
    const { canvas, ctx } = ensureCanvas(size.width, size.height)

    if (targetMime === 'image/jpeg') {
      // JPEG 没有 alpha 通道：透明像素会被合成为黑色。
      // 白底必须在 drawImage 之前铺，铺在后面会把图片本身盖掉。
      ctx.fillStyle = '#ffffff'
      ctx.fillRect(0, 0, size.width, size.height)
    } else {
      // 非 JPEG 输出保留透明区域（画布 resize 后本来也会清空，这里显式写清楚意图）
      ctx.clearRect(0, 0, size.width, size.height)
    }

    // imageSmoothingEnabled 默认就是 true，画布 resize 后也会重置为 true，不必重复赋值
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, size.width, size.height)

    const blob = await canvas.convertToBlob(encodeOptions(targetMime, settings.quality))

    post({
      type: 'compressed',
      jobId: request.jobId,
      result: {
        blob,
        // 真实 MIME —— 扩展名和 ZIP 条目名都从这里派生
        mime: blob.type || targetMime,
        width: size.width,
        height: size.height,
        ms: Math.round(performance.now() - startedAt),
      },
    })
  } catch (error) {
    post({
      type: 'failed',
      jobId: request.jobId,
      message: describeError(error),
    })
  } finally {
    // close() 是唯一能确定性地释放位图显存的手段，GC 不可依赖。
    // 12 MP 的 RGBA 位图约 46 MB，漏掉几张就会把标签页撑爆。
    bitmap?.close()
  }
}

/**
 * 解码期降采样的参数。
 *
 * 只约束**长边**：长边在 EXIF 方向交换前后是同一个数，所以即使头部对方向判断
 * 有偏差，也只会多解一点像素，绝不会少于目标所需的分辨率。
 * 没有设置最大宽/高时返回 null —— 那时输出尺寸等于原图，全尺寸解码不可避免。
 */
async function resizeHint(request: CompressRequest): Promise<ImageBitmapOptions | null> {
  const { maxWidth, maxHeight } = request.settings
  if (!maxWidth && !maxHeight) return null

  const probe = await probeImage(request.file)
  if (!probe) return null

  const swap = probe.orientation >= 5 // 5–8 会交换显示宽高
  const displayWidth = swap ? probe.height : probe.width
  const displayHeight = swap ? probe.width : probe.height

  const target = fitInside(displayWidth, displayHeight, maxWidth, maxHeight)
  if (target.width >= displayWidth && target.height >= displayHeight) return null // 不需要缩小

  const longEdge = Math.max(target.width, target.height)
  return displayWidth >= displayHeight
    ? { resizeWidth: longEdge, resizeQuality: 'high' }
    : { resizeHeight: longEdge, resizeQuality: 'high' }
}

function ensureCanvas(width: number, height: number): CanvasTarget {
  if (!surface) {
    const canvas = new OffscreenCanvas(width, height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('无法创建 OffscreenCanvas 2D 上下文')
    surface = { canvas, ctx }
    return surface
  }

  // 赋值 width/height 会重置画布状态，但 context 对象本身仍然有效
  if (surface.canvas.width !== width || surface.canvas.height !== height) {
    surface.canvas.width = width
    surface.canvas.height = height
  }
  return surface
}

/** 等比缩放到 maxWidth / maxHeight 之内；只缩不放 */
function fitInside(
  width: number,
  height: number,
  maxWidth: number | null,
  maxHeight: number | null,
): { width: number; height: number } {
  const limitW = maxWidth && maxWidth > 0 ? maxWidth : Infinity
  const limitH = maxHeight && maxHeight > 0 ? maxHeight : Infinity
  const scale = Math.min(1, limitW / width, limitH / height)

  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

function encodeOptions(mime: string, quality: number): ImageEncodeOptions {
  // PNG 是无损的，质量参数被忽略；不要传，免得让人以为它在起作用
  if (mime === 'image/png') return { type: 'image/png' }

  // 非数字 / 越界的 quality 会被引擎丢弃并退回默认值（Chromium WebP ≈ 0.8），
  // 表现为「滑块拖了但输出字节完全一样」
  const safeQuality = Number.isFinite(quality) ? Math.min(1, Math.max(0.1, quality)) : 0.8
  return { type: mime, quality: safeQuality }
}

function describeError(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === 'InvalidStateError') return '无法解码该图片：文件可能已损坏'
    if (error.name === 'EncodingError') return '编码失败：浏览器无法输出该格式'
    return error.message || error.name
  }
  if (error instanceof Error) return error.message
  return String(error)
}
