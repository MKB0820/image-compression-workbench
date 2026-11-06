# 性能验证方案

目标：验证三件事 —— 超大幅图不会 OOM、500 张列表的 DOM 恒定、滚动时不泄漏 objectURL。

## 1. 造测试数据

```powershell
Add-Type -AssemblyName System.Drawing
$dir = "D:\path\to\project\.tmp-fixtures"
New-Item -ItemType Directory -Force $dir | Out-Null

# 48 MP 大图（8000×6000）
$bmp = [System.Drawing.Bitmap]::new(8000, 6000)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(15, 23, 42))
$rand = [System.Random]::new(3)
for ($i = 0; $i -lt 600; $i++) {
  $c = [System.Drawing.Color]::FromArgb($rand.Next(256), $rand.Next(256), $rand.Next(256))
  $b = [System.Drawing.SolidBrush]::new($c)
  $g.FillEllipse($b, $rand.Next(8000), $rand.Next(6000), $rand.Next(80, 700), $rand.Next(80, 700))
  $b.Dispose()
}
$g.Dispose()
$bmp.Save("$dir\huge-48mp.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()

# 一张 3000×2000 的样板图
$bmp = [System.Drawing.Bitmap]::new(3000, 2000)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(37, 99, 235))
$brush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(250, 204, 21))
$g.FillEllipse($brush, 400, 300, 1200, 1200)
$g.Dispose()
$bmp.Save("$dir\big.jpg", [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bmp.Dispose()

# 300 张副本（约 185 MB）
New-Item -ItemType Directory -Force "$dir\mass" | Out-Null
1..300 | ForEach-Object {
  Copy-Item "$dir\big.jpg" ("$dir\mass\img-{0:D3}.jpg" -f $_)
}
```

没有 System.Drawing 时，用任意 300 张真实照片放进 `mass/` 即可，文件名无所谓。

## 2. 跑起来

```bash
npm run dev
# 打开 http://localhost:5173
# 设置面板把「最大宽度」填 1000，然后把 300 张一起拖进拖拽区
```

## 3. 观察指标

在浏览器控制台：

```js
// 渲染的行数（恒定，与列表长度无关）
document.querySelectorAll('[role="listitem"]').length

// 页面总节点数
document.querySelectorAll('*').length

// 存活的 objectURL（需要先 patch，见下）
window.__liveUrls.size
```

统计 objectURL 是否泄漏：

```js
// 在上传之前执行一次
window.__liveUrls = new Set()
const create = URL.createObjectURL.bind(URL)
const revoke = URL.revokeObjectURL.bind(URL)
URL.createObjectURL = (b) => { const u = create(b); window.__liveUrls.add(u); return u }
URL.revokeObjectURL = (u) => { window.__liveUrls.delete(u); return revoke(u) }
```

然后把列表滚到底再滚回来，`__liveUrls.size` 应始终等于当前可见行数（±overscan），
而不是随滚动次数增长。

## 4. 对照实验（解码期降采样）

同一张 48 MP 图：

| 设置 | 预期 |
|---|---|
| 最大宽/高留空 | 输出 8000×6000，耗时明显更长 |
| 最大宽 1920 | 输出 1920×1440，耗时显著下降 |

如果两者耗时接近，说明 `resizeHint()` 没有生效（检查文件头解析是否返回 null）。

## 5. 基线数据（Chrome，16 核）

| 场景 | 结果 |
|---|---|
| 48 MP 不限尺寸 | 8000×6000，1474 ms |
| 48 MP 最大宽 1920 | 1920×1440，555 ms |
| 300 张 3000×2000，最大宽 1000 | 11.0 s 全部完成 |
| 300 张时的行节点 | 9–11 个（滚动位置不同略有差异） |
| 300 张时的总节点 | 275–317 |
| 滚动时的存活 objectURL | 9–11，与可见行数一致 |
