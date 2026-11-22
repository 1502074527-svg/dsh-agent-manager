/**
 * 工具目录：把 standard 预设的组合拆成「可勾选的工具组」。
 * 与 DSH 0.2.1-rc.2 的 presets/standard.patch.yml 逐行对齐；
 * 缺 plan 组会让父会话在 plan mode 时通过委派绕过计划语义，因此必须保留。
 */
const POSIX = 'posix'
const WIN32 = 'win32'

/** standard 预设里的 plan mode 段落，逐字复制以免行为漂移。 */
const PLAN_SECTION = `You are in plan mode. Stay in plan mode until the user approves your plan through exit_plan_mode or switches the session mode. Imperative language to implement changes means plan the implementation, not execute it. A user's conversational agreement — including an answer confirming something you asked — approves nothing and does not end plan mode; fold the confirmed decision into the plan and submit it through exit_plan_mode.

Explore first. Use non-mutating reads, searches, static analysis, and checks to ground the plan in the actual repository. Do not edit or write files, change configuration, run formatters or code generation that rewrites tracked files, commit, or otherwise carry out the plan. Prefer existing functions and patterns over new machinery.

The tool catalog stays the same across modes for request-cache stability. These plan-mode rules override any later tool description or guidance that suggests using mutation tools; those tools remain listed to keep the tool catalog unchanged. Do not use todo_write to track this planning phase: it tracks implementation after an approved plan, while the plan itself belongs in exit_plan_mode.

Resolve discoverable facts by inspection. Use ask_user_question only for user-owned choices or material ambiguity that inspection cannot answer. Do not ask the user where code lives or how current behavior works when you can find out.

Make the plan decision-complete: state the goal and success criteria; group implementation changes by subsystem; identify public API, schema, and data-flow changes; cover edge cases, failure modes, tests, acceptance criteria, and explicit assumptions. Keep it concise enough to review but detailed enough that another engineer can implement it without making design decisions.

When ready, call exit_plan_mode with the complete plan markdown, starting with a # title. Make exit_plan_mode the only and final tool call in that assistant response: it presents the plan for approval, and implementation begins only in a later step after approval. Do not paste the final plan as a plain reply or ask "should I proceed?" through prose or ask_user_question. If review rejects it, incorporate the feedback and present again. If the review channel is unavailable or aborted, stay in plan mode and ask the user to switch modes manually; do not proceed with implementation.`

export const TOOL_GROUPS = [
  { id: 'fs', label: '文件读写', description: 'read / write / edit / read_image', defaultOn: true, rows: [{ name: '@deepseek-ai/dsh-tool-fs', config: {} }] },
  { id: 'search', label: '文件搜索', description: 'glob / grep', defaultOn: true, rows: [{ name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } }] },
  { id: 'bash', label: '终端（Bash）', description: '非 Windows', platform: POSIX, rows: [{ name: '@deepseek-ai/dsh-tool-bash', config: {} }] },
  { id: 'pwsh', label: '终端（PowerShell）', description: '仅 Windows', platform: WIN32, rows: [{ name: '@deepseek-ai/dsh-tool-pwsh', config: {} }] },
  { id: 'jobs', label: '后台任务', description: 'job_output / job_list / job_kill', rows: [{ name: '@deepseek-ai/dsh-tool-jobs' }] },
  { id: 'web', label: '联网', description: 'web_search / web_fetch', rows: [{ name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } }] },
  {
    id: 'skill',
    label: '技能与知识库',
    description: '加载 Skill / 专业知识卡（勾选后该智能体的知识目录会挂进来）',
    rows: [
      // customSkillDirs 由 buildPreset 按智能体注入；这里给默认空配置，保证独立使用时可用。
      { id: 'skill-fs', name: '@deepseek-ai/dsh-skill-filesystem', config: { customSkillDirs: [] } },
      { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    ],
  },
  { id: 'todo', label: '任务清单', description: 'todo_write', rows: [{ name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: true } }] },
  { id: 'ask', label: '向用户提问', description: 'ask_user_question', rows: [{ name: '@deepseek-ai/dsh-tool-ask-user' }] },
  { id: 'present', label: '交付文件', description: 'present', rows: [{ name: '@deepseek-ai/dsh-tool-present' }] },
  { id: 'schedule', label: '定时提醒', description: 'schedule_*', rows: [{ name: '@deepseek-ai/dsh-tool-schedule' }] },
  { id: 'goal', label: '目标', description: '/goal 与目标工具', rows: [{ name: '@deepseek-ai/dsh-command-goal' }, { name: '@deepseek-ai/dsh-tool-goal' }] },
  {
    id: 'plan',
    label: '计划模式',
    description: 'plan mode / exit_plan_mode',
    rows: [
      {
        name: 'cordis:group',
        group: true,
        isolate: { planMode: true },
        config: [{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode', config: { section: PLAN_SECTION } }],
      },
    ],
  },
  {
    id: 'subagent',
    label: '子智能体委派',
    hidden: true,
    description: 'subagent / subagent_fork / workflow',
    rows: [
      {
        name: 'cordis:group',
        group: true,
        isolate: { workflowEngine: true },
        config: [
          { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
          { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' },
          { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'spawn', toolName: 'subagent', modelSelectionSettings: true } },
          { id: 'tool-subagent-fork', name: '@deepseek-ai/dsh-tool-subagent', config: { provider: 'fork', toolName: 'subagent_fork' } },
          { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc', config: { provider: 'spawn' } },
          { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow' },
        ],
      },
    ],
  },
]

export const ALWAYS_ROWS = [
  { name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
  { name: '@deepseek-ai/dsh-time-context' },
  {
    name: 'cordis:group',
    group: true,
    isolate: { compaction: true, toolResultPruner: true },
    config: [
      { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
      { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
      { id: 'tool-result-pruner', name: '@deepseek-ai/dsh-compaction-tool-result-pruner', config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 } },
    ],
  },
  { name: '@deepseek-ai/dsh-plugin-manager/tools', disabled: true },
  { name: '@deepseek-ai/dsh-plugin-market/tools', disabled: true },
]

export const TOOL_GROUP_IDS = TOOL_GROUPS.map((group) => group.id)

export function currentPlatform() {
  return process.platform === 'win32' ? WIN32 : POSIX
}

/** 某组在当前平台是否可用。 */
export function groupAvailable(group, platform = currentPlatform()) {
  return group.platform === undefined || group.platform === platform
}

export function rowsFor(groupIds, platform = currentPlatform()) {
  const wanted = new Set(groupIds)
  const rows = []
  const seen = new Set()
  for (const group of TOOL_GROUPS) {
    if (!wanted.has(group.id) || !groupAvailable(group, platform)) continue
    for (const row of group.rows) {
      const key = row.id ?? `${row.name}#${JSON.stringify(row.config ?? null)}`
      if (seen.has(key)) continue
      seen.add(key)
      rows.push(structuredClone(row))
    }
  }
  return rows
}
