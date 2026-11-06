import type { EncoderSupport } from '../types'

/**
 * 编码能力探测。
 *
 * 为什么必须探测而不是查 UA / 查 caniuse：
 * canvas 在遇到不支持的 MIME 时**不会抛错**，而是静默地按 PNG 编码。
 * Safari 至今不能从 canvas 编码 WebP，所以请求 image/webp 会拿到一个
 * blob.type === 'image/png' 的结果。如果直接把用户选的 .webp 扩展名贴上去，
 * 交付的就是「后缀是 webp、内容是 png」的文件。
 *
 * 判定标准只有一条：返回的 blob.type 必须严格等于请求的 MIME。
 */

let cached: Promise<EncoderSupport> | null = null

export function detectEncoders(): Promise<EncoderSupport> {
  cached ??= probe()
  return cached
}

async function probe(): Promise<EncoderSupport> {
  const [jpeg, png, webp] = await Promise.all([
    canEncode('image/jpeg'),
    canEncode('image/png'),
    canEncode('image/webp'),
  ])
  return { jpeg, png, webp }
}

async function canEncode(mime: string): Promise<boolean> {
  try {
    if (typeof OffscreenCanvas === 'undefined') {
      // 连 OffscreenCanvas 都没有的环境本来也跑不了这个 worker；
      // 保守起见只认 PNG。
      return mime === 'image/png'
    }

    const canvas = new OffscreenCanvas(4, 4)
    const context = canvas.getContext('2d')
    if (!context) return false

    // 画点内容：部分实现对全空画布有优化，可能不真正走编码器
    context.fillStyle = '#808080'
    context.fillRect(0, 0, 4, 4)

    const blob = await canvas.convertToBlob({ type: mime })
    return blob.type === mime
  } catch {
    return false
  }
}
