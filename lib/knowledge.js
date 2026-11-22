/**
 * 智能体的专业知识库。
 *
 * 每个智能体一个目录，里面放若干 Markdown 技能卡：
 *   $DSH_HOME/agent-manager/knowledge/<name>/<card>.md
 *
 * 卡片格式（frontmatter + 正文）：
 *   ---
 *   name: color-system
 *   description: 色彩系统怎么建、怎么选主色
 *   ---
 *   正文……
 *
 * 这些目录会作为 dsh-skill-filesystem 的 customSkillDirs 挂给该智能体，
 * 正文按需加载，不占每次请求的提示词预算。
 */
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.js'

const CARD_NAME = /^[a-z0-9][a-z0-9-]{0,63}$/
const MAX_CARD_BYTES = 128 * 1024
const MAX_CARDS = 200

export function knowledgeRoot() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'agent-manager', 'knowledge')
}

export function knowledgeDirFor(agentName) {
  if (typeof agentName !== 'string' || !/^[a-z][a-z0-9-]{0,49}$/.test(agentName)) {
    const error = new Error('智能体名非法')
    error.code = 'BAD_AGENT_NAME'
    throw error
  }
  return join(knowledgeRoot(), agentName)
}

function bad(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

/** 列出某个智能体的全部知识卡（只解析 frontmatter，不读正文）。 */
export async function listCards(agentName) {
  const dir = knowledgeDirFor(agentName)
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const cards = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    if (cards.length >= MAX_CARDS) break
    const path = join(dir, entry.name)
    try {
      const info = await stat(path)
      if (info.size > MAX_CARD_BYTES) continue
      const text = await readFile(path, 'utf8')
      const { data } = parseFrontmatter(text)
      cards.push({
        card: basename(entry.name, '.md'),
        name: typeof data.name === 'string' && data.name !== '' ? data.name : basename(entry.name, '.md'),
        description: typeof data.description === 'string' ? data.description : '',
        bytes: info.size,
      })
    } catch {
      /* 单张解析失败不影响其它卡 */
    }
  }
  cards.sort((a, b) => a.card.localeCompare(b.card))
  return cards
}

export async function readCard(agentName, card) {
  if (!CARD_NAME.test(card)) throw bad('知识卡名非法', 'BAD_CARD')
  const path = join(knowledgeDirFor(agentName), `${card}.md`)
  let text
  try {
    text = await readFile(path, 'utf8')
  } catch {
    throw bad('知识卡不存在', 'CARD_NOT_FOUND')
  }
  const { data, body } = parseFrontmatter(text)
  return {
    card,
    name: typeof data.name === 'string' && data.name !== '' ? data.name : card,
    description: typeof data.description === 'string' ? data.description : '',
    body,
    path,
  }
}

export async function saveCard(agentName, { card, name, description, body }) {
  if (typeof card !== 'string' || !CARD_NAME.test(card)) {
    throw bad('知识卡名只能用小写字母、数字和连字符，最多 64 位', 'BAD_CARD')
  }
  if (typeof body !== 'string' || body.trim() === '') throw bad('知识卡正文不能为空', 'BAD_CARD')
  if (Buffer.byteLength(body, 'utf8') > MAX_CARD_BYTES) throw bad('知识卡过大', 'BAD_CARD')
  const dir = knowledgeDirFor(agentName)
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${card}.md`)
  const text = stringifyFrontmatter(
    {
      name: typeof name === 'string' && name.trim() !== '' ? name.trim().slice(0, 100) : card,
      description: typeof description === 'string' ? description.trim().replaceAll(/[\r\n]+/g, ' ').slice(0, 500) : '',
    },
    body,
  )
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, text, 'utf8')
  await rename(temporary, path)
  return { card, path }
}

export async function deleteCard(agentName, card) {
  if (!CARD_NAME.test(card)) throw bad('知识卡名非法', 'BAD_CARD')
  const path = join(knowledgeDirFor(agentName), `${card}.md`)
  try {
    await stat(path)
  } catch {
    return { removed: false, path }
  }
  await rm(path, { force: true })
  return { removed: true, path }
}

/** 删除整个智能体的知识目录（智能体被删除时调用）。 */
export async function deleteAllCards(agentName) {
  const dir = knowledgeDirFor(agentName)
  await rm(dir, { recursive: true, force: true })
  return dir
}

/** 服务端统计：每个智能体多少张卡。 */
export async function knowledgeCounts() {
  const root = knowledgeRoot()
  let entries
  try {
    entries = await readdir(root, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return {}
    throw error
  }
  const result = {}
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    try {
      const dir = join(root, entry.name)
      const files = await readdir(dir)
      result[entry.name] = files.filter((file) => file.endsWith('.md')).length
    } catch {
      /* 忽略 */
    }
  }
  return result
}
