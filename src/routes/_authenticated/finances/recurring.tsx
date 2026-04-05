import { useState, useEffect, useCallback, useMemo } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useLiveQuery } from '@tanstack/react-db'
import { Plus, Pencil, Trash2, Power, PowerOff, RefreshCw } from 'lucide-react'
import { recurringMovementTemplatesCollection, type RecurringMovementTemplate } from '#/lib/recurring-movement-templates-collection.js'
import { categoriesCollection, type Category } from '#/lib/categories-collection.js'
import { formatCents } from '#/lib/format.js'
import {
  createRecurringTemplate,
  updateRecurringTemplate,
  deactivateRecurringTemplate,
  deleteRecurringTemplate,
} from '#/server/recurring-movements.js'

export const Route = createFileRoute('/_authenticated/finances/recurring')({
  component: RecurringPage,
})

// ---------------------------------------------------------------------------
// Template Form
// ---------------------------------------------------------------------------

interface TemplateFormData {
  description: string
  amount_cents_input: string // dollar string e.g. "-2413.96"
  category_id: string
  day_of_month: string
  start_date: string
  end_date: string
}

const EMPTY_FORM: TemplateFormData = {
  description: '',
  amount_cents_input: '',
  category_id: '',
  day_of_month: '',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
}

function parseDollarsToAmountCents(input: string): number | null {
  const cleaned = input.replace(/[$,\s]/g, '')
  const val = parseFloat(cleaned)
  if (isNaN(val)) return null
  return Math.round(val * 100)
}

interface TemplateFormProps {
  categories: Category[]
  initial?: TemplateFormData
  onSubmit: (data: TemplateFormData) => Promise<void>
  onCancel: () => void
  submitLabel: string
}

function TemplateForm({ categories, initial = EMPTY_FORM, onSubmit, onCancel, submitLabel }: TemplateFormProps) {
  const [form, setForm] = useState<TemplateFormData>(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const set = (field: keyof TemplateFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [field]: e.target.value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!form.description.trim()) return setError('Description is required')
    const cents = parseDollarsToAmountCents(form.amount_cents_input)
    if (cents === null) return setError('Invalid amount')
    const day = parseInt(form.day_of_month)
    if (isNaN(day) || day < 1 || day > 31) return setError('Day of month must be 1–31')
    if (!form.start_date) return setError('Start date is required')
    setSaving(true)
    try {
      await onSubmit(form)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong')
    } finally {
      setSaving(false)
    }
  }

  const inputClass = 'w-full rounded-md border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-500 focus:outline-none'
  const labelClass = 'block text-xs font-medium text-gray-600 mb-1'

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <label className={labelClass}>Description</label>
          <input className={inputClass} value={form.description} onChange={set('description')} placeholder="e.g. Salary" />
        </div>
        <div>
          <label className={labelClass}>Amount (use – for expenses)</label>
          <input className={inputClass} value={form.amount_cents_input} onChange={set('amount_cents_input')} placeholder="e.g. -2413.96" />
        </div>
        <div>
          <label className={labelClass}>Day of month</label>
          <input className={inputClass} value={form.day_of_month} onChange={set('day_of_month')} placeholder="e.g. 2" type="number" min="1" max="31" />
        </div>
        <div>
          <label className={labelClass}>Category (optional)</label>
          <select className={inputClass} value={form.category_id} onChange={set('category_id')}>
            <option value="">— None —</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelClass}>Start date</label>
          <input className={inputClass} type="date" value={form.start_date} onChange={set('start_date')} />
        </div>
        <div>
          <label className={labelClass}>End date (optional)</label>
          <input className={inputClass} type="date" value={form.end_date} onChange={set('end_date')} />
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="rounded-md px-4 py-2 text-sm text-gray-600 hover:bg-gray-100">
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {saving ? 'Saving…' : submitLabel}
        </button>
      </div>
    </form>
  )
}

// ---------------------------------------------------------------------------
// Template Row
// ---------------------------------------------------------------------------

interface TemplateRowProps {
  template: RecurringMovementTemplate
  categoryMap: Map<string, Category>
  onEdit: (t: RecurringMovementTemplate) => void
  onToggle: (t: RecurringMovementTemplate) => void
  onDelete: (t: RecurringMovementTemplate) => void
}

function TemplateRow({ template, categoryMap, onEdit, onToggle, onDelete }: TemplateRowProps) {
  const category = template.category_id ? categoryMap.get(template.category_id) : null
  const isPositive = template.amount_cents > 0

  return (
    <div className={`flex items-center gap-4 rounded-lg border px-4 py-3 ${template.active ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'}`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-900 truncate">{template.description}</span>
          {category && (
            <span
              className="shrink-0 rounded-full px-2 py-0.5 text-xs font-medium text-white"
              style={{ backgroundColor: category.color }}
            >
              {category.name}
            </span>
          )}
          {!template.active && (
            <span className="shrink-0 rounded-full bg-gray-200 px-2 py-0.5 text-xs text-gray-500">Inactive</span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-gray-500">
          Day {template.day_of_month} of each month · from {template.start_date}
          {template.end_date ? ` to ${template.end_date}` : ''}
        </div>
      </div>
      <span className={`shrink-0 text-sm font-semibold tabular-nums ${isPositive ? 'text-green-700' : 'text-red-700'}`}>
        {formatCents(template.amount_cents)}
      </span>
      <div className="flex items-center gap-1 shrink-0">
        <button
          onClick={() => onEdit(template)}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          onClick={() => onToggle(template)}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700"
          title={template.active ? 'Deactivate' : 'Reactivate'}
        >
          {template.active ? <PowerOff size={14} /> : <Power size={14} />}
        </button>
        <button
          onClick={() => onDelete(template)}
          className="rounded p-1.5 text-gray-400 hover:bg-red-50 hover:text-red-600"
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function RecurringPage() {
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])

  const [showCreate, setShowCreate] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<RecurringMovementTemplate | null>(null)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const { data: templates } = useLiveQuery((q) =>
    q.from({ t: recurringMovementTemplatesCollection }).orderBy(({ t }) => t.created_at, 'asc'),
  )

  const { data: categories } = useLiveQuery((q) =>
    q.from({ c: categoriesCollection }).orderBy(({ c }) => c.sort_order, 'asc'),
  )

  const categoryMap = useMemo(() => {
    const map = new Map<string, Category>()
    for (const c of categories) map.set(c.id, c)
    return map
  }, [categories])

  const handleCreate = useCallback(async (form: TemplateFormData) => {
    const amount_cents = parseDollarsToAmountCents(form.amount_cents_input)!
    await createRecurringTemplate({
      data: {
        description: form.description.trim(),
        amount_cents,
        category_id: form.category_id || null,
        day_of_month: parseInt(form.day_of_month),
        start_date: form.start_date,
        end_date: form.end_date || null,
      },
    })
    setShowCreate(false)
  }, [])

  const handleUpdate = useCallback(async (form: TemplateFormData) => {
    if (!editingTemplate) return
    const amount_cents = parseDollarsToAmountCents(form.amount_cents_input)!
    await updateRecurringTemplate({
      data: {
        id: editingTemplate.id,
        description: form.description.trim(),
        amount_cents,
        category_id: form.category_id || null,
        day_of_month: parseInt(form.day_of_month),
        start_date: form.start_date,
        end_date: form.end_date || null,
      },
    })
    setEditingTemplate(null)
  }, [editingTemplate])

  const handleToggle = useCallback(async (template: RecurringMovementTemplate) => {
    await deactivateRecurringTemplate({ data: { id: template.id, active: !template.active } })
  }, [])

  const handleDelete = useCallback(async (template: RecurringMovementTemplate) => {
    setDeleteError(null)
    try {
      await deleteRecurringTemplate({ data: { id: template.id } })
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Delete failed')
    }
  }, [])

  if (!mounted) return null

  const active = templates.filter((t) => t.active)
  const inactive = templates.filter((t) => !t.active)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Recurring</h1>
          <p className="mt-1 text-sm text-gray-500">
            Templates that auto-generate monthly placeholder movements for forecasting and sync.
          </p>
        </div>
        <button
          onClick={() => { setShowCreate(true); setEditingTemplate(null) }}
          className="flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800"
        >
          <Plus size={16} />
          Add Template
        </button>
      </div>

      {deleteError && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {deleteError}
          <button onClick={() => setDeleteError(null)} className="ml-3 underline">Dismiss</button>
        </div>
      )}

      {showCreate && (
        <div className="rounded-lg border border-gray-200 bg-white p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">New Template</h2>
          <TemplateForm
            categories={categories}
            onSubmit={handleCreate}
            onCancel={() => setShowCreate(false)}
            submitLabel="Create"
          />
        </div>
      )}

      {editingTemplate && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-5">
          <h2 className="mb-4 text-sm font-semibold text-gray-700">Edit: {editingTemplate.description}</h2>
          <TemplateForm
            categories={categories}
            initial={{
              description: editingTemplate.description,
              amount_cents_input: String(editingTemplate.amount_cents / 100),
              category_id: editingTemplate.category_id ?? '',
              day_of_month: String(editingTemplate.day_of_month),
              start_date: editingTemplate.start_date,
              end_date: editingTemplate.end_date ?? '',
            }}
            onSubmit={handleUpdate}
            onCancel={() => setEditingTemplate(null)}
            submitLabel="Save changes"
          />
        </div>
      )}

      {templates.length === 0 && !showCreate && (
        <div className="rounded-lg border border-gray-200 bg-white px-6 py-12 text-center">
          <RefreshCw size={24} className="mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500">No recurring templates yet.</p>
          <p className="mt-1 text-sm text-gray-400">Add salary, mortgage, or any fixed monthly movement.</p>
        </div>
      )}

      {active.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Active</h2>
          {active.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              categoryMap={categoryMap}
              onEdit={setEditingTemplate}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {inactive.length > 0 && (
        <div className="flex flex-col gap-2">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400">Inactive</h2>
          {inactive.map((t) => (
            <TemplateRow
              key={t.id}
              template={t}
              categoryMap={categoryMap}
              onEdit={setEditingTemplate}
              onToggle={handleToggle}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  )
}

