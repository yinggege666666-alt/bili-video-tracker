# B站视频数据跟踪（云端版）

数据由 GitHub Actions 每小时自动抓取并保存到仓库，GitHub Pages 提供公开网页。
任何电脑打开网页地址即可查看最新数据，不需要运行本地程序。

## 文件说明

- `config.json`：要跟踪的 BV 号列表，按顺序排列。
- `cloud_fetch.py`：抓取脚本，写入 `public/data.json`。
- `.github/workflows/update.yml`：每小时自动运行抓取脚本。
- `public/`：网页文件，GitHub Pages 直接从该目录发布。

## 在网页上添加/删除视频

网页上的添加/删除按钮会打开一个预先填好的 GitHub Issue。
GitHub Actions 在下一小时运行时自动处理该 Issue 并关闭它，处理完成后数据会更新。

## 本地测试

```powershell
python cloud_fetch.py
```

然后打开 `public/index.html`，或在本目录运行：

```powershell
python -m http.server 8810
```
