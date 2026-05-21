# ImageCompress — 在线图片压缩工具

[![Website](https://img.shields.io/badge/官网-www.zaixianyasuo.cn-blue)](https://www.zaixianyasuo.cn)
[![License](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Platform](https://img.shields.io/badge/platform-Web-brightgreen)](https://www.zaixianyasuo.cn)

**免费**、**安全**、**高效**的在线图片压缩工具。纯浏览器端 Canvas API 运算，无需上传服务器，保护你的隐私。

## 功能特性

| 功能 | 说明 |
|------|------|
| 图片批量压缩 | 支持 PNG、JPG、WebP 格式，可调节质量参数 (1%-100%)，拖拽上传 |
| 证件照换底色 | AI 智能抠图，一键替换蓝底/红底/白底，支持一寸二寸规格 |
| AI 去水印 | 框选水印区域，智能消除修复，效果自然无痕 |
| 本地处理 | 所有图片处理均在浏览器本地完成，文件不离开设备 |
| 零依赖 | 纯 HTML/CSS/JS，无需安装任何软件或运行时 |

### 为什么选择 ImageCompress？

- **完全免费**：所有功能永久免费，无需注册
- **隐私优先**：纯本地处理，文件不会上传到任何服务器
- **简单易用**：拖拽上传，一键压缩，无需安装
- **高质量输出**：智能压缩算法，在文件大小与视觉质量之间取得最佳平衡
- **多场景覆盖**：适合电商运营、摄影后期、网页优化、社交媒体分享等场景

## 快速开始

无需安装，直接打开 `public/index.html` 即可使用：

```bash
git clone https://github.com/wadwaw7/image-compress-online.git
cd image-compress-online/public
# 用浏览器打开 index.html，或使用任意静态文件服务器
python -m http.server 8080   # Python 3
# npx serve .                 # Node.js
```

> 纯静态文件，不需要数据库、不需要后端、不需要 Docker。打开即用。

## 技术实现

**核心压缩引擎** (`public/app.js`)：

- **Canvas API**：`drawImage` 缩放 + `toBlob` 编码输出，支持自定义质量、最大宽高、Alpha 通道处理
- **Web Crypto API**：`SHA-256` 文件哈希用于去重
- **并发池控制**：可配置并发数，批量处理时自动调度
- **格式转换**：PNG ↔ JPG ↔ WebP 互转

所有代码不超过 300 行，清晰可读，适合学习浏览器图像处理。

## 项目结构

```
image-compress-online/
├── public/                  # 前端静态文件
│   ├── index.html           # 首页 — 图片压缩主界面
│   ├── bg-change.html       # 证件照换底色
│   ├── watermark-remover.html  # AI 去水印
│   ├── app.js               # 核心本地压缩引擎
│   ├── shared.css           # 全局样式 + 暗色模式
│   └── ...
└── README.md
```

## 开源协议

本项目基于 MIT 协议开源。欢迎 Star、Fork 和 PR。

## 链接

- 官网：[www.zaixianyasuo.cn](https://www.zaixianyasuo.cn)
- 国内直连：[cn.zaixianyasuo.cn](https://cn.zaixianyasuo.cn)

---

<p align="center">
  <sub>Made with ❤️ by ImageCompress Team | 赣ICP备2025079690号-1</sub>
</p>
