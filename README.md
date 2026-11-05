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

1. 把本目录传到一个 **公开的 GitHub 仓库**（只传代码，别传 `data\`）：
   ```powershell
   cd D:\DFY\novel-site-server
   git init
   git add .
   git commit -m "novel site"
   git branch -M main
   git remote add origin https://github.com/你的用户名/novel-site.git
   git push -u origin main
   ```
2. 打开 https://render.com → 用 GitHub 账号登录 → **New + → Web Service** → 选这个仓库。
3. 填：
   - Runtime：`Node`
   - Build Command：`echo "no build needed"`
   - Start Command：`node server.mjs`
   - Instance Type：`Free`
   - Environment Variables：
     - `DATA_DIR` = `/data`
     - `SYNC_KEY` = 自己编一串，比如 `my-secret-key-2024`（**记下来，插件要用**）
4. 点 **Create Web Service**，等 1～2 分钟，得到 `https://xxx.onrender.com`。

**免费层的坑**：没有持久磁盘，服务重启/休眠唤醒后 `data/` 会被清空。
所以 **本地 DSH 里的稿库才是主库**，随时在插件里点一次「发布到公网」就恢复。
真要长期存访客投稿：Render 挂 1GB 磁盘（约 $1/月，需信用卡）或直接上方案 C。

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
| 编辑自己的书 | 建书时发的编辑口令存在访客浏览器里，凭口令改 |
| 编辑口令丢了 | 站长用同步密钥整库覆盖（插件里的「发布到公网」） |
| 章节结构 | 卷/章两层，章节可增删改，支持上/下一章跳转 |
| 数据落地 | `DATA_DIR/kv.json`，原子写入（临时文件 + rename） |

接口一览（自建版和 Cloudflare 版完全一致）：

```
GET  /api/site                     站点配置 + 书架
GET  /api/novel/:id                书详情
POST /api/novel                    新建书（author 必填）
GET  /api/novel/:id/:cid           读一章
POST /api/novel/:id/chapter        加章
PUT  /api/novel/:id/chapter/:cid   改章
POST /api/sync                     整库覆盖（需 x-sync-key）
GET  /healthz                      健康检查
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
