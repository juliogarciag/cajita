import { mortgagePayoffScript } from './mortgage-payoff.js'
import type { ScriptDef, InputDef } from './types.js'

export { mortgagePayoffScript }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const SCRIPTS: ScriptDef<any>[] = [mortgagePayoffScript]

/** Look up a script by its stable id */
export function findScript(id: string): ScriptDef<Record<string, InputDef>> | undefined {
  return SCRIPTS.find((s) => s.id === id)
}
