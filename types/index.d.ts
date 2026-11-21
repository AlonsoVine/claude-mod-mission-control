export type Usage = {
  /** El modelo que respondió por última vez, en corto. */
  model: string
  /** El contexto de la última petición (entrada, con caché). */
  ctx: number
  /** Los tokens generados, sumados. */
  out: number
}

export type Node = Usage & {
  /** El id del subagente; hasta que arranca, el de su llamada. */
  id: string
  name: string
  task: string
  status: 'run' | 'done' | 'err'
  /** Pasos completados y declarados; total 0 = no declarados. */
  done: number
  total: number
  color: number
  /** Lo que hace ahora: la última herramienta que pidió. */
  act: string
}

export type Board = {
  nodes: Node[]
  main: Usage
  /** Hubo un encargo nuevo: el próximo subagente empieza un tablero limpio. */
  isStale: boolean
}

declare module 'claude-code' {
  interface PluginState {
    'mission-control': { board: Shaped<Board> }
  }
}
