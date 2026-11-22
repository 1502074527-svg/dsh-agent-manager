---
name: production-kit
description: 流水线消费契约与素材动词。写镜头剧本与设计图前必读：索引字段语义、帧号约定、制作端参数、素材 spec 写法与下游自检。
---

# 流水线 · 消费契约与素材动词

## 一、消费的输入（字段语义）

**段落索引 json**：
- 身份：`schema_version + source_sha256 + audio_sha256`，哈希不符即拒绝
- `blocks[]`：block / paragraphs / sample_start / sample_end_exclusive / frame_start_60fps / frame_end_60fps_exclusive
- `paragraphs[]`：id / block / start_sample / end_sample_exclusive / start_seconds / end_seconds / start_frame_60fps / end_frame_60fps_exclusive / head
- 约定：帧号 **`[F0, Fend)` 半开**；48000Hz，800 采样 = 1 帧；段终帧号属于下一段
- 段间缝 = 下段 start − 上段 end（多数为正的静音，个别 0 或 −1，引用前先算，见切点纪律）

**字级时间戳 json**：词点触发用。写法「『X』字起（F106，词点 85200/48000）」。

## 二、制作端参数（不可协商）

- 1920×1080 横屏，60/1 fps，Remotion 工程，z 三分层（远/主/前景）
- **切点只落块界或段间缝**，不切进朗读中的句子
- 下游四项自检：**几何 / 密度 / 频闪 / 确定性**——本专家的一切 spec 必须可被它们检验：
  - 几何 → 坐标、尺寸、z 值写具体数
  - 密度 → 单位时间画面变化次数，按频道设计文档口径给目标值
  - 频闪 → 禁止设计 ≥3 次/秒的亮度闪烁（安全红线）
  - 确定性 → 一切生成 spec 必须带 seed，重渲染可复现

## 三、素材动词（设计图阶段的 spec 语言）

| 动词 | spec 写法 |
|---|---|
| `mg` | 组件名 + 参数（颜色 hex / 时长帧 / 曲线），坐标尺寸具体 |
| `gen-video` | **可直接使用的生成 prompt + seed**；画风词只准用频道设计文档里的词 |
| `still` | 生成 prompt 或搜索词 + 运动方式（KenBurns/视差，方向与速度） |
| `screen` | 录屏内容说明 |
| `type` | 文字内容 + 版式（字号/字重/位置来自设计文档字体层级） |
| `img-seq` | 帧序列生成 prompt + seed + 帧数 |

**纪律**：gen-video 不连续两句、单镜 ≤8s、在扁平体系只作 B-roll；静态图优先 AI 生成（版权干净 + 画风可锁进体系），网络图只作证据类。

## 四、比例

生视频占全片素材 **0–40%**，按内容定：概念密集 → 低；氛围叙事 → 高。
