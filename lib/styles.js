/**
 * 风格库：可切换的判断标准（L1 的可选版本）。
 *
 * 存放：$DSH_HOME/agent-manager/styles/<style>.md
 * 格式：frontmatter（name/description）+ 正文（该风格的数字规则清单）。
 *
 * 与知识卡的区别：知识卡是 L2（按需加载），风格是 L1（常驻提示词）。
 * 一个智能体同时只绑定一种默认风格，避免规则冲突；任务里可临时覆盖。
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.js'

const STYLE_NAME = /^[a-z][a-z0-9-]{0,49}$/
const MAX_STYLE_BYTES = 64 * 1024

export function stylesRoot() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'agent-manager', 'styles')
}

function bad(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

export async function listStyles() {
  const dir = stylesRoot()
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const styles = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const style = entry.name.slice(0, -3)
    try {
      const text = await readFile(join(dir, entry.name), 'utf8')
      const { data } = parseFrontmatter(text)
      styles.push({
        style,
        name: typeof data.name === 'string' && data.name !== '' ? data.name : style,
        description: typeof data.description === 'string' ? data.description : '',
      })
    } catch {
      /* 单份解析失败不影响其它 */
    }
  }
  styles.sort((a, b) => a.style.localeCompare(b.style))
  return styles
}

/** 读取风格正文（判断标准），用于常驻提示词。 */
export async function readStyle(style) {
  if (!STYLE_NAME.test(style)) throw bad('风格名非法', 'BAD_STYLE')
  const path = join(stylesRoot(), `${style}.md`)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw bad('风格不存在', 'STYLE_NOT_FOUND')
  }
  const { data, body } = parseFrontmatter(text)
  return {
    style,
    name: typeof data.name === 'string' && data.name !== '' ? data.name : style,
    description: typeof data.description === 'string' ? data.description : '',
    body: body.trim(),
    path,
  }
}

export async function saveStyle({ style, name, description, body }) {
  if (typeof style !== 'string' || !STYLE_NAME.test(style)) {
    throw bad('风格名只能小写字母开头，含字母/数字/连字符', 'BAD_STYLE')
  }
  if (typeof body !== 'string' || body.trim() === '') throw bad('风格的判断标准不能为空', 'BAD_STYLE')
  if (Buffer.byteLength(body, 'utf8') > MAX_STYLE_BYTES) throw bad('风格内容过大', 'BAD_STYLE')
  const dir = stylesRoot()
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${style}.md`)
  const text = stringifyFrontmatter(
    {
      name: typeof name === 'string' && name.trim() !== '' ? name.trim().slice(0, 100) : style,
      description: typeof description === 'string' ? description.trim().replaceAll(/[\r\n]+/g, ' ').slice(0, 500) : '',
    },
    body,
  )
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, text, 'utf8')
  await rename(temporary, path)
  return { style, path }
}

export async function deleteStyle(style) {
  if (!STYLE_NAME.test(style)) throw bad('风格名非法', 'BAD_STYLE')
  const path = join(stylesRoot(), `${style}.md`)
  try {
    await stat(path)
  } catch {
    return { removed: false, path }
  }
  await rm(path, { force: true })
  return { removed: true, path }
}

/** 内置风格模板：三种差异最大的风格家族。 */
export const BUILTIN_STYLES = [
  {
    style: 'swiss-minimal',
    name: '瑞士极简',
    description: '当需要国际主义、极简、信息层级清晰的设计时使用',
    body: `# 判断标准（瑞士极简）

## 硬性数字
- 栅格严格 12 列，间距只用 8 的倍数
- 字号层级 ≤ 4 级；标题/正文 ≥ 2.5:1
- 全文最多 2 个字体家族；字重最多 3 档
- 主色 1 个 + 中性灰阶；禁止点缀色
- 内容最大宽度 ≤ 1140px

## 结构规则
- 所有元素严格对齐栅格
- 留白 ≥ 40%
- 禁止装饰：无阴影、无渐变、无圆角或统一 4px
- 图标一律线性，1.5px 描边

## 负面清单（出现即返工）
- 任何高饱和点缀
- 居中对齐大段文字
- 图片圆角
- 多色标题`,
  },
  {
    style: 'editorial',
    name: '编辑杂志风',
    description: '当需要杂志排版、故事感、大标题与疏密对比时使用',
    body: `# 判断标准（编辑杂志风）

## 硬性数字
- 字号层级 5–7 级；超大标题 ≥ 64px
- 行高：标题 1.1，正文 1.6–1.8
- 栏宽：正文 45–75 字符
- 图片出血与文本栏并存

## 结构规则
- 大标题 + 引文 + 正文的多层节奏
- 允许破格：图片跨栏、文字压图（需遮罩）
- 首字下沉可选；分隔线细而多
- 衬线标题 + 无衬线正文（或反向）

## 负面清单（出现即返工）
- 标题无层级（都一样大）
- 图片全部等小
- 无引文/无节奏变化
- 边框滥用`,
  },
  {
    style: 'vibrant-tech',
    name: '活力科技',
    description: '当需要年轻、动感、有品牌色的产品页面时使用',
    body: `# 判断标准（活力科技）

## 硬性数字
- 主色 1 个高饱和 + 辅助色 1 个 + 深色底或白底二选一
- 圆角统一：卡片 12px、按钮 8px、头像 50%
- 间距阶梯 4/8/12/16/24/32
- 动效时长 150–300ms，缓动 ease-out

## 结构规则
- 焦点元素用大色块或阴影突出
- 卡片层级：背景层 / 卡片层 / 浮层
- 渐变只用于主品牌色，不做彩虹渐变
- 图标填充风格统一

## 负面清单（出现即返工）
- 多种高饱和色并存
- 不一致的圆角
- 静态平铺无视觉焦点
- 过度阴影`,
  },
]

/** 把内置风格写入磁盘（只在目录为空或缺失时）。 */
export async function installBuiltinStyles() {
  const existing = await listStyles()
  const installed = []
  const existingNames = new Set(existing.map((item) => item.style))
  for (const item of BUILTIN_STYLES) {
    if (existingNames.has(item.style)) continue
    await saveStyle(item)
    installed.push(item.style)
  }
  return { installed, total: BUILTIN_STYLES.length }
}
