# ImageCompress — 在线图片压缩工具

[![Website](https://img.shields.io/badge/官网-www.zaixianyasuo.cn-blue)](https://www.zaixianyasuo.cn)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web-brightgreen)](https://www.zaixianyasuo.cn)

**免费**、**安全**、**高效**的在线图片与视频压缩工具。支持批量处理，本地浏览器运算，无需上传服务器，保护你的隐私。

## 功能特性

| 功能 | 说明 |
|------|------|
| 图片批量压缩 | 支持 PNG、JPG、WebP 格式，可调节质量参数 (1%-100%)，拖拽上传 |
| 视频压缩 | 支持 MP4、MOV、WebM、AVI 等格式，H.264/H.265/VP9 编码可选 |
| 证件照换底色 | AI 智能抠图，一键替换蓝底/红底/白底，支持一寸二寸规格 |
| AI 去水印 | 框选水印区域，智能消除修复，效果自然无痕 |
| 本地处理 | 默认浏览器本地压缩，文件不离开设备，保护隐私 |
| 服务器模式 | 登录后可切换云端处理，支持大文件视频压缩和任务持久化 |

### 为什么选择 ImageCompress？

- **完全免费**：核心压缩功能永久免费，无需注册即可使用
- **隐私优先**：默认本地处理，文件不会上传到任何服务器
- **简单易用**：拖拽上传，一键压缩，无需安装任何软件
- **高质量输出**：智能压缩算法，在文件大小与视觉质量之间取得最佳平衡
- **多场景覆盖**：适合电商运营、摄影后期、网页优化、社交媒体分享等场景

## 技术架构

```
用户浏览器 → Cloudflare CDN (国际) / 直连 (国内 cn 子域名)
                ↓
          Nginx (静态文件 + 反向代理)
                ↓
       FastAPI (Python 后端, uvicorn)
                ↓
       MySQL (用户数据 + 压缩记录)
```

### 技术栈

**前端：**
- 原生 HTML5 + CSS3 + JavaScript (无框架依赖)
- 拖拽上传、XHR 进度条、Canvas 预览
- 暗色模式支持、响应式布局

**后端：**
- Python FastAPI (RESTful API)
- SQLAlchemy ORM + MySQL
- JWT 认证 + 2FA 双因素验证
- ffmpeg (视频压缩)、Pillow (图片处理)

**部署：**
- 阿里云 ECS (Ubuntu 24.04)
- Nginx (静态文件 + 反向代理 + 安全规则)
- Cloudflare CDN (国际加速 + DDoS 防护)
- Let's Encrypt SSL 证书
- fail2ban 入侵防御

## 快速开始

### 前置要求

- Python 3.9+
- pip
- (可选) ffmpeg — 用于视频压缩功能，[下载 ffmpeg](https://ffmpeg.org/download.html)
- (可选) MySQL — 生产环境推荐，默认使用 SQLite 无需额外配置

### 本地开发

```bash
# 克隆仓库
git clone https://github.com/wadwaw7/image-compress-online.git
cd image-compress-online

# 创建虚拟环境
cd backend
python -m venv .venv

# 激活虚拟环境
# Linux/macOS:
source .venv/bin/activate
# Windows:
.venv\Scripts\activate

# 安装依赖
pip install -r requirements.txt

# 配置环境变量（可选，默认使用 SQLite 无需配置）
cp .env.example .env

# 启动开发服务器
uvicorn app.main:app --reload --port 8001
```

访问 http://localhost:8001 即可使用完整功能。

> **说明**：默认使用 SQLite 数据库（文件存储在 `backend/storage/db.sqlite3`），无需安装 MySQL。首次启动会自动创建表和默认管理员。视频压缩需要系统安装 ffmpeg。

### 生产部署

生产环境建议使用 MySQL + Nginx 反向代理：

```bash
# 安装生产依赖
pip install gunicorn pymysql

# 启动 (Linux)
gunicorn app.main:app -w 2 -k uvicorn.workers.UvicornWorker -b 127.0.0.1:8001
```

Nginx 配置参考：

```nginx
server {
    listen 80;
    server_name example.com;

    root /path/to/public;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
```

## 项目结构

```
image-compress-online/
├── public/                  # 前端静态文件 (15 个页面)
│   ├── index.html           # 首页 — 图片/视频压缩主界面
│   ├── bg-change.html       # 证件照换底色
│   ├── watermark-remover.html  # AI 去水印
│   ├── app.js               # 核心前端逻辑
│   ├── shared.css           # 全局样式 + 暗色模式
│   └── ...
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── api/             # API 路由
│   │   ├── core/            # 压缩引擎 (图片 + 视频)
│   │   ├── models/          # SQLAlchemy 数据模型
│   │   ├── schemas/         # Pydantic 请求/响应模型
│   │   └── utils/           # 工具函数
│   └── tests/               # 测试用例
└── scripts/                 # 运维脚本
```

## 开源协议

本项目基于 MIT 协议开源。欢迎 Star、Fork 和 PR。

## 链接

- 官网：[www.zaixianyasuo.cn](https://www.zaixianyasuo.cn)
- 国内直连：[cn.zaixianyasuo.cn](https://cn.zaixianyasuo.cn)
- 更新日志：[changelog](https://www.zaixianyasuo.cn/changelog.html)

---

<p align="center">
  <sub>Made with ❤️ by ImageCompress Team | 赣ICP备2025079690号-1</sub>
</p>
