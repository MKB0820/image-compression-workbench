/**
 * 把构建产物打成 ZIP（条目名强制使用正斜杠）。
 *
 * Windows 的 Compress-Archive 会把 `assets\index-xxx.js` 这样的反斜杠写进条目名，
 * Cloudflare 的直传只会把它当成一个带反斜杠的平铺文件名，导致所有 /assets/* 404。
 *
 * 用法：node scripts/zip-dist.mjs [源目录] [输出文件]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { zipSync } from 'fflate'

const root = process.argv[2] ?? 'dist'
const out = process.argv[3] ?? 'dist.zip'

const files = {}
const walk = (current) => {
  for (const name of readdirSync(current)) {
    const full = join(current, name)
    if (statSync(full).isDirectory()) walk(full)
    else files[relative(root, full).split(sep).join('/')] = new Uint8Array(readFileSync(full))
  }
}

walk(root)
writeFileSync(out, zipSync(files, { level: 6 }))
console.log(Object.keys(files).join('\n'))
