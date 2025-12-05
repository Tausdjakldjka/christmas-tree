# 🚀 部署指南 - Christmas Tree 项目

## Cloudflare Pages 部署

### 方法一：使用 Wrangler CLI（推荐）

#### 1. 安装 Wrangler
```bash
npm install -g wrangler
# 或者使用 npx（无需全局安装）
```

#### 2. 登录 Cloudflare
```bash
wrangler login
```
这会打开浏览器，让你登录 Cloudflare 账号。

#### 3. 构建项目
```bash
npm run build
```

#### 4. 部署到 Cloudflare Pages
```bash
# 方式 1: 使用配置文件（推荐）
npx wrangler pages deploy dist --project-name=christmas-tree

# 方式 2: 使用 npm 脚本
npm run deploy
```

#### 5. 首次部署配置
首次部署时，Wrangler 会询问：
- **Project name**: `christmas-tree`（或你喜欢的名字）
- **Production branch**: `main`

---

### 方法二：通过 Cloudflare Dashboard（Web UI）

#### 1. 准备部署包
```bash
npm run build
```
这会在 `dist/` 目录生成生产版本。

#### 2. 登录 Cloudflare Dashboard
访问：https://dash.cloudflare.com/

#### 3. 创建 Pages 项目
1. 进入 **Workers & Pages**
2. 点击 **Create application**
3. 选择 **Pages** 标签
4. 点击 **Upload assets**

#### 4. 上传构建文件
1. 输入项目名称：`christmas-tree`
2. 将 `dist/` 目录中的所有文件拖拽上传
3. 点击 **Deploy site**

---

### 方法三：通过 GitHub 自动部署（CI/CD）

#### 1. 连接 GitHub 仓库
1. 在 Cloudflare Dashboard 中选择 **Connect to Git**
2. 授权并选择你的 GitHub 仓库
3. 配置构建设置：

```yaml
# 构建配置
Framework preset: Vite
Build command: npm run build
Build output directory: dist
Root directory: /
```

#### 2. 环境变量（可选）
如果需要，可以在 Settings → Environment variables 添加：
```
NODE_VERSION=22
```

#### 3. 自动部署
- 每次 push 到 `main` 分支会自动触发部署
- Pull Request 会生成预览 URL

---

## 部署配置文件说明

### `wrangler.toml`
```toml
name = "christmas-tree"
compatibility_date = "2025-12-05"

[assets]
directory = "./dist"
```
- **name**: Cloudflare Pages 项目名称
- **assets.directory**: 静态资源目录（构建输出目录）

### `public/_headers`
配置 HTTP 响应头：
- ✅ **缓存策略**: 静态资源长期缓存，HTML 不缓存
- ✅ **安全头**: X-Frame-Options, CSP 等
- ✅ **CORS**: 跨域资源共享（如需要）
- ✅ **Content-Type**: 正确的 MIME 类型

### `public/_redirects`
SPA 路由重定向：
```
/*    /index.html   200
```
确保所有路由都返回 `index.html`，由前端路由处理。

---

## 验证部署

部署成功后，你会获得一个 URL：
```
https://christmas-tree-xxx.pages.dev
```

### 检查清单
- ✅ 页面能正常加载
- ✅ 圣诞树渲染正常
- ✅ 照片加载完整
- ✅ 手势识别工作（桌面端）
- ✅ 触摸控制工作（移动端）
- ✅ 双击切换状态正常
- ✅ 按钮交互正常

---

## 自定义域名（可选）

### 1. 在 Cloudflare Pages 中添加自定义域名
1. 进入项目设置 → **Custom domains**
2. 点击 **Set up a custom domain**
3. 输入你的域名（如：`tree.example.com`）

### 2. 配置 DNS
Cloudflare 会自动为你配置 DNS 记录：
- **Type**: CNAME
- **Name**: tree（或 @）
- **Target**: christmas-tree-xxx.pages.dev

### 3. 启用 HTTPS
Cloudflare 自动为你的域名提供免费的 SSL 证书。

---

## 性能优化建议

### 1. 启用 Cloudflare CDN
- ✅ 自动启用全球 CDN
- ✅ 边缘缓存静态资源
- ✅ Brotli/Gzip 自动压缩

### 2. 图片优化
```bash
# 可选：压缩照片以减小体积
npm install -g sharp-cli

# 批量压缩（保持质量 80%）
sharp -i public/photos/*.jpg -o public/photos/ -q 80
```

### 3. 代码分割
当前 bundle 较大（1.38MB），可以考虑：
- 动态导入 MediaPipe（仅桌面端加载）
- 懒加载照片纹理
- 使用 `vite-plugin-compression` 预压缩

---

## 常见问题

### Q1: 部署后看到 404 错误？
**A**: 检查 `wrangler.toml` 中 `assets.directory` 是否指向正确的构建目录（`./dist`）。

### Q2: 照片无法加载？
**A**: 确保 `public/photos/` 目录中的照片在构建后被复制到了 `dist/photos/`。

### Q3: 手势识别不工作？
**A**: 
- 桌面端：确保允许摄像头权限
- 移动端：手势识别已禁用，使用触摸控制

### Q4: 部署后性能很差？
**A**: 
1. 检查是否使用了移动端优化（自动检测）
2. 考虑压缩照片文件
3. 启用 Cloudflare 的 **Mirage** 和 **Polish** 功能

### Q5: 如何查看部署日志？
**A**: 
```bash
# 查看最近的部署
wrangler pages deployments list --project-name=christmas-tree

# 查看特定部署的日志
wrangler pages deployments tail --project-name=christmas-tree
```

---

## 回滚部署

### 通过 CLI
```bash
# 查看历史部署
wrangler pages deployments list --project-name=christmas-tree

# 回滚到指定版本
wrangler pages deployments rollback <deployment-id> --project-name=christmas-tree
```

### 通过 Dashboard
1. 进入项目 → **Deployments**
2. 找到要回滚的版本
3. 点击 **Rollback to this deployment**

---

## 监控与分析

### Cloudflare Analytics
- 访问量统计
- 流量来源分析
- 性能指标（TTFB, FCP, LCP）

### 启用 Web Analytics
```html
<!-- 添加到 index.html <head> -->
<script defer src='https://static.cloudflareinsights.com/beacon.min.js' 
        data-cf-beacon='{"token": "YOUR_TOKEN"}'></script>
```

---

## 成本

### Cloudflare Pages 免费额度
- ✅ **无限**静态请求
- ✅ **无限**带宽
- ✅ **500** 次构建/月
- ✅ **1** 个并发构建
- ✅ **100** 个自定义域名

对于此项目，完全可以使用免费计划！🎉

---

## 联系与支持

- 📧 问题反馈：提交 GitHub Issue
- 📖 Cloudflare 文档：https://developers.cloudflare.com/pages/
- 💬 社区支持：Cloudflare Discord

---

**🎄 祝你部署顺利！享受圣诞树吧！** ✨

