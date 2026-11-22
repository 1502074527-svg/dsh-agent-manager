/**
 * 把一条智能体定义编译成 DSH agent preset。
 *
 * id 带内容摘要：同名但内容不同（例如不同项目的同名定义）不会互相顶替。
 * 若该智能体有知识卡，skill 行会挂上它专属的 customSkillDirs。
 */
import { createHash } from 'node:crypto'
import { ALWAYS_ROWS, rowsFor } from './catalog.js'

export const PRESET_PREFIX = 'am-'

export function isManagedPresetId(id) {
  return typeof id === 'string' && id.startsWith(PRESET_PREFIX)
}

/**
 * @param definition 归一化后的智能体定义
 * @param options.knowledgeDir 该智能体的知识目录（存在知识卡时传入）
 */
/** 勾了「产出后自检」时追加：渲染-看图-核对的闭环。 */
const SELF_CHECK_RULES = [
  '# 产出后自检：渲染 → 看图 → 核对判断标准',
  '',
  '产出任何视觉作品（页面、海报、组件）后，不要直接交付，按下面的闭环自查：',
  '1. 把产出写成可渲染的 HTML 文件（用 write 写到临时目录）；',
  '2. 用 bash 跑截图：',
  '   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu --no-sandbox --screenshot=/tmp/check.png --window-size=1440,900 --hide-scrollbars "file:///你的文件.html"',
  '   （Windows 用对应 chrome.exe 路径；不存在则跳过截图，直接做文字核对）；',
  '3. 用 read_image 打开 /tmp/check.png，逐条核对「判断标准」清单：对比度、字号层级、间距倍数、配色数量、焦点唯一、留白比例；',
  '4. 任何一条不过 → 修改 → 重新截图 → 再看。最多迭代 3 轮；',
  '5. 全部通过后，把最终稿和截图一并交付，并说明你核对了哪些项。',
  '',
  '如果用户提供了参考图，用 read_image 先看参考图，读出它的配色、构图、字体气质，再动手做。',
].join('\n')

/** 勾了「先问清再动手」时追加到系统提示词末尾的行为约定。 */
const ASK_FIRST_RULES = [
  '',
  '# 工作方式：先问清，再动手',
  '',
  '收到任务后，如果关键信息不足，**先用 ask_user_question 提问**，不要靠猜。一次最多问 3 个问题，给可选项，别问开放式大问题。',
  '',
  '不同类型任务至少要确认清楚这些（按需挑选，不要机械全问）：',
  '- 视觉/UI：风格倾向（极简/科技/复古/活泼）、主色与配色禁忌、字体气质、参考产品、目标用户与设备（桌面/移动）、信息层级与重点。',
  '- 平面/品牌：行业与调性、使用场景（线上/印刷/包装）、尺寸与材质限制、必须出现的元素（logo/文案/合规信息）。',
  '- 文案/内容：受众、语气、篇幅、必须包含或必须避免的信息。',
  '- 技术方案：现有栈与约束、性能或兼容要求、可接受的改动范围。',
  '',
  '如果用户给了参考图或参考链接，先说明你从里面读到了什么（配色、字体、构图、动效），再往下做。',
  '信息足够时不要为了问而问——直接给结果。',
  '',
  '输出要求：先给结论，再给依据；方案要能直接落地（具体数值、具体做法），不要只给抽象建议。',
].join('\n')

export function buildPreset(definition, options = {}) {
  if (definition.mode === 'llm') throw new Error('mode=llm 不需要预设')

  const parts = [definition.prompt]
  if (typeof definition.criteria === 'string' && definition.criteria.trim() !== '') {
    parts.push(`# 判断标准（每次产出前后都要逐条核对）\n${definition.criteria.trim()}`)
  }
  if (typeof options.styleBody === 'string' && options.styleBody.trim() !== '') {
    parts.push(`# 当前风格：${options.styleName ?? ''}\n本任务默认遵循这套风格的判断标准。\n${options.styleBody.trim()}\n\n如果用户在任务里明确指定了别的风格（比如「这次用赛博朋克」），以用户的指定为准，但判断标准的核对方式不变。`)
  }
  if (definition.selfCheck === true) parts.push(SELF_CHECK_RULES)
  if (definition.askFirst === true) parts.push(ASK_FIRST_RULES.replace(/^\n+/, ''))
  const prompt = parts.join('\n\n')
  const plugins = [
    { id: 'persona', name: '@deepseek-ai/dsh-persona', config: { prefix: prompt } },
    ...structuredClone(ALWAYS_ROWS),
    ...rowsFor(definition.tools ?? []),
  ]

  // 知识库：只挂给这个智能体自己的目录，避免把别人的知识串进来。
  if (typeof options.knowledgeDir === 'string' && options.knowledgeDir !== '') {
    const row = plugins.find((item) => item.id === 'skill-fs')
    if (row !== undefined) {
      row.config = { customSkillDirs: [options.knowledgeDir], includeDefaultRoots: false }
    }
  }

  const seen = new Set()
  const deduped = []
  for (const row of plugins) {
    const key = row.id ?? `${row.name}#${JSON.stringify(row.config ?? null)}`
    if (seen.has(key)) continue
    seen.add(key)
    deduped.push(row)
  }

  const content = JSON.stringify({
    name: definition.title ?? definition.name,
    description: definition.description,
    plugins: deduped,
  })
  const digest = createHash('sha1').update(content).digest('hex').slice(0, 8)

  return {
    id: `${PRESET_PREFIX}${definition.name}-${digest}`,
    name: definition.title ?? definition.name,
    description: definition.description,
    order: 100,
    plugins: deduped,
  }
}

/** 仅用于展示：agent 模式下会注册的预设 id。 */
export function previewPresetId(definition, options) {
  if (definition.mode === 'llm') return undefined
  return buildPreset(definition, options).id
}
