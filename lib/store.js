/**
 * 智能体定义的读写、校验与信任模型。
 *
 * 信任规则：
 *   用户级（$DSH_HOME/agents）：用户自己写的，默认启用。
 *   项目级（<cwd>/.dsh/agents）：来自仓库，**默认停用**；只有用户本地策略库
 *   （$DSH_HOME/agent-manager/projects.json，按项目 realpath 键）里的
 *   trustProject 或 enabled 才启用。仓库内的任何清单都不读取、不授权。
 */
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, isAbsolute, join, sep } from 'node:path'
import { parseFrontmatter, stringifyFrontmatter } from './frontmatter.js'
import { TOOL_GROUP_IDS } from './catalog.js'

export const NAME_PATTERN = /^[a-z][a-z0-9-]{0,49}$/
export const MODES = ['agent', 'llm']

const LIMITS = {
  fileBytes: 256 * 1024,
  promptBytes: 64 * 1024,
  descriptionChars: 500,
  titleChars: 100,
}

export function defaultUserDir() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'agents')
}

/**
 * 信任/启用策略必须由用户本机持有，绝不能来自被克隆的仓库——
 * 否则仓库自带的 .dsh/agents.json 可以自我授权。这里统一放用户目录。
 */
export function policyStorePath() {
  const home = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  return join(home, 'agent-manager', 'projects.json')
}

export function projectDirFor(cwd) {
  if (typeof cwd !== 'string' || cwd === '') throw bad('项目路径为空', 'BAD_CWD')
  return join(cwd, '.dsh', 'agents')
}

function bad(message, code) {
  const error = new Error(message)
  error.code = code
  return error
}

/** 项目路径必须是绝对、存在、目录，且落在允许的根内；主目录本身不算项目。 */
export async function resolveProjectCwd(input, roots) {
  if (typeof input !== 'string' || input.trim() === '') return undefined
  if (!isAbsolute(input)) throw bad('项目路径必须是绝对路径', 'BAD_CWD')
  let real
  try {
    real = await realpath(input)
  } catch {
    throw bad('项目路径不存在', 'BAD_CWD')
  }
  const info = await stat(real)
  if (!info.isDirectory()) throw bad('项目路径不是目录', 'BAD_CWD')

  let home
  try {
    home = await realpath(homedir())
  } catch {
    home = homedir()
  }
  if (real === home) throw bad('项目路径不能是用户主目录', 'BAD_CWD')
  let dshHomeReal = process.env.DSH_HOME ?? join(homedir(), '.dsh')
  try {
    dshHomeReal = await realpath(dshHomeReal)
  } catch {
    /* DSH_HOME 尚未创建时用字面路径 */
  }
  if (real === dshHomeReal || real.startsWith(dshHomeReal + sep)) {
    throw bad('项目路径不能在 DSH 家目录内', 'BAD_CWD')
  }
  let userDirReal = defaultUserDir()
  try {
    userDirReal = await realpath(defaultUserDir())
  } catch {
    /* 用户目录尚未创建时用字面路径比较 */
  }
  if (projectDirFor(real) === userDirReal) {
    throw bad('该项目目录与用户级定义目录重合', 'BAD_CWD')
  }

  const allowed = []
  for (const root of roots ?? []) {
    if (typeof root !== 'string' || root === '') continue
    try {
      allowed.push(await realpath(root))
    } catch {
      /* 根不存在就跳过 */
    }
  }
  if (!allowed.some((root) => real === root || real.startsWith(root + sep))) {
    throw bad('项目路径不在允许的根目录内', 'CWD_NOT_ALLOWED')
  }
  return real
}

/** 校验并归一化一条定义；错误面向用户。 */
export function normalizeDefinition(input, { name } = {}) {
  const errors = []
  const value = { ...input }
  const resolvedName = name ?? value.name

  if (typeof resolvedName !== 'string' || !NAME_PATTERN.test(resolvedName)) {
    errors.push('name 必须是小写字母开头的 1-50 位字母、数字或连字符')
  }
  if (typeof value.description !== 'string' || value.description.trim() === '') {
    errors.push('description 必填：它是自动调度的唯一依据')
  } else if (value.description.length > LIMITS.descriptionChars) {
    errors.push(`description 不能超过 ${LIMITS.descriptionChars} 字`)
  }
  if (typeof value.prompt !== 'string' || value.prompt.trim() === '') {
    errors.push('系统提示词不能为空')
  } else {
    if (Buffer.byteLength(value.prompt, 'utf8') > LIMITS.promptBytes) {
      errors.push('系统提示词过大')
    }
    // dsh-persona 的 prefix 是模板，{{...}} 会在组装时被当变量插值。
    if (value.prompt.includes('{{')) {
      errors.push('系统提示词不能包含 {{ }}：它会被当作提示词模板变量')
    }
  }
  const mode = value.mode ?? 'agent'
  if (!MODES.includes(mode)) errors.push(`mode 只能是 ${MODES.join(' / ')}`)

  let tools = []
  if (value.tools !== undefined) {
    if (!Array.isArray(value.tools)) errors.push('tools 必须是数组')
    else {
      const unknown = value.tools.filter((id) => !TOOL_GROUP_IDS.includes(id))
      if (unknown.length > 0) errors.push(`未知的工具组：${unknown.join(', ')}`)
      tools = value.tools.filter((id) => TOOL_GROUP_IDS.includes(id))
    }
  }

  for (const key of ['model', 'provider', 'reasoning_effort', 'title']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') {
      errors.push(`${key} 必须是字符串`)
    }
  }
  if (typeof value.title === 'string' && value.title.length > LIMITS.titleChars) {
    errors.push(`title 不能超过 ${LIMITS.titleChars} 字`)
  }

  if (errors.length > 0) throw bad(errors.join('；'), 'AGENT_DEFINITION_INVALID')

  const oneLine = (value) => String(value).replaceAll(/[\r\n]+/g, ' ').trim()

  return {
    name: resolvedName,
    title: typeof value.title === 'string' && value.title.trim() !== '' ? oneLine(value.title) : resolvedName,
    description: oneLine(value.description),
    prompt: value.prompt.trim(),
    mode,
    tools,
    model: value.model?.trim() || undefined,
    provider: value.provider?.trim() || undefined,
    reasoning_effort: value.reasoning_effort?.trim() || undefined,
    enabled: value.enabled === undefined ? true : Boolean(value.enabled),
    askFirst: value.askFirst === true,
    criteria: typeof value.criteria === 'string' ? value.criteria.trim().slice(0, 32000) : '',
    selfCheck: value.selfCheck === true,
    style: typeof value.style === 'string' && /^[a-z][a-z0-9-]{0,49}$/.test(value.style) ? value.style : '',
    avatar: typeof value.avatar === 'string' && /^[a-z0-9-]{1,32}$/.test(value.avatar) ? value.avatar : '',
  }
}

export async function readDefinitionFile(path, scope) {
  const info = await stat(path)
  if (info.size > LIMITS.fileBytes) throw bad('定义文件过大', 'AGENT_DEFINITION_INVALID')
  const text = await readFile(path, 'utf8')
  const { data, body } = parseFrontmatter(text)
  const definition = normalizeDefinition(
    {
      name: data.name,
      title: data.title,
      description: data.description,
      prompt: body,
      mode: data.mode,
      tools: data.tools,
      model: data.model,
      provider: data.provider,
      reasoning_effort: data.reasoning_effort,
      enabled: data.enabled,
      askFirst: data.askFirst,
      criteria: data.criteria,
      selfCheck: data.selfCheck,
      style: data.style,
      avatar: data.avatar,
    },
    { name: data.name },
  )
  // mtimeMs 用于并发写保护：客户端保存时带上它，Host 发现文件被动过就拒绝覆盖。
  return { ...definition, path, scope, mtimeMs: info.mtimeMs }
}

export async function scanDirectory(dir, scope) {
  const definitions = []
  const errors = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch (error) {
    if (error?.code === 'ENOENT') return { definitions, errors }
    throw error
  }
  await Promise.all(entries.map(async (entry) => {
    if (!entry.isFile() || !entry.name.endsWith('.md')) return
    const path = join(dir, entry.name)
    try {
      definitions.push(await readDefinitionFile(path, scope))
    } catch (error) {
      errors.push({ path, message: String(error?.message ?? error) })
    }
  }))
  definitions.sort((a, b) => a.name.localeCompare(b.name))
  return { definitions, errors }
}

const POLICY_MAX_BYTES = 1024 * 1024
let policyChain = Promise.resolve()

function serialPolicy(operation) {
  const next = policyChain.then(operation, operation)
  policyChain = next.then(() => undefined, () => undefined)
  return next
}

function asStringList(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === 'string') : []
}

/** 读取用户本地策略库中该项目的一项；仓库里的任何清单都不参与。 */
export async function readPolicy(cwd) {
  const path = policyStorePath()
  const empty = { enabled: [], disabled: [], trustProject: false, path, projectKey: undefined, error: undefined }
  let key
  try {
    key = await realpath(cwd)
  } catch {
    return empty
  }
  let map
  try {
    const info = await stat(path)
    if (info.size > POLICY_MAX_BYTES) return { ...empty, projectKey: key, error: '策略文件过大' }
    map = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code === 'ENOENT') return { ...empty, projectKey: key }
    return { ...empty, projectKey: key, error: '策略文件无法解析' }
  }
  const entry = map?.[key]
  if (entry === undefined || entry === null || typeof entry !== 'object') {
    return { ...empty, projectKey: key }
  }
  return {
    enabled: asStringList(entry.enabled),
    disabled: asStringList(entry.disabled),
    trustProject: entry.trustProject === true,
    path,
    projectKey: key,
    error: undefined,
  }
}

/**
 * 生效规则：
 *   显式 disabled → 停用；
 *   显式 enabled → 启用；
 *   项目级默认停用（除非 trustProject）；用户级默认启用。
 */
export function effectiveEnabled(definition, policy) {
  if (definition.enabled === false) return false
  if (Array.isArray(policy?.disabled) && policy.disabled.includes(definition.name)) return false
  if (Array.isArray(policy?.enabled) && policy.enabled.includes(definition.name)) return true
  if (definition.scope === 'project') return policy?.trustProject === true
  return true
}

export async function loadAgents({ userDir = defaultUserDir(), cwd } = {}) {
  const [user, project, policy] = await Promise.all([
    scanDirectory(userDir, 'user'),
    cwd === undefined ? { definitions: [], errors: [] } : scanDirectory(projectDirFor(cwd), 'project'),
    cwd === undefined
      ? { enabled: [], disabled: [], trustProject: false, path: undefined, error: undefined }
      : readPolicy(cwd),
  ])

  const userMap = new Map(user.definitions.map((definition) => [definition.name, definition]))
  const projectMap = new Map(project.definitions.map((definition) => [definition.name, definition]))
  const names = new Set([...userMap.keys(), ...projectMap.keys()])

  const definitions = []
  for (const name of names) {
    const fromUser = userMap.get(name)
    const fromProject = projectMap.get(name)
    if (fromProject !== undefined && fromUser !== undefined) {
      // 只有“生效的”项目定义才覆盖用户级；未信任的同名文件不能遮蔽用户自己的智能体。
      if (effectiveEnabled(fromProject, policy)) {
        definitions.push({ ...fromProject, enabledEffective: true })
      } else {
        definitions.push({ ...fromUser, enabledEffective: effectiveEnabled(fromUser, policy), shadowedProject: true })
      }
    } else if (fromProject !== undefined) {
      definitions.push({ ...fromProject, enabledEffective: effectiveEnabled(fromProject, policy) })
    } else {
      definitions.push({ ...fromUser, enabledEffective: effectiveEnabled(fromUser, policy) })
    }
  }

  return {
    definitions: definitions.sort((a, b) => a.name.localeCompare(b.name)),
    errors: [...user.errors, ...project.errors],
    policy,
  }
}

export async function saveDefinition(dir, definition, options = {}) {
  const normalized = normalizeDefinition(definition, { name: definition.name })
  await mkdir(dir, { recursive: true })
  const path = join(dir, `${normalized.name}.md`)
  /* 并发写保护：两个窗口各改一份、后写覆盖先写，谁也发现不了。
     客户端的列表里带着 mtimeMs，保存时带回来；文件已经不是那个版本就拒绝。 */
  if (typeof options.expectedMtime === 'number' && Number.isFinite(options.expectedMtime)) {
    try {
      const info = await stat(path)
      if (Math.abs(info.mtimeMs - options.expectedMtime) > 1) {
        throw Object.assign(
          new Error('这份定义在你打开之后被改过（另一个窗口或编辑器）。你的修改还在表单里：先返回列表、再重新打开它（草稿会保留），确认覆盖后再保存。'),
          { code: 'STALE_DEFINITION' },
        )
      }
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error
    }
  }
  const text = stringifyFrontmatter(
    {
      name: normalized.name,
      title: normalized.title,
      description: normalized.description,
      mode: normalized.mode,
      tools: normalized.tools,
      model: normalized.model,
      provider: normalized.provider,
      reasoning_effort: normalized.reasoning_effort,
      enabled: normalized.enabled,
      askFirst: normalized.askFirst === true ? true : undefined,
      criteria: normalized.criteria !== '' ? normalized.criteria : undefined,
      selfCheck: normalized.selfCheck === true ? true : undefined,
      style: normalized.style !== '' ? normalized.style : undefined,
      avatar: normalized.avatar !== '' ? normalized.avatar : undefined,
    },
    normalized.prompt,
  )
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, text, 'utf8')
  await rename(temporary, path)
  // 带回新 mtime：客户端保存后不必再读一遍文件就能继续并发保护。
  const written = await stat(path)
  return { ...normalized, path, mtimeMs: written.mtimeMs }
}

/** 删除指定目录下的定义；返回是否真的存在。 */
export async function deleteDefinition(dir, name) {
  if (!NAME_PATTERN.test(name)) throw bad('name 非法', 'AGENT_DEFINITION_INVALID')
  const path = join(dir, `${name}.md`)
  try {
    await stat(path)
  } catch {
    return { removed: false, path }
  }
  await rm(path, { force: true })
  return { removed: true, path }
}

/** 写入用户本地策略库；只更新该项目的条目，其它项目保持不变。 */
export async function writePolicy(cwd, { enabled, disabled, trustProject }) {
  return serialPolicy(async () => {
    const { path, key, map } = await loadPolicyMap(cwd)
    const entry = {}
    if (Array.isArray(enabled) && enabled.length > 0) entry.enabled = enabled
    if (Array.isArray(disabled) && disabled.length > 0) entry.disabled = disabled
    if (trustProject === true) entry.trustProject = true
    map[key] = entry
    await writePolicyMap(path, map)
    return { path, projectKey: key, ...entry }
  })
}

/**
 * 读-改-写在同一把锁内完成，避免两个并发请求互相覆盖（例如 toggle 把信任清空）。
 */
export async function updatePolicy(cwd, patch) {
  return serialPolicy(async () => {
    const { path, key, map } = await loadPolicyMap(cwd)
    const current = map[key] ?? {}
    const next = {
      enabled: patch.enabled !== undefined ? patch.enabled : asStringList(current.enabled),
      disabled: patch.disabled !== undefined ? patch.disabled : asStringList(current.disabled),
      trustProject: patch.trustProject !== undefined ? patch.trustProject === true : current.trustProject === true,
    }
    const entry = {}
    if (next.enabled.length > 0) entry.enabled = next.enabled
    if (next.disabled.length > 0) entry.disabled = next.disabled
    if (next.trustProject === true) entry.trustProject = true
    map[key] = entry
    await writePolicyMap(path, map)
    return { path, projectKey: key, ...entry }
  })
}

async function loadPolicyMap(cwd) {
  const path = policyStorePath()
  let key
  try {
    key = await realpath(cwd)
  } catch {
    throw bad('项目路径不存在', 'BAD_CWD')
  }
  let map = {}
  try {
    const info = await stat(path)
    if (info.size > POLICY_MAX_BYTES) throw bad('策略文件过大，请先检查', 'POLICY_CORRUPT')
    map = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    if (error?.code !== 'ENOENT') throw bad('策略文件无法解析，请先修复或删除它', 'POLICY_CORRUPT')
  }
  if (map === null || typeof map !== 'object' || Array.isArray(map)) map = {}
  return { path, key, map }
}

async function writePolicyMap(path, map) {
  await mkdir(dirname(path), { recursive: true })
  const temporary = `${path}.tmp-${process.pid}-${Date.now()}`
  await writeFile(temporary, `${JSON.stringify(map, null, 2)}\n`, 'utf8')
  await rename(temporary, path)
}
