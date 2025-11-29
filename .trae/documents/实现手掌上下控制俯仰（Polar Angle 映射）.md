## 目标
- 基于 MediaPipe 手部关键点 `y` 坐标，实时控制 `OrbitControls` 的俯仰（Polar Angle），实现“手掌上下移动→视角抬高/降低”。

## 技术要点
- 使用 `three-stdlib` 的 `OrbitControls.setPolarAngle()`（项目已使用 `setAzimuthalAngle()`，同源 API 可用）
- 将 `y∈[0,1]` 映射到极角 `phi∈[minPhi,maxPhi]`，并做平滑与死区抑制：
  - `phi = minPhi + y * (maxPhi - minPhi)`（y 越小→越“上”，phi 越小）
  - 推荐 `minPhi = 0.4`、`maxPhi = Math.PI/1.7`（与现有 `maxPolarAngle` 保持一致）
  - 使用 `MathUtils.damp()` 做平滑，加入 `deadzone` 防抖（如 `|Δy| < 0.02` 忽略）

## 代码改动
1. `src/App.tsx` 增加俯仰输入状态
   - 在 `GrandTreeApp` 中新增：`const [pitchY, setPitchY] = useState<number>(0.5)` 并传入 `Experience`
   - 将 `<GestureController ... onPitch={setPitchY} />` 作为新回调传入
2. `GestureController` 提取手部 `y` 坐标并上报
   - 在 `predictWebcam` 中，当 `results.landmarks.length > 0` 时：
     - 读取 `const y = results.landmarks[0][0].y`
     - 若 `Math.abs(y - prevY) > 0.02` 则 `onPitch(clamp(y,0,1))`（保留原有 `onMove` 横向旋转逻辑不变）
3. `Experience` 应用俯仰角与平滑
   - 通过 `controlsRef.current.getPolarAngle()` 读取当前角度
   - 计算目标角 `targetPhi = minPhi + pitchY * (maxPhi - minPhi)` 并使用 `MathUtils.damp(currentPhi, targetPhi, 3, delta)` 得到 `smoothPhi`
   - 每帧调用 `controlsRef.current.setPolarAngle(smoothPhi)` 与 `controlsRef.current.update()`（与现有水平旋转并行）
   - 维持 `OrbitControls` 的 `maxPolarAngle={Math.PI/1.7}`，可选增加 `minPolarAngle={0.4}` 以防过高俯仰

## 验证
- 开启 `DEBUG` 按钮观察手部关键点，上下移动应当导致视角俯仰平滑改变
- 验证在“聚合态”`FORMED` 时 `autoRotate` 与俯仰一起工作不冲突
- 验证无手时保持上次俯仰或缓慢回到中值（可选）

## 文档更新
- 更新 `README.md` 的“手势控制说明”：将上下移动俯仰改为“已实现”，说明死区与平滑策略及俯仰范围

## 可调参数
- `minPhi/maxPhi`、平滑强度（damp 第3参数）、`deadzone` 阈值、俯仰灵敏度（如对 `y` 做非线性映射）