/**
 * crypto.randomUUID() 只在安全上下文（https / localhost）可用。
 * 用局域网 IP 以 http 打开 dev server 时它是 undefined，而任务 id 同时被当作
 * worker 的 jobId —— 所以在入口处兜底，避免整个导入流程静默失败。
 */
export function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }

  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes) // getRandomValues 不受安全上下文限制
  let id = ''
  for (const byte of bytes) id += byte.toString(16).padStart(2, '0')
  return id
}
