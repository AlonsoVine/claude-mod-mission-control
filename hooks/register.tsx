import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

import type { Board, Node, Usage } from '../types'

const PANE = 'mission-control'
const TITLE = 'Mission control'
const MAX = 12
const MAX_DOTS = 24
const COLORS = [
  '#22d3ee',
  '#c084fc',
  '#fb923c',
  '#f472b6',
  '#a3e635',
  '#facc15',
  '#60a5fa',
  '#2dd4bf',
]
const STATUS = { run: '#58a6ff', done: '#3fb950', err: '#f85149' } as const
const WORD = { run: 'en curso', done: 'terminado', err: 'error' } as const
// Lo único que el mod añade al contexto de un modelo: una línea por subagente.
const ASK =
  '\n\nProgreso: empieza tu primer mensaje con [0/N] (N = tareas concretas que prevés, una por unidad de trabajo) y escribe [k/N] al completar cada una.'
const MARK = /\[(\d{1,3})\/(\d{1,3})\]/g

const board = atom(
  { plugin: 'mission-control', key: 'board' } as const,
  { nodes: [], main: { model: '', ctx: 0, out: 0 }, isStale: false } as Board,
  { shape: 'board-2' },
)

const cut = (text: string, max: number): string => {
  const line = text.trim().split('\n')[0]?.replace(/\s+/g, ' ') ?? ''

  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

const esc = (text: string): string =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const short = (model: string): string =>
  model.replace(/^claude-/, '').replace(/-\d{8}$/, '')

const kilo = (tokens: number): string =>
  tokens < 1000
    ? String(tokens)
    : tokens < 10000
      ? `${(tokens / 1000).toFixed(1)}k`
      : `${Math.round(tokens / 1000)}k`

const cost = (usage: Usage): string =>
  [
    usage.model,
    usage.ctx > 0 ? `${kilo(usage.ctx)} ctx` : '',
    usage.out > 0 ? `${kilo(usage.out)} sal` : '',
  ]
    .filter(part => part !== '')
    .join(' · ')

/** Una herramienta pedida, como una línea: `Bash: npm test`, `Read: auth.ts`. */
const activity = (name: string, input: unknown): string => {
  const args = (input ?? {}) as Record<string, unknown>
  const path = args.file_path ?? args.path ?? args.notebook_path
  const detail =
    typeof path === 'string'
      ? (path.split(/[\\/]/).pop() ?? '')
      : [args.command, args.pattern, args.query, args.url, args.description]
          .find(value => typeof value === 'string') ?? ''

  return cut(`${name.replace(/^mcp__.*__/, '')}${detail ? `: ${detail}` : ''}`, 30)
}

const fraction = (node: Node): number | undefined => {
  if (node.status === 'done') return 1
  if (node.total <= 0) return undefined

  return Math.min(1, node.done / node.total)
}

const figure = (node: Node): string => {
  const value = fraction(node)
  if (value === undefined) return node.status === 'err' ? 'error' : '···'
  const steps =
    node.total > 0
      ? `${node.status === 'done' ? node.total : node.done}/${node.total} · `
      : ''

  return `${steps}${Math.round(value * 100)}%`
}

const patch = (id: string, change: (node: Node) => Node) => (now: Board) => ({
  ...now,
  nodes: now.nodes.map(node => (node.id === id ? change(node) : node)),
})

/** El progreso de una tarjeta: un punto por tarea, o una barra. */
const meter = (node: Node, x: number, y: number, w: number, color: string) => {
  const value = fraction(node)
  if (value === undefined) {
    const fill = node.status === 'err' ? STATUS.err : color

    return (
      `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2.5" fill="#30363d"/>` +
      `<rect x="${x}" y="${y}" width="${w * 0.3}" height="5" rx="2.5" fill="${fill}">` +
      (node.status === 'run'
        ? `<animate attributeName="x" values="${x};${x + w * 0.7};${x}" dur="1.8s" repeatCount="indefinite"/>`
        : '') +
      '</rect>'
    )
  }
  if (node.total < 1 || node.total > MAX_DOTS) {
    return (
      `<rect x="${x}" y="${y}" width="${w}" height="5" rx="2.5" fill="#30363d"/>` +
      `<rect x="${x}" y="${y}" width="${w * value}" height="5" rx="2.5" fill="${color}"/>`
    )
  }
  const filled = node.status === 'done' ? node.total : node.done
  const gap = Math.min(14, w / node.total)
  const dots: string[] = []
  for (let i = 0; i < node.total; i++) {
    const cx = x + 4 + i * gap
    const isNow = i === filled && node.status === 'run'
    dots.push(
      `<circle cx="${cx}" cy="${y + 2.5}" r="3.5" fill="${i < filled ? color : '#30363d'}"${isNow ? ` stroke="${color}"` : ''}>` +
        (isNow
          ? `<animate attributeName="stroke-opacity" values="1;.2;1" dur="1.4s" repeatCount="indefinite"/>`
          : '') +
        '</circle>',
    )
  }

  return dots.join('')
}

const draw = ({ nodes, main }: Board): { source: string; height: number } => {
  const n = nodes.length
  const W = 340
  const H = 74
  const GAP = 10
  const FOOT = 78
  const TOP = FOOT + 14 + n * 4
  const X = 14 + n * 6
  const CW = W - X - 10
  const height = TOP + n * (H + GAP) + 4
  const running = nodes.filter(node => node.status === 'run').length
  const spent = nodes.reduce((sum, node) => sum + node.ctx + node.out, 0)
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" font-family="ui-sans-serif,system-ui,sans-serif">`,
    `<rect width="${W}" height="${height}" rx="10" fill="#0d1117"/>`,
  ]
  nodes.forEach((node, i) => {
    const color = COLORS[node.color % COLORS.length] ?? '#22d3ee'
    const y = TOP + i * (H + GAP)
    const sx = 70 + ((n - i) * 200) / (n + 1)
    const lane = FOOT + 6 + (n - 1 - i) * 4
    const tx = 8 + (n - 1 - i) * 6
    const pulse =
      node.status === 'run'
        ? `<animate attributeName="opacity" values="1;.3;1" dur="1.4s" repeatCount="indefinite"/>`
        : ''
    out.push(
      `<path d="M${sx},${FOOT} V${lane} H${tx} V${y + H / 2} H${X}" fill="none" stroke="${color}" stroke-width="1.5" stroke-dasharray="5 4"/>`,
      `<rect x="${X}" y="${y}" width="${CW}" height="${H}" rx="8" fill="#161b22" stroke="${color}" stroke-opacity=".45"/>`,
      `<circle cx="${X + 13}" cy="${y + 15}" r="4" fill="${STATUS[node.status]}">${pulse}</circle>`,
      `<text x="${X + 24}" y="${y + 19}" font-size="12" font-weight="600" fill="#e6edf3">${esc(node.name)}</text>`,
      `<text x="${X + CW - 10}" y="${y + 19}" font-size="11" text-anchor="end" fill="${color}">${figure(node)}</text>`,
      `<text x="${X + 10}" y="${y + 34}" font-size="10.5" fill="#8b949e">${esc(node.task)}</text>`,
      `<text x="${X + 10}" y="${y + 49}" font-size="10" fill="${color}" fill-opacity=".85">${esc(node.status === 'run' ? `▸ ${node.act || 'pensando'}` : WORD[node.status])}</text>`,
      `<text x="${X + CW - 10}" y="${y + 49}" font-size="9.5" text-anchor="end" fill="#8b949e">${esc(cost(node))}</text>`,
      meter(node, X + 10, y + 59, CW - 20, color),
    )
  })
  // La barra global: una franja por subagente, ancha según sus tareas
  // (una sola si no las declaró), que se llena con su color.
  const BX = 62
  const BW = 216
  const weights = nodes.map(node => Math.max(1, node.total))
  const whole = weights.reduce((sum, weight) => sum + weight, 0) || 1
  let at = 0
  let reached = 0
  nodes.forEach((node, i) => {
    const color = COLORS[node.color % COLORS.length] ?? '#22d3ee'
    const weight = weights[i] ?? 1
    const x = BX + (at / whole) * BW
    const w = Math.max(1, (weight / whole) * BW - 1.5)
    const value = fraction(node) ?? 0
    at += weight
    reached += weight * value
    out.push(
      `<rect x="${x}" y="64" width="${w}" height="6" rx="2" fill="${color}" fill-opacity=".2"/>`,
      `<rect x="${x}" y="64" width="${w * value}" height="6" rx="2" fill="${color}"/>`,
    )
  })
  const overall = Math.round((reached / whole) * 100)
  out.push(
    `<rect x="50" y="8" width="240" height="${FOOT - 8}" rx="8" fill="none" stroke="#8b949e"/>`,
    `<text x="170" y="25" font-size="12" font-weight="600" text-anchor="middle" fill="#e6edf3">Agente principal</text>`,
    `<text x="170" y="39" font-size="10" text-anchor="middle" fill="#8b949e">${esc(cost(main) || 'modelo aún sin datos')}</text>`,
    `<text x="170" y="53" font-size="10" text-anchor="middle" fill="#8b949e">${overall}% · ${running} en curso · ${n - running} acabados · subagentes ${kilo(spent)}</text>`,
    '</svg>',
  )

  return { source: out.join(''), height }
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'mission-control',
      description: 'Abre el panel de subagentes',
    })

    return next(e)
  })

  on('command.run', { command: 'mission-control' }, async $ => {
    await $.ui.open({ id: PANE, title: TITLE })

    return { text: 'Mission control abierto.' }
  })

  // Un encargo nuevo de la persona: el tablero anterior se queda a la vista
  // hasta que ese encargo lance su primer subagente.
  on('prompt.submit', async ($, e, next) => {
    if (!e.isMeta && !e.command) {
      await update($, board, now => ({ ...now, isStale: true }))
    }

    return next(e)
  }).catch(($, e, next) => next(e))

  on('agent.spawn', async ($, e, next) => {
    const temp = e.tool_use_id || `fork-${Date.now()}`
    await update($, board, now => {
      const kept = now.isStale ? [] : now.nodes
      const node: Node = {
        id: temp,
        name: cut(e.description || e.subagentType, 22),
        task: cut(e.prompt, 50),
        status: 'run',
        done: 0,
        total: 0,
        color: kept.length === 0 ? 0 : (kept[kept.length - 1]?.color ?? 0) + 1,
        act: '',
        model: '',
        ctx: 0,
        out: 0,
      }

      return { ...now, nodes: [...kept, node].slice(-MAX), isStale: false }
    })
    void $.ui.open({ id: PANE, title: TITLE })
    const started = await next({ ...e, prompt: e.prompt + ASK })
    await update(
      $,
      board,
      patch(temp, node =>
        started.deny !== undefined
          ? { ...node, status: 'err' }
          : {
              ...node,
              id: started.agentId ?? temp,
              model: short(started.model),
            },
      ),
    )

    return started
  }).catch(($, e, next) => next(e))

  on('turn.step', async function* ($, e, next) {
    const response = yield* next(e)
    const used = response.usage
    const meter = (was: Usage): Usage =>
      used === null
        ? was
        : {
            model: short(used.model),
            ctx:
              used.input_tokens +
              used.cache_read_input_tokens +
              used.cache_creation_input_tokens,
            out: was.out + used.output_tokens,
          }
    const id = e.agentId
    if (id === undefined) {
      // El principal: solo si hay tablero que alguien mire.
      await update($, board, now =>
        now.nodes.length === 0 || used === null
          ? now
          : { ...now, main: meter(now.main) },
      )

      return response
    }
    const marks = [...response.answer.matchAll(MARK)]
    const last = marks[marks.length - 1]
    const use = response.toolUses[response.toolUses.length - 1]
    await update(
      $,
      board,
      patch(id, node => {
        const total = last === undefined ? node.total : Number(last[2])
        const done =
          last === undefined ? node.done : Math.min(Number(last[1]), total)

        return {
          ...node,
          ...meter(node),
          done,
          total,
          act: use === undefined ? '' : activity(use.name, use.input),
        }
      }),
    )

    return response
  })

  on('turn.complete', async ($, e, next) => {
    const id = e.agentId
    if (id !== undefined) {
      const status = e.reason === 'answer' ? 'done' : 'err'
      await update(
        $,
        board,
        patch(id, node => ({ ...node, status, act: '' })),
      )
    }

    return next(e)
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const now = await read($, board)
    const { nodes } = now
    if (e.surface === 'terminal') {
      const { Box, Text, Progress } = $.ui.resolve(e)

      return (
        <Box flexDirection="column">
          <Text bold>
            Agente principal <Text dimColor>{cost(now.main)}</Text>
          </Text>
          {nodes.length === 0 && <Text dimColor>Sin subagentes todavía.</Text>}
          {nodes.map(node => (
            <Box flexDirection="column">
              <Text color={COLORS[node.color % COLORS.length]}>
                ┆ {node.name}{' '}
                <Text dimColor>
                  ({WORD[node.status]}) {cost(node)}
                </Text>
              </Text>
              <Text dimColor>
                ┆ {node.status === 'run' && node.act ? node.act : node.task}
              </Text>
              <Progress
                label={node.name}
                value={fraction(node)}
                valueText={figure(node)}
                color={COLORS[node.color % COLORS.length]}
              />
            </Box>
          ))}
        </Box>
      )
    }
    const { Box, Text, Svg } = $.ui.resolve(e)
    if (nodes.length === 0) {
      return (
        <Box>
          <Text dimColor>Sin subagentes todavía.</Text>
        </Box>
      )
    }
    const { source, height } = draw(now)
    const alt = nodes
      .map(node => `${node.name}: ${WORD[node.status]} ${figure(node)}`)
      .join('; ')

    return (
      <Box>
        <Svg source={source} alt={alt} width={340} height={height} isInteractive />
      </Box>
    )
  })
}
