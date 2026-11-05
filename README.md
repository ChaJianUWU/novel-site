# 小说站（自建服务器版）

一个**免登录**的公开小说站：任何人打开网页就能发布、编辑、接着写，但**必须留作者名**。
本地 DSH 关掉也照常在线，24 小时可读。

零依赖，Node 18+ 直接跑；同一套代码也能用 Docker 跑在任何云主机上。

---

## 一、三分钟本地自测

```powershell
cd D:\DFY\novel-site-server
npm start
```

启动后会打印三行：访问地址、数据目录、**同步密钥**。

- 打开 http://127.0.0.1:8787 就是站点
- 数据存在 `data\kv.json`（纯 JSON，随时可备份/搬运）

---

## 二、放到公网（国内能打开）

Cloudflare 的 `*.workers.dev` 在国内被 DNS 污染 + TLS 阻断，打不开，所以换平台。
下面按「省事程度」排序，都实测过域名从国内可达。

### 方案 A：Render（推荐，免费，不用信用卡）

1. 把本目录传到一个 **GitHub 仓库**（Private 也可以；只传代码，别传 `data\`、`boot.log`）：
   ```powershell
   cd D:\DFY\novel-site-server
   git remote add origin https://github.com/你的用户名/novel-site.git
   git branch -M main
   git push -u origin main
   ```
   （仓库已经 init + commit 好了，就上面三条。没有远程仓库就去 GitHub 网页 New repository，名字 `novel-site`，**不要**勾 Add README，然后复制它给的地址替换掉那行 URL。）
2. 打开 https://render.com → 用 GitHub 账号登录 → **New + → Web Service** → 首次会让你授权 Render 访问 GitHub，选 `Only select repositories` 只给这一个仓库。
3. 填：
   - Language / Runtime：`Node`
   - Branch：`main`
   - Build Command：`echo "no build needed"`
   - Start Command：`node server.mjs`
   - Instance Type：`Free`
   - Environment Variables（点 Add Environment Variable）：
     - `DATA_DIR` = `/data`
     - `SYNC_KEY` = 自己编一串，比如 `my-secret-key-2024`（**记下来，插件要用**）
     - `NODE_VERSION` = `20`
4. 点 **Deploy Web Service**，等 1～2 分钟，日志出现 `小说站已启动` 就成了，地址是 `https://xxx.onrender.com`。
   打开它应该看到书架页；`https://xxx.onrender.com/healthz` 返回 `{"ok":true}` 就是活的。

**免费层的三个坑（务必看）**

1. **休眠**：15 分钟没人访问就休眠，下一个访客要等 ~50 秒才出页面。对策：去 https://uptimerobot.com 注册免费账号，加一个 HTTP 监控，URL 填 `https://xxx.onrender.com/healthz`，间隔 5 分钟，就等于常驻不睡（免费额度够）。
2. **没有持久磁盘**：重启/重新部署后 `data/` 被清空，访客投稿会没。**本地 DSH 的稿库才是主库**，在插件里点一次「发布到公网」就整库恢复。
3. 要真正长期存访客投稿：Render 挂 1GB 磁盘（约 $1/月，需绑卡），或者直接上方案 C 国内 VPS（数据在本地盘，最省心）。

### 方案 B：Koyeb（免费层，无需信用卡）

1. 同样先推到公开 GitHub 仓库。
2. https://app.koyeb.com → **Create Service → GitHub** → 选仓库 → 部署方式选 **Buildpack**。
3. Run command：`node server.mjs`；Port：`8787`；实例选 **Free**。
4. 环境变量同上（`SYNC_KEY`、`DATA_DIR=/data`），得到 `https://xxx.koyeb.app`。

### 方案 C：国内 VPS（最稳，数据不丢）

轻量应用服务器 ~¥99/年，选「应用镜像 → Docker」或用纯净系统装 Node：

```bash
# 1. 上传代码（只传 3 个文件就够）
scp Dockerfile package.json server.mjs site-core.js root@你的IP:/opt/novel/

# 2. 构建并启动
cd /opt/novel
docker build -t novel-site .
docker run -d --name novel --restart always \
  -p 8787:8787 \
  -e SYNC_KEY=自己编的密钥 \
  -v /opt/novel/data:/data \
  novel-site
```

访问 `http://你的IP:8787`。**用端口访问不用备案**；想用 80/443 + 域名才需要备案。

要开机自启：`systemctl` 或直接 `--restart always`（上面已加，重启机器会自动拉起）。

### 方案 D：任何一台装了 Docker 的机器 / 群晖 / NAS

```bash
docker run -d --restart always -p 8787:8787 \
  -e SYNC_KEY=自己编的密钥 -v $(pwd)/data:/data novel-site
```

---

## 三、把 DSH 里的稿子推上去

1. 打开 DSH 左侧栏「小说站」面板。
2. 「站点设置」卡片里，**发布到哪里** 选 `自建服务器`。
3. **服务器网址** 填 `https://xxx.onrender.com`（或 `http://IP:8787`），点「保存地址」。
4. **同步密钥** 填服务器上的 `SYNC_KEY`（本地跑的话，看启动日志里那串）。
5. 点「发布到公网」。成功会显示「已推送 N 本」。

之后每次改完稿子，再点一次「发布到公网」就同步过去了。
访客在网页上直接投稿/续写，服务器上立刻生效，不需要经过本机。

---

## 四、站点行为说明

| 动作 | 规则 |
| --- | --- |
| 发布新书 | 免登录，**作者名必填**（不填直接报错拒绝） |
| 上传整本文件 | `/upload` 选 `.txt` / `.md`，自动识别「第X章 / 序章 / Chapter N / # 标题」并分章，可先预览再发布 |
| 给已有书追加 | `/edit/:id` 里「导入文件追加」，按同样规则分章接在后面 |
| 编辑自己的书 | 建书时发的 18 位编辑口令存在访客浏览器里，凭口令改 |
| 编辑口令丢了 | 用「书名 + 作者名」在 `/upload` 页找回；站长也可用同步密钥整库覆盖 |
| 站长后台 | `/admin`，用管理员密钥（启动日志里的「管理员密钥」，或 `DATA_DIR/admin-key.txt` / `ADMIN_KEY` 环境变量） |
| 站长权限 | 看全站统计、改站名/公告、开关公开投稿、删任意书、改任意书 |
| 导出 | `/api/export/:id` 或书页「导出 txt」按钮，直接下载全文 |
| 阅读体验 | 深/浅色切换、字号调节、←/→ 翻章，设置存在访客浏览器 |
| 章节结构 | 章节可增删改，支持上/下一章跳转 |
| 数据落地 | `DATA_DIR/kv.json`，原子写入（临时文件 + rename） |

接口一览（自建版和 Cloudflare 版完全一致）：

```
GET  /healthz                      健康检查
GET  /api/site                     站点配置 + 书架
GET  /api/novels                   书架列表
POST /api/split                    只分章预览，不写库
POST /api/import                   新建书 + 正文自动分章（author 必填）
POST /api/novel                    新建书（author 必填）
GET  /api/novel/:id                书详情
PUT  /api/novel/:id                改书名/作者/简介
DELETE /api/novel/:id              删书（编辑口令或管理员密钥）
POST /api/novel/:id/import         追加导入（自动分章）
GET  /api/novel/:id/:cid           读一章
POST /api/novel/:id/chapter        加章
PUT  /api/novel/:id/chapter/:cid   改章
DELETE /api/novel/:id/chapter/:cid 删章
GET  /api/export/:id               导出整本 txt
GET  /api/keys?title=&author=      找回编辑口令
POST /api/admin/login              校验管理员密钥
GET  /api/admin/overview           全站统计（需 x-admin-key）
PUT  /api/admin/config             改站点设置（需 x-admin-key）
POST /api/admin/rebuild            重建书架索引（需 x-admin-key）
POST /api/sync                     整库覆盖（需 x-sync-key）
```

所有写操作都接受两种凭证：`x-edit-key`（这本书的口令）或 `x-admin-key`（站长密钥）；
同步接口另外只认 `x-sync-key`，因为它是给插件整库覆盖用的。

页面路由：`/` 书架、`/n/:id` 书页、`/r/:id/:cid` 阅读、`/upload` 投稿/导入、`/edit/:id` 编辑、`/admin` 后台。

### 自测

```powershell
node verify2.mjs        # 起临时目录+临时端口，把页面、分章、导入、权限、同步、导出全跑一遍
node migrate-legacy.mjs # 旧数据升级（幂等，可重复跑）
```


---

## 五、备份与搬家

```powershell
# 备份
Copy-Item D:\DFY\novel-site-server\data\kv.json D:\备份\kv-$(Get-Date -f yyyyMMdd).json

# 搬到新机器
scp data\kv.json root@新IP:/opt/novel/data/
```

`data\kv.json` 就是全部内容（含编辑口令），别公开它。
