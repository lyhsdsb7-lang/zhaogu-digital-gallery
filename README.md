# 照古 数字藏品画卷

第二件模型的独立展厅，使用宣纸底色、朱砂印章、墨青铜色渐变、毛笔字与鎏金铸形动画。

网站地址：https://lyhsdsb7-lang.github.io/zhaogu-digital-gallery/

## 运行

```powershell
npm install
npm run dev
```

访问 http://127.0.0.1:5174/ 。当前工作区已安装的依赖可以直接使用。

## 展示素材

- 原始素材是上层文件夹中的 `7f6291c260c28bdd8b3b126223f193c5.glb`，原文件保留不变。
- 网站加载 `public/models/artifact.glb`，约 0.85 MB。
- 展示模型经过网格简化、Meshopt 压缩和 1024 像素 WebP 贴图优化，用于快速预览。
- 模型呈含钱金蟾造型，名称、年代、出处和材质信息尚未得到确认，页面未补造相关资料。
- 字体基于 Ma Shan Zheng，采用 SIL Open Font License，授权文件见 `public/fonts`。

## 交互

拖动旋转、滚轮或双指缩放，切换鎏金铸形与模型原貌。重演按钮播放金尘四散、光丝汇流与表面铸形。右下角提供自动旋转、散开聚合和重置视角。支持系统减少动态效果设置。

## 鎏金铸形

视觉机制参考 [Codrops 的粒子溶解教程](https://tympanus.net/codrops/2025/02/17/implementing-a-dissolve-effect-with-shaders-and-particles-in-three-js/)，为当前模型独立实现反向溶解效果。

- 表面与粒子共用空间噪声场，模型从不规则发光边缘逐步显现，最终恢复原有纹理。
- 六组入口沿弯曲路径汇入模型，使用短尾光丝、光针、尘点、金箔、弧屑与星芒六种粒子形状。
- 900 条桌面光丝轨迹与 450 条移动端轨迹伴随粒子落点，不再使用旧版旋转云和双螺旋。
- 使用单次场景渲染与共享动画参数，完整成形后关闭粒子绘制，继续展示真实模型。

## 构建

```powershell
npm run build
npm run preview
```

支持通过 `PAGES_BASE_PATH` 配置部署子路径。GitHub Actions 构建后发布到 GitHub Pages。
