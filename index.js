/**
 * 智能体管理 · Host 半。
 *
 * 信任与安全要点：
 *   - 项目级定义默认停用（见 lib/store.js effectiveEnabled）；
 *   - 预设懒注册，id 带内容摘要，同名不同内容不互相顶替；
 *   - 注册串行化，失败清理，卸载时释放；
 *   - 系统提示里的清单关闭插值（interpolate:false），避免描述里的 {{}} 打断组装。
 */
import { homedir } from 'node:os'
import { buildPreset, isManagedPresetId, previewPresetId } from './lib/preset.js'
import { listTemplates, recordDerivation, saveTemplate, seedKnowledge, templateFromDefinition } from './lib/templates.js'
import {
  deleteAllCards,
  deleteCard,
  knowledgeCounts,
  knowledgeDirFor,
  listCards,
  readCard,
  saveCard,
} from './lib/knowledge.js'
import { installBuiltinStyles, listStyles, readStyle, saveStyle, deleteStyle } from './lib/styles.js'
import {
  NAME_PATTERN,
  defaultUserDir,
  deleteDefinition,
  effectiveEnabled,
  loadAgents,
  normalizeDefinition,
  projectDirFor,
  saveDefinition,
  updatePolicy,
} from './lib/store.js'
import { TOOL_GROUPS, currentPlatform, groupAvailable } from './lib/catalog.js'
import { registerRoutes } from './lib/routes.js'

export const name = 'agent-manager'
export const inject = ['agentPresets', 'tools', 'systemPrompt', 'subagents', 'workingDirectory', 'llm', 'web', 'commands']

const CONTEXT_ORDER = 8000
const CACHE_LIMIT = 50

const projectCaches = new Map()
const userCache = { text: '' }
const registeredPresets = new Map()
/** presetId -> 智能体 name（供 knowledge 工具反查调用者身份）。 */
const presetIndex = new Map()
const agentDisposers = new Map()
let chain = Promise.resolve()

function serial(operation) {
  const next = chain.then(operation, operation)
  chain = next.then(() => undefined, () => undefined)
  return next
}

function log(ctx, message) {
  ctx.logger?.info?.(`[agent-manager] ${message}`)
}

function renderCatalog(definitions, header) {
  const usable = definitions.filter((definition) => definition.enabledEffective)
  if (usable.length === 0) return ''
  const lines = [header]
  for (const definition of usable) lines.push(`- ${definition.name}：${definition.description}`)
  return lines.join('\n')
}

function safeCwd(ctx, agent) {
  if (agent === undefined) return ctx.workingDirectory.defaultDirectory
  try {
    return ctx.workingDirectory.get(agent.session)
  } catch {
    return ctx.workingDirectory.defaultDirectory
  }
}

function allowedRoots(ctx) {
  const roots = [homedir()]
  try {
    const registry = ctx.get('workspaceRegistry')
    for (const workspace of registry?.list?.() ?? []) {
      const path = workspace?.path ?? workspace?.root ?? workspace?.directory
      if (typeof path === 'string' && path !== '') roots.push(path)
    }
  } catch {
    /* 没有 workspaceRegistry 时只用 home */
  }
  return roots
}

async function refreshUser() {
  const loaded = await loadAgents({ userDir: defaultUserDir() })
  userCache.text = renderCatalog(
    loaded.definitions.filter((definition) => definition.scope === 'user'),
    '可用自定义智能体（需要时用 use_agent 调用，task 写完整自包含任务）：',
  )
  return loaded
}

async function refreshProject(cwd) {
  const loaded = await loadAgents({ userDir: defaultUserDir(), cwd })
  const text = renderCatalog(
    loaded.definitions.filter((definition) => definition.scope === 'project'),
    '本项目可用的自定义智能体（需要时用 use_agent 调用）：',
  )
  if (projectCaches.size >= CACHE_LIMIT && !projectCaches.has(cwd)) {
    const oldest = projectCaches.keys().next().value
    if (oldest !== undefined) projectCaches.delete(oldest)
  }
  projectCaches.set(cwd, { text, loaded })
  return loaded
}

function projectTextFor(cwd) {
  return projectCaches.get(cwd)?.text ?? ''
}

async function resolveDefinition(ctx, cwd, agentName) {
  const loaded = await loadAgents({ userDir: defaultUserDir(), cwd })
  const definition = loaded.definitions.find((item) => item.name === agentName)
  if (definition === undefined) {
    const available = loaded.definitions.filter((item) => item.enabledEffective).map((item) => item.name)
    const error = new Error(
      available.length === 0
        ? `没有名为 ${agentName} 的智能体，当前也没有可用智能体`
        : `没有名为 ${agentName} 的智能体；可用：${available.join(', ')}`,
    )
    error.code = 'AGENT_NOT_FOUND'
    throw error
  }
  if (!definition.enabledEffective) {
    const error = new Error(`智能体 ${agentName} 在当前项目被停用或未信任`)
    error.code = 'AGENT_DISABLED'
    throw error
  }
  return definition
}

function attachCatalog(ctx, agent) {
  if (agentDisposers.has(agent.id)) return
  const cwd = safeCwd(ctx, agent)
  void refreshProject(cwd).catch(() => {})
  const dispose = agent.ctx.effect(
    () =>
      agent.ctx.systemPrompt.context({
        name: 'agent-manager:project',
        order: CONTEXT_ORDER,
        interpolate: false,
        text: () => projectTextFor(cwd),
      }),
    'agent-manager.project-catalog',
  )
  agentDisposers.set(agent.id, dispose)
}

function resolveRoute(ctx, definition) {
  const fallback = ctx.get('agentDefaultModel')?.currentSelection?.()
  if (definition.provider !== undefined) {
    return {
      provider: definition.provider,
      model: definition.model ?? fallback?.model,
      ...(definition.reasoning_effort === undefined ? {} : { reasoningEffort: definition.reasoning_effort }),
    }
  }
  if (definition.model !== undefined) {
    if (fallback?.provider === undefined) return undefined
    return {
      provider: fallback.provider,
      model: definition.model,
      ...(definition.reasoning_effort === undefined ? {} : { reasoningEffort: definition.reasoning_effort }),
    }
  }
  if (fallback?.provider === undefined || fallback?.model === undefined) return undefined
  return {
    provider: fallback.provider,
    model: fallback.model,
    ...(definition.reasoning_effort === undefined ? {} : { reasoningEffort: definition.reasoning_effort }),
  }
}

async function runLlm(ctx, definition, task, signal) {
  const route = resolveRoute(ctx, definition)
  if (route === undefined || route.model === undefined) {
    throw new Error('mode=llm 需要可用的 provider/model')
  }
  let text = ''
  const stream = ctx.llm.stream({
    provider: route.provider,
    model: route.model,
    ...(route.reasoningEffort === undefined ? {} : { reasoningEffort: route.reasoningEffort }),
    system: definition.prompt,
    messages: [{ role: 'user', content: [{ type: 'text', text: task }] }],
    signal,
  })
  for await (const chunk of stream) {
    if (chunk?.type === 'text-delta') text += chunk.text
    if (chunk?.type === 'finish') {
      const reason = chunk.reason
      if (reason?.kind === 'error') throw new Error('模型调用失败')
      if (reason?.kind === 'aborted') throw new Error('模型调用被取消')
    }
  }
  return text
}

async function ensurePresetInner(ctx, definition) {
  let cards = []
  try {
    cards = await listCards(definition.name)
  } catch {
    cards = []
  }
  let styleBody
  let styleName
  if (typeof definition.style === 'string' && definition.style !== '') {
    try {
      const style = await readStyle(definition.style)
      styleBody = style.body
      styleName = style.name
    } catch {
      /* 风格文件被删就忽略 */
    }
  }
  const preset = buildPreset(definition, {
    ...(cards.length > 0 ? { knowledgeDir: knowledgeDirFor(definition.name) } : {}),
    ...(styleBody !== undefined ? { styleBody, styleName } : {}),
  })
  const current = registeredPresets.get(definition.name)
  if (current !== undefined && current.id === preset.id) return preset.id

  const unregister = await ctx.agentPresets.register(preset)
  try {
    const meta = await ctx.agentPresets.resolve(preset.id)
    if (meta?.broken !== undefined) {
      throw Object.assign(new Error(`预设激活失败：${meta.broken}`), { code: 'AGENT_PRESET_BROKEN' })
    }
  } catch (error) {
    await unregister().catch(() => {})
    throw error
  }
  if (current !== undefined) await current.unregister().catch(() => {})
  registeredPresets.set(definition.name, { id: preset.id, unregister })
  presetIndex.set(preset.id, definition.name)
  return preset.id
}

async function runAgent(ctx, definition, task, exec) {
  if (exec.agent === undefined) throw new Error('use_agent 必须由 agent 调用')
  // 注册与 spawn 必须在同一把串行锁里：否则 reload 可能在两者之间卸载预设。
  return serial(async () => {
    const presetId = await ensurePresetInner(ctx, definition)
    const route = resolveRoute(ctx, definition)
    const activation = await ctx.subagents.startActivation({
      provider: 'spawn',
      label: definition.name,
      request: {
        prompt: [{ type: 'text', text: task }],
        parent: exec.agent,
        agentPreset: presetId,
        ...(route === undefined ? {} : { agentOptions: route }),
      },
      signal: exec.signal,
      delivery: 'parent',
    })
    return activation.childId
  })
}

/** 解析 /agent 输入：['名字', ...问题]。 */
function parseAgentInput(rawInput) {
  const text = String(rawInput ?? '').trim()
  if (text === '') return { kind: 'list' }
  const spaceAt = text.indexOf(' ')
  const name = (spaceAt === -1 ? text : text.slice(0, spaceAt)).trim()
  const question = spaceAt === -1 ? '' : text.slice(spaceAt + 1).trim()
  return { kind: 'call', name, question }
}

function createAgentCommand(ctx, api, commandName) {
  // /expert 是 /agent 的别名，保留给老用户；help 里要说清这层关系，
  // 否则用户会以为是两个不同功能。
  const aliasOf = commandName === 'expert' ? '/agent 的别名，保留给老习惯' : undefined
  return {
    name: commandName,
    description: aliasOf === undefined
      ? '召唤一个智能体，让它在当前会话里回答（对话过程汇入本会话）'
      : `召唤一个智能体（${aliasOf}）`,
    input: { hint: '<智能体名> [问题]；不带参数列出全部智能体' },
    handler: async (invocation) => {
      const parsed = parseAgentInput(invocation.rawInput)
      if (parsed.kind === 'list') {
        const loaded = await api.list(undefined)
        const lines = loaded.definitions.filter((d) => d.enabledEffective).map((d) => `- ${d.name}：${d.title} — ${d.description}`)
        return {
          kind: 'success',
          text: lines.length === 0
            ? '还没有可用的智能体。在「智能体」面板新建。'
            : `可用智能体（/${commandName} <名字> [问题]）：\n${lines.join('\n')}`,
        }
      }
      const loaded = await api.list(undefined)
      const definition = loaded.definitions.find((d) => d.name === parsed.name && d.enabledEffective)
      if (definition === undefined) {
        const names = loaded.definitions.filter((d) => d.enabledEffective).map((d) => d.name)
        return { kind: 'error', text: `没有叫「${parsed.name}」的智能体。可用：${names.join('、') || '（无）'}` }
      }
      if (parsed.question === '') {
        return {
          kind: 'success',
          text: `智能体「${definition.name}」已就绪。用法：/${commandName} ${definition.name} <你的问题>。\n也可以在「智能体」面板新建会话直接与它对话。`,
        }
      }
      if (invocation.agent === undefined) {
        return { kind: 'error', text: '该命令需要在会话中使用。' }
      }
      // 在当前会话里 spawn 智能体：parent=当前 agent，delivery=parent，运行与产出汇入本会话。
      await runAgent(ctx, definition, parsed.question, { agent: invocation.agent, signal: invocation.signal })
      return {
        kind: 'success',
        text: `已召唤智能体「${definition.title}」（${definition.name}），它正在独立上下文里工作，过程与结果会显示在本会话中。`,
      }
    },
  }
}

/** 从托管 preset id（am-<name>-<hash8>）解析智能体名。 */
function nameFromPresetId(id) {
  if (typeof id !== 'string' || !isManagedPresetId(id)) return undefined
  const body = id.slice(3)
  const match = /^(.*)-[0-9a-f]{8}$/.exec(body)
  if (match === null) return undefined
  const name = match[1]
  return NAME_PATTERN.test(name) ? name : undefined
}

/**
 * 反查调用者是哪个托管智能体；非托管返回 undefined。
 * 以 composedPreset 的 id 为准（不依赖易失的注册表：保存知识卡会卸载旧预设，
 * 但运行中的会话仍持有旧 id，按 id 解析才能持续可用）。
 */
function callerAgentName(ctx, exec) {
  if (exec.agent === undefined) return undefined
  let composed
  try {
    composed = typeof ctx.agentPresets?.composedPreset === 'function'
      ? ctx.agentPresets.composedPreset(exec.agent.ctx)
      : undefined
  } catch {
    return undefined
  }
  const parsed = nameFromPresetId(composed)
  if (parsed !== undefined) return parsed
  // 兜底：注册表里查（正常情况下 id 已能解析）
  return presetIndex.get(composed)
}

/** 智能体自己读写自己知识库的工具。安全边界：只能操作调用者自己的库。 */
function createKnowledgeTools(ctx) {
  const resolveCaller = (exec) => {
    const name = callerAgentName(ctx, exec)
    if (name === undefined) {
      throw Object.assign(new Error('knowledge 工具只有「智能体」面板创建的智能体才能用'), { code: 'NOT_AN_EXPERT' })
    }
    return name
  }
  const listTool = {
    name: 'knowledge_list',
    description: '列出自己（当前智能体）的全部知识卡：卡片标识、标题、描述与大小。先看目录再决定读哪张。',
    parameters: { type: 'object', properties: {}, additionalProperties: false },
    output: {
      schema: { type: 'object', properties: { cards: { type: 'array', items: { type: 'object' } } }, additionalProperties: true },
      render(_args, value) {
        const cards = Array.isArray(value?.cards) ? value.cards : []
        // 契约要求返回内容块数组；返回裸字符串会让下游 content.some 崩溃。
        return [{
          type: 'text',
          text: cards.length === 0
            ? '知识库为空'
            : cards.map((c) => `${c.card}：${c.name} — ${c.description}`).join('\n'),
        }]
      },
    },
    async execute(_args, exec) {
      const name = resolveCaller(exec)
      return { cards: await listCards(name) }
    },
  }
  const saveTool = {
    name: 'knowledge_save',
    description:
      '把一条专业知识写进自己（当前智能体）的知识库。用户甩来参考资料、网页、文档时，' +
      '先阅读消化，再按使用场景拆成卡片写入；card 是 kebab-case 英文标识，' +
      'description 必须具体说明「什么时候需要加载这张卡」。多份材料就多次调用。',
    parameters: {
      type: 'object',
      properties: {
        card: { type: 'string', description: '卡片标识：小写字母开头，可含数字与连字符，≤64 位' },
        name: { type: 'string', description: '卡片标题（中文可读）' },
        description: { type: 'string', description: '什么时候需要加载这张卡（一句话，越具体越好）' },
        body: { type: 'string', description: '卡片正文：Markdown。写可直接执行的规范/清单/案例，不写空话' },
      },
      required: ['card', 'body'],
      additionalProperties: false,
    },
    output: {
      schema: { type: 'object', properties: { card: { type: 'string' }, path: { type: 'string' } }, additionalProperties: true },
      render(_args, value) {
        return [{
          type: 'text',
          text: typeof value?.card === 'string' ? `已存知识卡 ${value.card}` : '已存',
        }]
      },
    },
    async execute(args, exec) {
      const name = resolveCaller(exec)
      const saved = await saveCard(name, {
        card: args.card,
        name: args.name,
        description: args.description,
        body: args.body,
      })
      // 知识变了，预设要重建才会挂上/更新目录；卸载旧注册，下次调用时按需重建。
      const entry = registeredPresets.get(name)
      if (entry !== undefined) {
        await entry.unregister().catch(() => {})
        registeredPresets.delete(name)
        presetIndex.delete(entry.id)
      }
      return saved
    },
  }
  return [listTool, saveTool]
}

function createUseAgentTool(ctx) {
  return {
  name: 'use_agent',
  description:
    '调用一个自定义子智能体，让它以自己的系统提示词和工具集在独立上下文里完成任务。' +
    '可用的智能体见系统提示中的「可用自定义智能体」段；名称必须与其中一致。' +
    'task 要写成完整、自包含的任务说明，子智能体看不到当前对话。',
  parameters: {
    type: 'object',
    properties: {
      agent: { type: 'string', description: '自定义智能体的 name' },
      task: { type: 'string', description: '完整、自包含的任务说明' },
      refs: {
        type: 'array',
        items: { type: 'string' },
        description: '参考图或参考文档的本地绝对路径（可选）；子智能体会自己读取',
      },
    },
    required: ['agent', 'task'],
    additionalProperties: false,
  },
  output: {
    schema: {
      type: 'object',
      properties: { mode: { type: 'string' }, subagentId: { type: 'string' }, text: { type: 'string' } },
      additionalProperties: true,
    },
    render(_args, value) {
      const payload = value ?? {}
      const body = typeof payload.subagentId === 'string'
        ? `已启动子智能体 ${payload.subagentId}，完成后会回传结果。`
        : String(payload.text ?? '')
      return [{ type: 'text', text: body }]
    },
  },
  async execute(args, exec) {
    const input = args ?? {}
    if (typeof input.agent !== 'string' || input.agent.trim() === '') throw new Error('agent 不能为空')
    if (typeof input.task !== 'string' || input.task.trim() === '') throw new Error('task 不能为空')
    const refs = Array.isArray(input.refs)
      ? input.refs.filter((item) => typeof item === 'string' && item.trim() !== '').slice(0, 12)
      : []
    const fullTask = refs.length === 0
      ? input.task
      : `${input.task}\n\n参考材料（用 read 或 read_image 自己读）：\n${refs.map((item) => `- ${item}`).join('\n')}`
    // 自定义智能体内部不再允许继续委派：链路越深越不稳，也避免递归。
    let composed
    try {
      composed = typeof ctx.agentPresets?.composedPreset === 'function'
        ? ctx.agentPresets.composedPreset(exec.agent?.ctx)
        : undefined
    } catch {
      composed = undefined
    }
    if (typeof composed === 'string' && isManagedPresetId(composed)) {
      throw new Error('自定义智能体内部不允许再调用 use_agent。请把任务一次写完整，交给它自己完成。')
    }
    const cwd = safeCwd(ctx, exec.agent)
    const definition = await resolveDefinition(ctx, cwd, input.agent.trim())
    if (definition.mode === 'llm') {
      return { mode: 'llm', text: await runLlm(ctx, definition, fullTask, exec.signal) }
    }
    return { mode: 'agent', subagentId: await runAgent(ctx, definition, fullTask, exec) }
  },
  }
}


const GEN_SYSTEM = `你是「智能体配置助手」。用户会用大白话描述想要的智能体。你只输出严格 JSON，不要 markdown 代码块，不要解释。

输出两种之一：
1) 信息足够：
{"ok":true,"name":"kebab-case-英文代号","title":"中文显示名","description":"当用户……时调用","prompt":"系统提示词"}
2) 信息不足（用途或场景不明确）：
{"ok":false,"questions":["通俗问题1","通俗问题2"]}

要求：
- name 只能小写字母开头，含小写字母/数字/连字符，不超过 50 字符。
- description 是「应用场景」：什么情况下该用它，一句话，以「当用户」开头。
- prompt 是给智能体的岗位说明书：身份、要做什么、不要做什么、输出格式；具体可执行；不要包含 {{ }}。
- questions 最多 3 个，必须口语化、具体，不要问技术术语。
- 只输出 JSON。`

let modelCache = { at: 0, value: undefined }


function extractJson(text) {
  let body = String(text ?? '').trim()
  if (body.startsWith('```')) {
    body = body.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '')
  }
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw Object.assign(new Error('模型没有返回可解析的配置'), { code: 'GENERATE_INVALID' })
  try {
    return JSON.parse(body.slice(start, end + 1))
  } catch {
    throw Object.assign(new Error('模型返回的配置不是合法 JSON'), { code: 'GENERATE_INVALID' })
  }
}

function slugify(value) {
  const base = String(value ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
  const name = base === '' ? 'custom-agent' : base
  return /^[a-z]/.test(name) ? name : `agent-${name}`.slice(0, 50)
}

function normalizeSuggestion(raw) {
  if (raw === null || typeof raw !== 'object') {
    throw Object.assign(new Error('模型返回格式不对'), { code: 'GENERATE_INVALID' })
  }
  if (raw.ok === false) {
    const questions = Array.isArray(raw.questions)
      ? raw.questions.filter((item) => typeof item === 'string' && item.trim() !== '').slice(0, 3)
      : []
    return {
      needMore: true,
      questions: questions.length > 0 ? questions : ['能再具体说说：你要它做什么？什么情况下会用到它？'],
    }
  }
  const name = typeof raw.name === 'string' && /^[a-z][a-z0-9-]{0,49}$/.test(raw.name) ? raw.name : slugify(raw.title ?? raw.name)
  const title = typeof raw.title === 'string' && raw.title.trim() !== '' ? raw.title.trim().slice(0, 100) : name
  const description = typeof raw.description === 'string' && raw.description.trim() !== ''
    ? raw.description.trim().replaceAll(/[\r\n]+/g, ' ').slice(0, 500)
    : `当用户需要${title}时调用`
  const prompt = typeof raw.prompt === 'string' && raw.prompt.trim() !== ''
    ? raw.prompt.trim().replaceAll('{{', '{ {')
    : `你是${title}。请按用户的要求完成任务。`
  return { needMore: false, suggestion: { name, title, description, prompt } }
}


const INGEST_SYSTEM = `你是「知识卡整理助手」。用户给你一批原始材料（网页正文、文档、笔记或URL），你要把它们整理成若干张专业知识卡。你只输出严格 JSON，不要 markdown 代码块，不要解释。

输出格式：
{"cards":[{"card":"kebab-case-英文标识","name":"中文标题","description":"什么时候该加载这张卡（一句话，以「当需要……」开头）","body":"Markdown 正文"}]}

要求：
- 按「使用场景」拆卡，不要按「章节」拆；一张卡只讲一件事。
- 每张卡 300–2000 字，条理清楚，能用列表/表格就用。
- card 只能小写字母、数字、连字符，不超过 64 位。
- description 决定这张卡什么时候被加载，必须具体，例如「当需要确定品牌主色与辅助色配比时」。
- body 必须是可直接使用的内容（规范、清单、步骤、案例、避坑），不要写「本文介绍了……」这种空话。
- 最多 12 张卡；材料少就少出几张。
- 只输出 JSON。`

function parseCards(text) {
  let body = String(text ?? '').trim()
  if (body.startsWith('```')) body = body.replace(/^```[a-zA-Z]*\s*/, '').replace(/```\s*$/, '')
  const start = body.indexOf('{')
  const end = body.lastIndexOf('}')
  if (start < 0 || end <= start) throw Object.assign(new Error('模型没有返回可解析的卡片'), { code: 'GENERATE_INVALID' })
  let parsed
  try {
    parsed = JSON.parse(body.slice(start, end + 1))
  } catch {
    throw Object.assign(new Error('模型返回的卡片不是合法 JSON'), { code: 'GENERATE_INVALID' })
  }
  const list = Array.isArray(parsed?.cards) ? parsed.cards : []
  const cards = []
  for (const item of list.slice(0, 12)) {
    const card = typeof item?.card === 'string' ? item.card.trim().toLowerCase() : ''
    const body = typeof item?.body === 'string' ? item.body.trim() : ''
    if (!/^[a-z0-9][a-z0-9-]{0,63}$/.test(card) || body === '') continue
    cards.push({
      card,
      name: typeof item.name === 'string' && item.name.trim() !== '' ? item.name.trim().slice(0, 100) : card,
      description: typeof item.description === 'string' ? item.description.trim().replaceAll(/[\r\n]+/g, ' ').slice(0, 500) : '',
      body: body.slice(0, 60000),
    })
  }
  if (cards.length === 0) throw Object.assign(new Error('没有产出可用的知识卡'), { code: 'GENERATE_INVALID' })
  return cards
}

/** 从一个 URL 抓正文（用宿主 web 服务，避免子智能体再跑一遍）。 */
async function fetchPage(ctx, url, signal) {
  const target = String(url ?? '').trim()
  if (!/^https?:\/\//i.test(target)) throw Object.assign(new Error('只支持 http/https 网址'), { code: 'GENERATE_INVALID' })
  try {
    const result = await ctx.web.fetch({ url: target }, signal)
    const text = typeof result?.text === 'string' ? result.text : typeof result?.content === 'string' ? result.content : ''
    if (text.trim() === '') throw new Error('empty')
    return text.slice(0, 120000)
  } catch {
    throw Object.assign(new Error(`抓取网页失败：${target}`), { code: 'GENERATE_INVALID' })
  }
}

export function apply(ctx, config) {
  void refreshUser().catch((error) => log(ctx, `refresh user failed: ${String(error)}`))

  ctx.effect(() => ctx.tools.register(createUseAgentTool(ctx)), 'agent-manager.tool')
  ctx.effect(() => {
    const disposers = createKnowledgeTools(ctx).map((tool) => ctx.tools.register(tool))
    return () => { for (const dispose of disposers) dispose() }
  }, 'agent-manager.knowledge-tools')

  // 用户级清单走全局 context：插件在会话中途加载时，已有 agent 也能看到。
  ctx.effect(
    () =>
      ctx.systemPrompt.context({
        name: 'agent-manager:user',
        order: CONTEXT_ORDER,
        interpolate: false,
        text: () => userCache.text,
      }),
    'agent-manager.user-catalog',
  )

  ctx.effect(() => ctx.on('agent/created', ({ agent }) => attachCatalog(ctx, agent)), 'agent-manager.created')

  ctx.effect(
    () =>
      ctx.on('agent/disposed', ({ agent }) => {
        const dispose = agentDisposers.get(agent.id)
        agentDisposers.delete(agent.id)
        try {
          dispose?.()
        } catch {
          /* 已随 agent 释放 */
        }
      }),
    'agent-manager.disposed',
  )

  // 插件晚加载时补挂已有 agent（服务若没有 list 就跳过）。
  try {
    for (const agent of ctx.agents?.list?.() ?? []) attachCatalog(ctx, agent)
  } catch {
    /* 服务形态不同则忽略 */
  }

  const api = {
    async reload(cwd) {
      await serial(async () => {
        for (const entry of registeredPresets.values()) await entry.unregister().catch(() => {})
        registeredPresets.clear()
        presetIndex.clear()
      })
      await refreshUser()
      if (cwd !== undefined) await refreshProject(cwd)
    },
    listGroups() {
      const platform = currentPlatform()
      return TOOL_GROUPS
        .filter((group) => group.hidden !== true)
        .map((group) => ({
          id: group.id,
          label: group.label,
          description: group.description,
          platform: group.platform,
          available: groupAvailable(group, platform),
          defaultOn: group.defaultOn === true,
        }))
    },
    async efforts({ provider, model }) {
      if (typeof provider !== 'string' || provider === '' || typeof model !== 'string' || model === '') {
        return { efforts: [] }
      }
      try {
        const info = await ctx.llm.resolveModelInfo(provider, model)
        const list = info?.reasoningEfforts ?? info?.efforts ?? info?.reasoning?.efforts ?? []
        const efforts = Array.isArray(list)
          ? list.map((item) => (typeof item === 'string' ? item : item?.id ?? item?.value)).filter((item) => typeof item === 'string')
          : []
        return { efforts }
      } catch {
        return { efforts: [] }
      }
    },
    async listModels() {
      const now = Date.now()
      if (modelCache.value !== undefined && now - modelCache.at < 300000) return modelCache.value
      const providers = typeof ctx.llm?.listProviders === 'function' ? ctx.llm.listProviders() : []
      const groups = []
      for (const info of providers ?? []) {
        const id = info?.id ?? info?.provider ?? info?.name
        if (typeof id !== 'string' || id === '') continue
        let models = []
        try {
          const list = typeof ctx.llm.listModels === 'function' ? await ctx.llm.listModels(id) : []
          models = (list ?? [])
            .map((model) => ({ id: model?.id ?? model?.model, label: model?.name ?? model?.displayName ?? model?.id ?? model?.model }))
            .filter((model) => typeof model.id === 'string' && model.id !== '')
        } catch {
          /* 单个 provider 拉取失败不影响其它 */
        }
        groups.push({ provider: id, label: info?.label ?? info?.name ?? id, models })
      }
      const value = { providers: groups, default: ctx.get('agentDefaultModel')?.currentSelection?.() }
      modelCache = { at: now, value }
      return value
    },
    async ingest({ agent, text, urls, provider, model, signal }) {
      const name = typeof agent === 'string' ? agent.trim() : ''
      if (name === '') throw Object.assign(new Error('缺少 agent'), { code: 'BAD_REQUEST' })
      const parts = []
      if (typeof text === 'string' && text.trim() !== '') parts.push(text.trim().slice(0, 120000))
      const list = Array.isArray(urls) ? urls.filter((item) => typeof item === 'string' && item.trim() !== '').slice(0, 8) : []
      for (const url of list) {
        parts.push(`【来源：${url}】\n${await fetchPage(ctx, url, signal)}`)
      }
      if (parts.length === 0) throw Object.assign(new Error('给点材料：粘贴文字、拖入 MD 内容，或填网址'), { code: 'GENERATE_INVALID' })
      const selection = typeof provider === 'string' && typeof model === 'string'
        ? { provider, model }
        : ctx.get('agentDefaultModel')?.currentSelection?.()
      if (selection?.provider === undefined || selection?.model === undefined) {
        throw Object.assign(new Error('没有可用模型，请先在设置里选默认模型'), { code: 'GENERATE_INVALID' })
      }
      let output = ''
      try {
        const stream = ctx.llm.stream({
          provider: selection.provider,
          model: selection.model,
          system: INGEST_SYSTEM,
          messages: [{ role: 'user', content: [{ type: 'text', text: parts.join('\n\n---\n\n').slice(0, 200000) }] }],
        })
        for await (const chunk of stream) {
          if (chunk?.type === 'text-delta') output += chunk.text
          if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') throw new Error('model failed')
        }
      } catch {
        throw Object.assign(new Error('整理失败：请检查默认模型是否可用'), { code: 'GENERATE_INVALID' })
      }
      const cards = parseCards(output)
      const saved = []
      for (const card of cards) {
        await saveCard(name, card)
        saved.push(card.card)
      }
      await serial(async () => {
        const entry = registeredPresets.get(name)
        if (entry !== undefined) {
          await entry.unregister().catch(() => {})
          registeredPresets.delete(name)
          presetIndex.delete(entry.id)
        }
      })
      return { agent: name, saved }
    },
    async generate({ need, answers, provider, model }) {
      const text = typeof need === 'string' ? need.trim() : ''
      if (text === '') throw Object.assign(new Error('先描述一下你想要的智能体'), { code: 'GENERATE_INVALID' })
      const selection = typeof provider === 'string' && typeof model === 'string'
        ? { provider, model }
        : ctx.get('agentDefaultModel')?.currentSelection?.()
      if (selection?.provider === undefined || selection?.model === undefined) {
        throw Object.assign(new Error('没有可用模型，请先在设置里选择默认模型'), { code: 'GENERATE_INVALID' })
      }
      const userText = typeof answers === 'string' && answers.trim() !== '' ? `${text}\n\n补充说明：${answers.trim()}` : text
      let output = ''
      try {
        const stream = ctx.llm.stream({
          provider: selection.provider,
          model: selection.model,
          system: GEN_SYSTEM,
          messages: [{ role: 'user', content: [{ type: 'text', text: userText }] }],
        })
        for await (const chunk of stream) {
          if (chunk?.type === 'text-delta') output += chunk.text
          if (chunk?.type === 'finish' && chunk.reason?.kind === 'error') {
            throw new Error('model call failed')
          }
        }
      } catch {
        throw Object.assign(new Error('生成失败：请检查默认模型是否可用，或稍后重试'), { code: 'GENERATE_INVALID' })
      }
      return normalizeSuggestion(extractJson(output))
    },
    /** 列出领域模板包（内置 + 用户）。 */
    async templates() {
      try {
        return { templates: await listTemplates() }
      } catch {
        return { templates: [] }
      }
    },
    /** 把一份智能体定义存成用户模板包。 */
    async saveAsTemplate({ definition, id, label, description }) {
      if (definition === null || typeof definition !== 'object') {
        throw Object.assign(new Error('缺少 definition'), { code: 'BAD_REQUEST' })
      }
      const template = templateFromDefinition(definition, { id, label, description })
      if (template === undefined) {
        throw Object.assign(new Error('生成模板失败：id 需为小写字母/数字/连字符'), { code: 'BAD_TEMPLATE' })
      }
      const saved = await saveTemplate(template)
      return { id: saved.template.id, path: saved.path }
    },
    /** 用智能体预设新建会话：Host 侧创建，预设与创建在同一进程，不会出现 id 失配后静默回落。 */
    async openSession({ name, workspaceId, cwd }) {
      const agentName = typeof name === 'string' ? name.trim() : ''
      if (agentName === '') throw Object.assign(new Error('缺少智能体名'), { code: 'BAD_REQUEST' })
      // 与面板列表使用同一份项目定义和信任策略；workspaceId 只是会话归属。
      const loaded = await loadAgents({ userDir: defaultUserDir(), cwd })
      const definition = loaded.definitions.find((item) => item.name === agentName && item.enabledEffective)
      if (definition === undefined) throw Object.assign(new Error(`没有可用的智能体「${agentName}」`), { code: 'AGENT_NOT_FOUND' })
      if (definition.mode === 'llm') throw Object.assign(new Error('llm 模式的智能体不能开会话'), { code: 'BAD_REQUEST' })
      const presetId = await serial(() => ensurePresetInner(ctx, definition))
      const controller = ctx.get('sessionController')
      if (controller === undefined || typeof controller.create !== 'function') {
        throw Object.assign(new Error('当前版本缺少 sessionController，无法在 Host 侧开会话'), { code: 'UNSUPPORTED' })
      }
      const created = await controller.create({
        ...(typeof workspaceId === 'string' && workspaceId !== ''
          ? { workspaceId }
          // DSH 的 SessionCreateRequest 里 cwd 与 workspaceId 互斥：没有显式
          // workspace 时才用项目路径，保证项目级智能体在正确的目录下开会话。
          : cwd !== undefined ? { cwd } : {}),
        agentPreset: presetId,
      })
      const applied = created?.agentPreset
      if (applied !== presetId) {
        throw Object.assign(new Error(`会话已创建但预设未生效（期望 ${presetId}，实际 ${applied ?? '默认'}）`), { code: 'PRESET_NOT_APPLIED' })
      }
      return { sessionId: created.sessionId, agentPreset: applied }
    },
    async list(cwd) {
      const loaded = await loadAgents({ userDir: defaultUserDir(), cwd })
      let counts = {}
      try {
        counts = await knowledgeCounts()
      } catch {
        counts = {}
      }
      // 列表是只读快照，不能为了展示而逐个读取知识库并注册预设。
      // 真正启动时 openSession/runAgent 会懒注册并返回真实 presetId。
      const rows = loaded.definitions.map((definition) => ({
          name: definition.name,
          title: definition.title,
          description: definition.description,
          prompt: definition.prompt,
          mode: definition.mode,
          tools: definition.tools,
          model: definition.model,
          provider: definition.provider,
          reasoning_effort: definition.reasoning_effort,
          enabled: definition.enabled,
          askFirst: definition.askFirst === true,
          criteria: typeof definition.criteria === 'string' ? definition.criteria : '',
          selfCheck: definition.selfCheck === true,
          style: typeof definition.style === 'string' ? definition.style : '',
          avatar: typeof definition.avatar === 'string' ? definition.avatar : '',
          enabledEffective: definition.enabledEffective,
          scope: definition.scope,
          // 文件修改时间：客户端保存时带回来，Host 据此判断「别人改过没有」。
          mtimeMs: typeof definition.mtimeMs === 'number' ? definition.mtimeMs : undefined,
          presetId: registeredPresets.get(definition.name)?.id ?? null,
          knowledgeCount: counts[definition.name] ?? 0,
        }))
      return {
        definitions: rows,
        policy: loaded.policy,
        errors: loaded.errors,
        platform: currentPlatform(),
      }
    },
    async save(cwd, { definition, scope, previousScope, templateId, expectedMtime }) {
      const targetDir = scope === 'project' ? projectDirFor(cwd) : defaultUserDir()
      let oldDir
      // 先解析旧目录：缺项目路径时要在写文件之前失败，避免留下两份同名定义。
      if (previousScope !== undefined && previousScope !== scope) {
        const candidate = previousScope === 'project' ? projectDirFor(cwd) : defaultUserDir()
        if (candidate !== targetDir) oldDir = candidate
      }
      const saved = await saveDefinition(targetDir, definition, { expectedMtime })
      let movedFrom
      if (oldDir !== undefined) {
        await deleteDefinition(oldDir, definition.name)
        movedFrom = previousScope
      }
      // 从模板包新建：铺种子知识卡（已有同名卡不覆盖），并记录衍生来源。
      let seeds = []
      let templateInfo
      if (typeof templateId === 'string' && templateId !== '') {
        try {
          const all = await listTemplates()
          templateInfo = all.find((item) => item.id === templateId)
        } catch {
          templateInfo = undefined
        }
        if (templateInfo !== undefined) {
          try {
            seeds = await seedKnowledge(templateInfo.id, definition.name, knowledgeDirFor(definition.name))
          } catch {
            seeds = []
          }
          try {
            await recordDerivation({
              agent: definition.name,
              templateId: templateInfo.id,
              version: templateInfo.version,
              cardCount: seeds.length,
            })
          } catch {
            /* 记录失败不影响保存 */
          }
        }
      }
      await api.reload(cwd)
      return {
        ...saved,
        movedFrom,
        ...(templateInfo === undefined ? {} : { template: { id: templateInfo.id, version: templateInfo.version } }),
        seededCards: seeds,
      }
    },
    async remove(cwd, { name, scope }) {
      const dir = scope === 'project' ? projectDirFor(cwd) : defaultUserDir()
      const result = await deleteDefinition(dir, name)
      // 只有两层都不存在同名定义时，才连知识一起删，避免误删另一层的知识。
      const still = await loadAgents({ userDir: defaultUserDir(), cwd })
      if (!still.definitions.some((item) => item.name === name)) {
        await deleteAllCards(name).catch(() => {})
      }
      await api.reload(cwd)
      return result
    },
    async knowledge({ agent }) {
      if (typeof agent !== 'string' || agent === '') throw Object.assign(new Error('缺少 agent'), { code: 'BAD_REQUEST' })
      const cards = await listCards(agent)
      return { agent, cards }
    },
    async readKnowledge({ agent, card }) {
      return readCard(agent, card)
    },
    async saveKnowledge({ agent, card, name, description, body }) {
      const saved = await saveCard(agent, { card, name, description, body })
      // 知识变了要重新注册预设，新目录才会被挂上
      await serial(async () => {
        const entry = registeredPresets.get(agent)
        if (entry !== undefined) {
          await entry.unregister().catch(() => {})
          registeredPresets.delete(agent)
        }
      })
      return saved
    },
    async removeKnowledge({ agent, card }) {
      const result = await deleteCard(agent, card)
      await serial(async () => {
        const entry = registeredPresets.get(agent)
        if (entry !== undefined) {
          await entry.unregister().catch(() => {})
          registeredPresets.delete(agent)
        }
      })
      return result
    },
    async styles() {
      return { styles: await listStyles() }
    },
    async readStyle({ style }) {
      return readStyle(style)
    },
    async saveStyleValue(input) {
      return saveStyle(input)
    },
    async removeStyle({ style }) {
      return deleteStyle(style)
    },
    async installStyles() {
      return installBuiltinStyles()
    },
    async setPolicy(cwd, patch) {
      // updatePolicy 在读-改-写同一把锁内合并，避免并发 toggle 互相覆盖信任位。
      const result = await updatePolicy(cwd, patch)
      await api.reload(cwd)
      return result
    },
  }

  ctx.effect(
    () => () => {
      for (const dispose of agentDisposers.values()) {
        try {
          dispose?.()
        } catch {
          /* 忽略 */
        }
      }
      agentDisposers.clear()
      const pending = [...registeredPresets.values()].map((entry) => entry.unregister().catch(() => {}))
      registeredPresets.clear()
      presetIndex.clear()
      projectCaches.clear()
      return Promise.all(pending)
    },
    'agent-manager.teardown',
  )

  ctx.inject(['webServer'], (webCtx) => {
    registerRoutes(webCtx, api, () => allowedRoots(ctx))
  })

  // 交互 3：/agent 命令——在当前会话召唤智能体，过程与产出汇入本会话。
  // /expert 保留为别名：老用户的肌肉记忆不该因为改名失效。
  ctx.inject(['commands'], () => {
    ctx.effect(() => ctx.commands.register(createAgentCommand(ctx, api, 'agent')), 'agent-manager.agent-command')
    ctx.effect(() => ctx.commands.register(createAgentCommand(ctx, api, 'expert')), 'agent-manager.expert-alias')
  })

  return api
}

export { normalizeDefinition, isManagedPresetId }
