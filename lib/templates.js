/**
 * 领域模板包（Domain Pack）。
 *
 * 作用：新建智能体时先选一个包，包预填提示词、判断标准、工具集与模块声明，
 * 用户只微调差异。包只负责「起点」，保存后的智能体是独立定义文件，不依赖包存在。
 *
 * 存放（后者覆盖同 id 的前者）：
 *   内置：<插件目录>/templates/<id>.json
 *   用户：$DSH_HOME/agent-manager/templates/<id>.json
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url))
const MAX_TEMPLATE_BYTES = 64 * 1024
const KNOWN_MODULES = ['style', 'knowledge']
const KNOWN_TOOLS = ['fs', 'search', 'bash', 'pwsh', 'jobs', 'web', 'skill', 'todo', 'ask', 'present', 'schedule', 'goal', 'plan']
const ID_PATTERN = /^[a-z][a-z0-9-]{0,49}$/

export function builtinTemplateDir() {
  return join(PLUGIN_DIR, 'templates')
}

export function userTemplateDir() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'agent-manager', 'templates')
}

function text(value) {
  return typeof value === 'string' ? value : ''
}

/** 规整一个包：缺字段补默认值，未知模块/工具直接丢弃而不是报错（避免一个坏包拖垮整个列表）。 */
function normalizeTemplate(raw, fallbackId) {
  if (raw === null || typeof raw !== 'object') return undefined
  const id = ID_PATTERN.test(text(raw.id)) ? text(raw.id) : fallbackId
  if (!ID_PATTERN.test(id)) return undefined
  const defaults = raw.defaults !== null && typeof raw.defaults === 'object' ? raw.defaults : {}
  const modules = Array.isArray(raw.modules) ? raw.modules.filter((item) => KNOWN_MODULES.includes(item)) : []
  const tools = Array.isArray(defaults.tools) ? defaults.tools.filter((item) => KNOWN_TOOLS.includes(item)) : []
  return {
    id,
    label: text(raw.label) || id,
    description: text(raw.description),
    version: Number.isInteger(raw.version) ? raw.version : 1,
    modules,
    defaults: {
      title: text(defaults.title),
      mode: defaults.mode === 'llm' ? 'llm' : 'agent',
      tools,
      askFirst: defaults.askFirst === true,
      selfCheck: defaults.selfCheck === true,
      description: text(defaults.description),
      prompt: text(defaults.prompt),
      criteria: text(defaults.criteria),
    },
    knowledgeSeed: Array.isArray(raw.knowledgeSeed) ? raw.knowledgeSeed.filter((item) => typeof item === 'string') : [],
    acceptance: text(raw.acceptance),
  }
}

async function readTemplateDir(dir) {
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return []
    throw error
  }
  const list = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const path = join(dir, entry.name)
    try {
      const raw = await readFile(path, 'utf8')
      if (Buffer.byteLength(raw, 'utf8') > MAX_TEMPLATE_BYTES) continue
      const parsed = normalizeTemplate(JSON.parse(raw), entry.name.slice(0, -5))
      if (parsed !== undefined) list.push(parsed)
    } catch {
      // 坏包跳过，不影响其它包
    }
  }
  return list
}

/** 列出全部包：内置在前，用户包覆盖同 id。 */
export async function listTemplates() {
  const builtin = await readTemplateDir(builtinTemplateDir())
  const user = await readTemplateDir(userTemplateDir())
  const map = new Map(builtin.map((item) => [item.id, item]))
  for (const item of user) map.set(item.id, item)
  return [...map.values()]
}

/** 从一份智能体定义反向生成包（「存为模板」用）。 */
export function templateFromDefinition(definition, { id, label, description } = {}) {
  const raw = {
    id: text(id),
    label: text(label) || text(definition.title) || text(definition.name),
    description: text(description) || text(definition.description),
    version: 1,
    modules: [
      ...(typeof definition.style === 'string' && definition.style !== '' ? ['style'] : []),
      ...(typeof definition.criteria === 'string' && definition.criteria !== '' ? ['knowledge'] : []),
    ],
    defaults: {
      title: text(definition.title),
      mode: definition.mode === 'llm' ? 'llm' : 'agent',
      tools: Array.isArray(definition.tools) ? definition.tools : [],
      askFirst: definition.askFirst === true,
      selfCheck: definition.selfCheck === true,
      description: text(definition.description),
      prompt: text(definition.prompt),
      criteria: text(definition.criteria),
    },
    knowledgeSeed: [],
    acceptance: '',
  }
  return normalizeTemplate(raw, text(id))
}

/** 保存一个用户包。 */
export async function saveTemplate(template) {
  const normalized = normalizeTemplate(template, text(template?.id))
  if (normalized === undefined) {
    throw Object.assign(new Error('模板格式不合法：需要 id（小写字母/数字/连字符）与 defaults'), { code: 'BAD_TEMPLATE' })
  }
  const dir = userTemplateDir()
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${normalized.id}.json`)
  await writeFile(path, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  return { path, template: normalized }
}

/** 出厂种子知识卡目录（包 id 对应一个子目录）。 */
export function seedDirFor(templateId) {
  return join(PLUGIN_DIR, 'seeds', templateId)
}

/** 偏离记录文件：谁从哪个包衍生、包版本是多少。只追加，不改定义文件。 */
export function derivationsPath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'agent-manager', 'derivations.json')
}

/**
 * 把某个包的种子知识卡复制进智能体的知识目录（已存在同名卡则跳过，不覆盖用户改动）。
 * @returns 新写入的卡标识数组
 */
export async function seedKnowledge(templateId, agentName, knowledgeDir) {
  if (!ID_PATTERN.test(templateId) || !ID_PATTERN.test(agentName)) return []
  const source = seedDirFor(templateId)
  let entries
  try {
    entries = await readdir(source, { withFileTypes: true })
  } catch {
    return []
  }
  await mkdir(knowledgeDir, { recursive: true })
  const written = []
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const target = join(knowledgeDir, entry.name)
    try {
      await readFile(target, 'utf8')
      continue // 已有同名卡：尊重用户改动
    } catch {
      // 不存在才写
    }
    const body = await readFile(join(source, entry.name), 'utf8')
    await writeFile(target, body, 'utf8')
    written.push(entry.name.slice(0, -3))
  }
  return written
}

/** 追加一条「从哪个包衍生」的记录（供以后评估包是否好用）。 */
export async function recordDerivation({ agent, templateId, version, cardCount }) {
  const path = derivationsPath()
  let map = {}
  try {
    map = JSON.parse(await readFile(path, 'utf8'))
  } catch {
    map = {}
  }
  if (map === null || typeof map !== 'object' || Array.isArray(map)) map = {}
  map[agent] = {
    template: templateId,
    version: Number.isInteger(version) ? version : 1,
    at: new Date().toISOString(),
    seededCards: Number.isInteger(cardCount) ? cardCount : 0,
  }
  await mkdir(join(path, '..'), { recursive: true })
  await writeFile(path, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
  return map[agent]
}
