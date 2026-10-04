# 三国杀 · 十周年单机研习

本地适配版本已提供单机 AI 身份局、武将技能搜索与版本筛选。启动请双击 `启动游戏.cmd`，详细说明见 [README-SGS.md](README-SGS.md)。全量官方武将与技能一致性仍在逐项核验，详见 [验证记录](docs/sgs-validation.md)。

以下保留无名杀上游介绍与署名。

<h1 align="center">无名杀</h1>

<p align="center">
  <a href="https://github.com/libnoname/noname/actions/workflows/build.yml"><img alt="构建状态" src="https://img.shields.io/github/actions/workflow/status/libnoname/noname/build.yml?branch=main&style=flat-square"></a>
  <a href="https://github.com/libnoname/noname/releases/latest"><img alt="最新版本" src="https://img.shields.io/github/v/release/libnoname/noname?display_name=tag&style=flat-square"></a>
  <a href="https://github.com/libnoname/noname/releases"><img alt="累计下载" src="https://img.shields.io/github/downloads/libnoname/noname/total?style=flat-square"></a>
  <a href="https://github.com/libnoname/noname/graphs/contributors"><img alt="项目贡献者" src="https://img.shields.io/github/contributors/libnoname/noname?style=flat-square"></a>
  <a href="./LICENSE"><img alt="许可证" src="https://img.shields.io/github/license/libnoname/noname?style=flat-square"></a>
</p>

## 项目使用约定

本项目基于 GPL 3.0 协议开源，使用此项目时请遵守开源协议。  
除此外，希望你在使用代码时已经了解以下额外说明：

1. 打包、二次分发 **请保留代码出处**：<https://github.com/libnoname/noname>
2. 请不要用于商业用途。

## 快速启动

### 环境要求

> **提示：** 请参考 [本地文档](./docs/how-to-start.md) 或 [github文档](https://github.com/libnoname/noname/wiki/%E5%A6%82%E4%BD%95%E8%BF%90%E8%A1%8C%E6%97%A0%E5%90%8D%E6%9D%80%EF%BC%88%E7%A8%8B%E5%BA%8F%E5%91%98%E7%89%88%EF%BC%89) 配置环境。

- [Node.js](https://nodejs.org/) ^20.19.0 || >=22.12.0
- [pnpm](https://pnpm.io/) >= 9
- Webview: Chromium >= 91 || Safari >=16.4.0 (暂不支持Firefox)

### 安装依赖

```bash
pnpm install
```

### 启动

```bash
pnpm dev
```
