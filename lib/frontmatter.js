/**
 * 极简 YAML frontmatter 解析/序列化。
 * 支持标量、内联数组、块标量（`key: |`，用于 criteria 这类多行文本）；
 * 拒绝嵌套映射与其它多行形态，避免「看起来解析了其实丢了」。
 */

const FENCE = '---'
const RESERVED = new Set(['true', 'false', 'null', '~'])

function splitKeyValue(line) {
  const index = line.indexOf(':')
  if (index <= 0) return undefined
  const key = line.slice(0, index).trim()
  if (!/^[A-Za-z0-9_-]+$/.test(key)) return undefined
  return { key, raw: line.slice(index + 1).trim() }
}

function unquoteDouble(inner) {
  let out = ''
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index]
    if (char === '\\' && index + 1 < inner.length) {
      const next = inner[index + 1]
      if (next === '\\' || next === '"') {
        out += next
        index += 1
        continue
      }
    }
    out += char
  }
  return out
}

function parseScalar(raw) {
  if (raw === '') return ''
  if (raw === 'true') return true
  if (raw === 'false') return false
  if (raw === 'null' || raw === '~') return null
  if (/^-?\d+$/.test(raw)) return Number(raw)
  if (raw.startsWith('[') && raw.endsWith(']')) {
    const inner = raw.slice(1, -1).trim()
    if (inner === '') return []
    return inner.split(',').map((item) => parseScalar(item.trim()))
  }
  if (raw.startsWith('"') && raw.endsWith('"')) return unquoteDouble(raw.slice(1, -1))
  if (raw.startsWith("'") && raw.endsWith("'")) return raw.slice(1, -1)
  return raw
}

function quote(text) {
  if (!text.includes("'")) return `'${text}'`
  return `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`
}

function formatScalar(value) {
  if (typeof value === 'boolean' || typeof value === 'number') return String(value)
  if (value === null || value === undefined) return 'null'
  if (Array.isArray(value)) return `[${value.map((item) => formatScalar(item)).join(', ')}]`
  const text = String(value)
  if (text === '') return "''"
  if (text.includes('\n') || text.includes('\r')) {
    throw new Error('frontmatter 标量不能包含换行；请把长文本放到正文')
  }
  // 保留字、数字形态、首尾空白、含特殊字符的一律加引号，保证回读类型稳定。
  if (RESERVED.has(text) || /^-?\d+$/.test(text) || text !== text.trim()) return quote(text)
  if (/^[A-Za-z0-9_./-]+$/.test(text)) return text
  return quote(text)
}

export function parseFrontmatter(text) {
  const normalized = String(text).replace(/\r\n/g, '\n')
  if (!normalized.startsWith(`${FENCE}\n`)) {
    return { data: {}, body: normalized.trim() }
  }
  const end = normalized.indexOf(`\n${FENCE}`, FENCE.length + 1)
  if (end < 0) throw new Error('frontmatter 未闭合：缺少结束的 --- 行')
  const header = normalized.slice(FENCE.length + 1, end)
  const body = normalized.slice(end + FENCE.length + 1).replace(/^\n/, '')

  // 块标量：`key: |` 之后的所有缩进行归入该键，直到首个非缩进非空行。
  // 只支持这一种多行形态；其余缩进行仍然是错误（防止嵌套映射被静默丢弃）。
  const lines = header.split('\n')
  const data = {}
  let index = 0
  while (index < lines.length) {
    const line = lines[index]
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) { index += 1; continue }
    if (line.startsWith(' ') || line.startsWith('\t')) {
      throw new Error(`不支持嵌套结构：${line}`)
    }
    const pair = splitKeyValue(line)
    if (pair === undefined) throw new Error(`无法解析的 frontmatter 行：${line}`)
    if (pair.raw === '|') {
      const block = []
      let scan = index + 1
      while (scan < lines.length) {
        const candidate = lines[scan]
        if (candidate.trim() === '') { block.push(''); scan += 1; continue }
        if (!candidate.startsWith(' ') && !candidate.startsWith('\t')) break
        block.push(candidate)
        scan += 1
      }
      if (block.length === 0) throw new Error(`块标量为空：${pair.key}`)
      const indents = block.filter((item) => item !== '').map((item) => item.match(/^[ \t]*/)[0].length)
      const width = Math.min(...indents)
      data[pair.key] = block
        .map((item) => (item === '' ? '' : item.slice(width)))
        .join('\n')
        .replace(/\n+$/, '')
      index = scan
      continue
    }
    data[pair.key] = parseScalar(pair.raw)
    index += 1
  }
  return { data, body: body.trim() }
}

export function stringifyFrontmatter(data, body) {
  const lines = [FENCE]
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue
    if (typeof value === 'string' && (value.includes('\n') || value.includes('\r'))) {
      // 多行文本走块标量：两空格缩进，尾部空行裁掉。
      const block = String(value).replace(/\r\n/g, '\n').replace(/\n+$/, '').split('\n')
      lines.push(`${key}: |`)
      for (const item of block) lines.push(item === '' ? '' : `  ${item}`)
      continue
    }
    lines.push(`${key}: ${formatScalar(value)}`)
  }
  lines.push(FENCE)
  return `${lines.join('\n')}\n${String(body ?? '').trim()}\n`
}
