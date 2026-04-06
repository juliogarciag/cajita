import { useState, useCallback } from 'react'
import { Plus, Pencil, Trash2, Copy, AlertTriangle } from 'lucide-react'
import type { ProjectionScenario } from '#/lib/projection-scenarios-collection.js'
import type { RecurringMovementTemplate } from '#/lib/recurring-movement-templates-collection.js'
import { SCRIPTS, findScript } from '#/lib/projection-scripts/index.js'
import type { InputDef } from '#/lib/projection-scripts/types.js'
import {
  createProjectionScenario,
  updateProjectionScenario,
  toggleProjectionScenario,
  deleteProjectionScenario,
} from '#/server/projection-scenarios.js'
import { DateInput } from './DateInput.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RawInputValues = Record<string, unknown>

/**
 * ElectricSQL delivers jsonb columns as already-parsed JS objects, not strings.
 * TanStack DB doesn't apply Zod transforms at runtime, so we normalize here.
 */
function parseInputsJson(value: unknown): RawInputValues {
  if (typeof value === 'object' && value !== null) return value as RawInputValues
  return JSON.parse(value as string) as RawInputValues
}

interface ScenariosPanelProps {
  scenarios: ProjectionScenario[]
  templates: RecurringMovementTemplate[]
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate parsed inputs_json against the script's declared inputs.
 * Returns null if valid, or an error message string if not.
 */
function validateInputs(
  scriptId: string,
  raw: RawInputValues,
  templates: RecurringMovementTemplate[],
): string | null {
  const script = findScript(scriptId)
  if (!script) return `Script '${scriptId}' no longer exists`

  for (const [key, def] of Object.entries(script.inputs as Record<string, InputDef>)) {
    const value = raw[key]
    if (def.optional && value == null) continue
    if (!def.optional && value == null) return `Missing required input '${def.label}'`

    if (def.kind === 'template') {
      const { templateId } = value as { templateId: string }
      const found = templates.find((t) => t.id === templateId)
      if (!found) return `'${def.label}' not found — please re-select`
    }
  }

  return null
}

// ---------------------------------------------------------------------------
// ScenarioModal — add / edit
// ---------------------------------------------------------------------------

interface ScenarioModalProps {
  mode: 'add' | 'edit'
  scenario?: ProjectionScenario
  templates: RecurringMovementTemplate[]
  onClose: () => void
  onSaved: () => void
}

function ScenarioModal({ mode, scenario, templates, onClose, onSaved }: ScenarioModalProps) {
  const initialScriptId = scenario?.script_id ?? SCRIPTS[0]?.id ?? ''
  const initialInputs: RawInputValues = scenario ? parseInputsJson(scenario.inputs_json) : {}
  const initialName = scenario?.name ?? ''

  const [selectedScriptId, setSelectedScriptId] = useState(initialScriptId)
  const [inputValues, setInputValues] = useState<RawInputValues>(initialInputs)
  const [name, setName] = useState(initialName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const script = findScript(selectedScriptId)
  const scriptInputs = script ? (script.inputs as Record<string, InputDef>) : {}

  const handleScriptChange = useCallback((newScriptId: string) => {
    setSelectedScriptId(newScriptId)
    setInputValues({}) // reset inputs on script change
  }, [])

  const setInputValue = useCallback((key: string, value: unknown) => {
    setInputValues((prev) => ({ ...prev, [key]: value }))
  }, [])

  const handleSave = useCallback(async () => {
    setError(null)

    if (!name.trim()) {
      setError('Scenario name is required')
      return
    }
    if (!script) {
      setError('Please select a script')
      return
    }

    // Validate required inputs are filled
    for (const [key, def] of Object.entries(scriptInputs)) {
      if (!def.optional && inputValues[key] == null) {
        setError(`'${def.label}' is required`)
        return
      }
    }

    setSaving(true)
    try {
      const inputs_json = JSON.stringify(inputValues)
      if (mode === 'add') {
        await createProjectionScenario({
          data: { name: name.trim(), script_id: selectedScriptId, inputs_json },
        })
      } else if (scenario) {
        await updateProjectionScenario({
          data: { id: scenario.id, name: name.trim(), inputs_json },
        })
      }
      onSaved()
      onClose()
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save scenario'
      // Surface unique constraint violation
      if (msg.includes('unique') || msg.includes('duplicate')) {
        setError('A scenario with this name already exists')
      } else {
        setError(msg)
      }
    } finally {
      setSaving(false)
    }
  }, [name, script, scriptInputs, inputValues, mode, scenario, selectedScriptId, onSaved, onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
      <div className="w-full max-w-md rounded-lg bg-white shadow-xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 px-4 py-3">
          <h3 className="font-semibold text-gray-900">
            {mode === 'add' ? 'Add scenario' : 'Edit scenario'}
          </h3>
          <button
            onClick={onClose}
            className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4 px-4 py-4">
          {/* Script selector — only in add mode */}
          {mode === 'add' && (
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-700">Script</label>
              <select
                value={selectedScriptId}
                onChange={(e) => handleScriptChange(e.target.value)}
                className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
              >
                {SCRIPTS.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Dynamic input fields from script declaration */}
          {Object.entries(scriptInputs).map(([key, def]) => (
            <div key={key}>
              <label className="mb-1 block text-xs font-medium text-gray-700">
                {def.label}
                {def.optional && <span className="ml-1 font-normal text-gray-400">(optional)</span>}
              </label>

              {def.kind === 'template' && (
                <select
                  value={(inputValues[key] as { templateId: string } | undefined)?.templateId ?? ''}
                  onChange={(e) =>
                    setInputValue(key, e.target.value ? { templateId: e.target.value } : undefined)
                  }
                  className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
                >
                  <option value="">— select template —</option>
                  {templates
                    .filter((t) => t.active)
                    .map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.description}
                      </option>
                    ))}
                </select>
              )}

              {def.kind === 'date' && (
                <DateInput
                  value={(inputValues[key] as string | undefined) ?? ''}
                  onChange={(v) => setInputValue(key, v || undefined)}
                  className="w-full"
                />
              )}

              {def.kind === 'amount' && (
                <div className="relative">
                  <span className="pointer-events-none absolute inset-y-0 left-2 flex items-center text-sm text-gray-400">
                    $
                  </span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="0.00"
                    value={
                      inputValues[key] != null
                        ? ((inputValues[key] as number) / 100).toFixed(2)
                        : ''
                    }
                    onChange={(e) => {
                      const v = e.target.value
                      setInputValue(key, v !== '' ? Math.round(parseFloat(v) * 100) : undefined)
                    }}
                    className="w-full rounded border border-gray-300 py-1.5 pl-6 pr-2 text-sm focus:border-gray-500 focus:outline-none"
                  />
                </div>
              )}

              {def.kind === 'percentage' && (
                <div className="relative">
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    max="100"
                    placeholder="0.00"
                    value={inputValues[key] != null ? String(inputValues[key] as number) : ''}
                    onChange={(e) => {
                      const v = e.target.value
                      setInputValue(key, v !== '' ? parseFloat(v) : undefined)
                    }}
                    className="w-full rounded border border-gray-300 py-1.5 pl-2 pr-8 text-sm focus:border-gray-500 focus:outline-none"
                  />
                  <span className="pointer-events-none absolute inset-y-0 right-2 flex items-center text-sm text-gray-400">
                    %
                  </span>
                </div>
              )}
            </div>
          ))}

          {/* Scenario name */}
          <div>
            <label className="mb-1 block text-xs font-medium text-gray-700">Scenario name</label>
            <input
              type="text"
              placeholder="e.g. Pay off mortgage by 2031"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              className="w-full rounded border border-gray-300 px-2 py-1.5 text-sm focus:border-gray-500 focus:outline-none"
            />
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 border-t border-gray-200 px-4 py-3">
          <button
            onClick={onClose}
            className="rounded px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded bg-gray-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ScenarioCard
// ---------------------------------------------------------------------------

interface ScenarioCardProps {
  scenario: ProjectionScenario
  templates: RecurringMovementTemplate[]
  onEdit: () => void
  onDuplicate: () => void
  onDeleted: () => void
  onToggled: () => void
}

function ScenarioCard({
  scenario,
  templates,
  onEdit,
  onDuplicate,
  onDeleted,
  onToggled,
}: ScenarioCardProps) {
  const [deleting, setDeleting] = useState(false)

  const script = findScript(scenario.script_id)

  let parseError: string | null = null
  let raw: RawInputValues = {}
  try {
    raw = parseInputsJson(scenario.inputs_json)
  } catch {
    parseError = 'Inputs data is corrupt'
  }

  const validationError =
    parseError ?? (script ? validateInputs(scenario.script_id, raw, templates) : null)
  const isBroken = !script || validationError !== null

  const handleToggle = useCallback(async () => {
    await toggleProjectionScenario({ data: { id: scenario.id, active: !scenario.active } })
    onToggled()
  }, [scenario.id, scenario.active, onToggled])

  const handleDelete = useCallback(async () => {
    if (!confirm(`Delete "${scenario.name}"?`)) return
    setDeleting(true)
    await deleteProjectionScenario({ data: { id: scenario.id } })
    onDeleted()
    setDeleting(false)
  }, [scenario.id, scenario.name, onDeleted])

  return (
    <div className="flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3">
      {/* Active toggle */}
      <button
        onClick={handleToggle}
        disabled={isBroken}
        title={isBroken ? 'Fix scenario before enabling' : scenario.active ? 'Disable' : 'Enable'}
        className={`mt-0.5 flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
          scenario.active && !isBroken ? 'bg-blue-500' : 'bg-gray-200'
        } ${isBroken ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}
      >
        <span
          className={`ml-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${
            scenario.active && !isBroken ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-gray-900">{scenario.name}</p>
        <p className="text-xs text-gray-400">{script?.name ?? scenario.script_id}</p>
        {isBroken && (
          <p className="mt-1 flex items-center gap-1 text-xs text-amber-600">
            <AlertTriangle size={11} className="shrink-0" />
            {validationError ?? `Script '${scenario.script_id}' no longer exists`}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex shrink-0 items-center gap-1">
        <button
          onClick={onDuplicate}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Duplicate"
        >
          <Copy size={13} />
        </button>
        <button
          onClick={onEdit}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          title="Edit"
        >
          <Pencil size={13} />
        </button>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="rounded p-1 text-gray-400 hover:bg-gray-100 hover:text-red-500 disabled:opacity-50"
          title="Delete"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// ScenariosPanel (main export)
// ---------------------------------------------------------------------------

export function ScenariosPanel({ scenarios, templates }: ScenariosPanelProps) {
  const [addOpen, setAddOpen] = useState(false)
  const [editingScenario, setEditingScenario] = useState<ProjectionScenario | null>(null)
  const [duplicatingScenario, setDuplicatingScenario] = useState<ProjectionScenario | null>(null)
  // Trigger re-render after mutations (ElectricSQL will sync, but we may want
  // a local nudge; in practice the live query re-renders automatically)
  const [, setRefreshKey] = useState(0)
  const refresh = useCallback(() => setRefreshKey((k) => k + 1), [])

  return (
    <div>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-gray-700">What-if scenarios</h2>
        {SCRIPTS.length > 0 && (
          <button
            onClick={() => setAddOpen(true)}
            className="flex items-center gap-1 rounded bg-gray-900 px-2.5 py-1 text-xs font-medium text-white hover:bg-gray-800"
          >
            <Plus size={12} />
            Add scenario
          </button>
        )}
      </div>

      {/* Scenario list */}
      {scenarios.length === 0 ? (
        <p className="text-xs text-gray-400">
          No scenarios yet. Add one to overlay a what-if projection on the chart.
        </p>
      ) : (
        <div className="space-y-2">
          {scenarios.map((scenario) => (
            <ScenarioCard
              key={scenario.id}
              scenario={scenario}
              templates={templates}
              onEdit={() => setEditingScenario(scenario)}
              onDuplicate={() => setDuplicatingScenario(scenario)}
              onDeleted={refresh}
              onToggled={refresh}
            />
          ))}
        </div>
      )}

      {/* Add modal */}
      {addOpen && (
        <ScenarioModal
          mode="add"
          templates={templates}
          onClose={() => setAddOpen(false)}
          onSaved={refresh}
        />
      )}

      {/* Edit modal */}
      {editingScenario && (
        <ScenarioModal
          mode="edit"
          scenario={editingScenario}
          templates={templates}
          onClose={() => setEditingScenario(null)}
          onSaved={refresh}
        />
      )}

      {/* Duplicate modal — add mode pre-populated from source scenario */}
      {duplicatingScenario && (
        <ScenarioModal
          mode="add"
          scenario={{ ...duplicatingScenario, name: `Copy of ${duplicatingScenario.name}` }}
          templates={templates}
          onClose={() => setDuplicatingScenario(null)}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
