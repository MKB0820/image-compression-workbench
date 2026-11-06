import { useEffect, useState } from 'react'

/**
 * Blob → objectURL，并在 blob 变化或组件卸载时自动 revoke。
 *
 * 缩略图只走这一条路：不保留 ImageBitmap、不让 worker 回传缩略图，
 * 因为解码后的位图是 OOM 的主要来源，而浏览器自己显示 objectURL 时
 * 已经会正确处理 EXIF 方向。压缩完成后传进来的是「压缩后的 Blob」，
 * 于是列表里看到的就是真实的输出效果。
 */
export function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null)

  useEffect(() => {
    if (!blob) {
      setUrl(null)
      return
    }
    const next = URL.createObjectURL(blob)
    setUrl(next)
    return () => {
      URL.revokeObjectURL(next)
    }
  }, [blob])

  return url
}
