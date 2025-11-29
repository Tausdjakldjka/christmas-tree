# 🎄 Grand Luxury Interactive 3D Christmas Tree

> 一个基于 **React**, **Three.js (R3F)** 和 **AI 手势识别** 的高保真 3D 圣诞树 Web 应用。

这个项目不仅仅是一棵树，它是一个承载记忆的交互式画廊。成千上万粒子、璀璨彩灯与悬浮拍立得共同组成一棵奢华的圣诞树。用户可通过手势控制树的形态（聚合/散开）、视角旋转、照片选择与拖拽，并支持双手缩放选中照片。

![Project Preview](public/preview.png)
*(注：建议在此处上传一张你的项目运行截图)*

## ✨ 核心特性

* 极致视觉体验：加后期光晕 (Bloom) 与辉光，营造梦幻氛围
* 记忆画廊：拍立得风格悬浮照片，双面渲染，底部随机“白色艺术英文字”并带写实阴影
* AI 手势控制：无需鼠标，通过摄像头完成树形态、视角与相片交互
* 双手协作：第一只手捏合拖移，第二只手捏合后用两手食指距离控制选中照片缩放（距离大→放大，距离小→缩小）
* 可定制：支持替换照片、调整数量、切换圣诞元素风格（Classic/Neon/Metallic/Pastel/Candy）

## 🛠️ 技术栈

* **框架**: React 18, Vite
* **3D 引擎**: React Three Fiber (Three.js)
* **工具库**: @react-three/drei, Maath
* **后期处理**: @react-three/postprocessing
* **AI 视觉**: MediaPipe Tasks Vision (Google)

## 🚀 快速开始

### 1. 环境准备
确保你的电脑已安装 [Node.js](https://nodejs.org/) (建议 v18 或更高版本)。

### 2. 安装依赖
在项目根目录下打开终端，运行：
```
npm install
```
### 3. 启动项目
```
npm run dev
```
### 🖼️ 自定义照片
### 1. 准备照片
找到项目目录下的 public/photos/ 文件夹。

顶端封面图：命名为 `top.jpg`（树顶用于强调展示）

树身照片：命名为 `1.jpg, 2.jpg, 3.jpg, ...` 依次类推

建议：使用正方形或 4:3 比例的图片，文件大小不宜过大（建议单张 500kb 以内以保证流畅度）
### 2. 替换照片
直接把你的照片复制到 `public/photos/`，保持文件名格式不变（`1.jpg, 2.jpg, ...`）。
### 3. 修改照片数量 (增加或减少)
如果你放入了更多照片（例如从默认的 24 张增加到 100 张），需要修改代码以通知程序加载它们。
打开文件：`src/App.tsx:20`
将 `TOTAL_NUMBERED_PHOTOS` 修改为你实际放入的图片数量
说明：若有缺图，应用启用“安全纹理加载”，会以白色占位图替代，防止白屏
### 🖐️ 手势与交互
- Open Palm：散开树体与元素
- Closed Fist：聚合树体，并取消当前照片选中
- 水平移动：控制旋转速度
- 垂直移动：控制相机俯仰（带平滑与死区）
- Pointing Up（食指向上）：以食指指尖为光标，在屏幕上显示光标并就近选中照片
- Pinch（食指+拇指捏合）：
  - 第一只手：拖移已选照片（屏幕平面，带平滑）
  - 第二只手：若捏合激活，按两手食指之间的距离缩放选中照片（距离大→放大，距离小→缩小，范围约 1×–3×）
- Victory/Pointing Up：锁定旋转
说明：调参位置在 `src/App.tsx` 的 `GestureController` 与 `Experience`，可调整捏合阈值、平滑强度、拖拽平面法线与近邻选取半径。
### ⚙️ 进阶配置
- 视觉参数：`src/App.tsx` 中的 `CONFIG`
  - `counts.foliage` 树叶粒子数量
  - `counts.ornaments` 照片数量（与 `TOTAL_NUMBERED_PHOTOS` 搭配）
  - `counts.lights` 彩灯数量
  - `tree.height/radius` 树体尺寸
- 圣诞元素风格切换：右下角 `🛠 DEBUG` 按钮旁的风格按钮（Classic/Neon/Metallic/Pastel/Candy）
- 照片标题：拍立得边框底部随机“白色艺术英文字”，带写实阴影
### 📄 License
MIT License. Feel free to use and modify for your own holiday celebrations!

### Merry Christmas! 🎄✨

# Optimized Prompt (English Version)

## Role Definition

You are a senior 3D interactive experience engineer and art director,
highly proficient in **React (v19), TypeScript, Three.js, and React
Three Fiber (R3F)**. You specialize in building high-fidelity, visually
artistic Web 3D experiences.

## Project Goal

Build a premium 3D interactive web project: \### "Arix Signature
Interactive Christmas Tree"

Art direction & visual identity: - Mood: extravagant, luxurious, golden
opulence with a refined sense of elegance\
- Primary palette: **deep emerald green + high-gloss metallic gold**\
- Effects: cinematic bloom, glare, lens flare, and soft halo lighting

# I. Core Interaction & State Design

## 1. State Machine (TreeMorphState)

Design a global interaction state machine with at least two major
states:

-   **SCATTERED**\
    All particles and ornaments float and drift randomly in 3D space,
    creating a sense of controlled chaos.

-   **TREE_SHAPE**\
    All elements converge and form a structured Christmas-tree-shaped
    cone.

Requirements: - Smooth transitions between states (interpolation, easing
curves, timeline control)\
- The motion should evoke an "attractive force" pulling elements into
the tree shape

## 2. Dual Position System

Each element (foliage particle or ornament instance) must be initialized
with two coordinate sets:

-   **scatterPosition**: randomly distributed within a spherical radius\
-   **treePosition**: precomputed position sampled on the tree cone's
    surface or volume

Requirements: - Transitions should interpolate between scatterPosition ↔
treePosition\
- Motion should feel organic, smooth, and rhythmic

# II. Tree Structure & Ornament System

## 1. Foliage Layer

Use **THREE.Points with custom ShaderMaterial** to render dense foliage
particles that define the tree's silhouette.

Particles should support: - Subtle jitter / breathing motion\
- Bloom-enhanced or Fresnel-based rim highlights\
- Deep green base color with a hint of gold or warm white glow on the
edges

## 2. Ornament System

Use **InstancedMesh** for performance. Ornament categories:

-   **Heavy ornaments**: gift boxes (larger, more saturated colors)\
-   **Light ornaments**: metallic reflective spheres\
-   **Ultra-light ornaments**: light dots, stars, or glow particles

Each category should have different "motion weights": - Different
floating amplitudes in SCATTERED state\
- Different convergence speeds in TREE_SHAPE state
