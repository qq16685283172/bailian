# 协作指南

面向参与本项目的开发者。目标：任何人在一台干净的电脑上，半小时内跑起来并提交第一行代码。

## 1. 环境要求

| 工具 | 版本 | 说明 |
| --- | --- | --- |
| Node.js | **22 或更高** | 后端使用 `node:sqlite`，低于 22 直接启动失败 |
| npm | 随 Node 附带 | |
| Git | 较新版本即可 | |

Windows 装 [Node.js LTS](https://nodejs.org/) 和 [Git for Windows](https://git-scm.com/download/win)；macOS 用 `brew install node git`。

## 2. 第一次上手

```bash
git clone https://github.com/qq16685283172/bailian.git
cd bailian
npm ci                    # 按 package-lock.json 精确安装，比 npm install 更快更一致
cp .env.example .env      # Windows PowerShell: Copy-Item .env.example .env
npm run dev
```

打开 <http://localhost:5173> 就是开发页面，`/api` 请求由 Vite 自动代理到 3001 端口的后端服务。

**关于 `.env`**：里面只有 `LIVE_LIST_URL` 是真正的凭证（含 token 与 pd_id），向项目负责人单独索取。没有它也能正常开发和预览页面，只是「听课数据同步」不可用。真实凭证**不要提交、不要发群里**。

## 3. 目录说明

| 目录 / 文件 | 作用 | 是否提交 |
| --- | --- | --- |
| `src/` | 前端页面，React + Vite | ✅ |
| `server/` | 后端，Express + `node:sqlite` | ✅ |
| `server/data/` | 运行时数据：SQLite 数据库、账号、凭证 | ❌ 已在 .gitignore |
| `server/materials/` | 学员上传/下载的资料 PDF | ❌ 已在 .gitignore |
| `dist/` | 前端构建产物，`npm run build` 生成 | ❌ 已在 .gitignore |
| `.env` | 环境变量与凭证 | ❌ 已在 .gitignore |
| `.env.example` | 变量清单与占位值 | ✅ |

注意：**数据库不在仓库里**。新克隆的仓库是空库，本地开发想用真实数据，需要找负责人从服务器导出一份 `server/data/`。

## 4. 分支与提交

`main` 是「随时可发布」的分支，不要直接在上面开发。

```bash
git checkout main
git pull
git checkout -b feat/登录页改版
# 改代码……
git add -A
git commit -m "feat: 登录页支持回车提交"
git push -u origin feat/登录页改版
```

然后在 GitHub 上开 Pull Request，至少一人 review 后合并。

提交信息用前缀分类，便于回看和生成变更日志：

| 前缀 | 用途 |
| --- | --- |
| `feat:` | 新功能 |
| `fix:` | 修 bug |
| `docs:` | 文档 |
| `chore:` | 依赖、配置、杂项 |
| `refactor:` | 不改行为的重构 |

## 5. 发布

一次发布 = **服务器上拉代码 → 构建前端 → 重启服务**。

- 有控制台的人：双击 `启动控制台.bat`，点「构建并重启」；
- 没控制台：SSH 到服务器执行
  ```bash
  cd /opt/bailian-plan
  git pull --ff-only
  npm run build
  systemctl restart bailian-plan
  ```

`npm run build` 会重建 `dist/`，构建的几秒内页面可能短暂异常，尽量避开使用高峰。发布后到首页刷新确认正常。

## 6. 绝对不能提交的东西

`.env`（含真实 token）、`server/data/`（用户数据与数据库）、`server/materials/`（学员资料）、`node_modules/`、`dist/`。

提交前可以跑一句确认：

```bash
git status --porcelain
```

看到上面这些路径出现在待提交列表里，先检查 `.gitignore` 有没有被误删。

## 7. 常见问题

| 现象 | 原因 / 解决 |
| --- | --- |
| `node:sqlite` 相关报错 | Node 版本低于 22，升级 Node |
| 页面能开但接口全 404 | 后端没起来，`npm run dev` 要同时起前端和 `server/index.js`，看终端有没有报错 |
| 5173 端口被占用 | Vite 会自动换端口，看终端打印的实际地址 |
| 3001 端口被占用 | 改 `.env` 里的 `PORT`，同时改 `vite.config.js` 的 proxy 目标 |
| 登录后立刻失效 | 服务重启会清空会话，重新登录即可 |

## 8. 换一台电脑继续工作

代码在 GitHub 上，换电脑不需要拷贝项目：

1. 新电脑装 Node 22 + Git；
2. `git clone` 同一个仓库；
3. 把 `.env` 从旧电脑或负责人那里拿过来（这个文件不在仓库里）；
4. 如果还需要那台服务器控制台，把 `server-console/` 整个目录连同 `~/.ssh/bailian_deploy_ed25519` 私钥拷过去即可，控制台只依赖这两个东西。

本机不需要装任何额外软件也能干活：GitHub 网页版可以直接改小文件、提交 PR。

## 9. 权限

- 写代码：仓库 Settings → Collaborators 邀请，接受邀请后即可推分支；
- 服务器发布：需要 `server-console/` 目录和部署私钥，按人单独发放，离队时吊销（GitHub 仓库 Settings → Deploy keys 里删除即可，不影响其他人）。
