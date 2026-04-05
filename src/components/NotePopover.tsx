import { useState, useCallback } from 'react'
import * as RadixPopover from '@radix-ui/react-popover'
import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import { type Editor } from '@tiptap/react'
import { MessageSquare, Bold, Italic, Link2, Link2Off, Save, Trash2 } from 'lucide-react'
import type { MovementNote } from '#/lib/movement-notes-collection.js'
import type { BudgetItemNote } from '#/lib/budget-item-notes-collection.js'
import type { TeamMember } from '#/lib/team-members-collection.js'

type Note = MovementNote | BudgetItemNote

interface NotePopoverProps {
  note: Note | null
  onOpenChange: (open: boolean) => void
  teamMembers: TeamMember[]
  onSave: (content: string) => Promise<unknown>
  onDelete: () => Promise<unknown>
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 1) return 'just now'
  if (diffMins < 60) return `${diffMins}m ago`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h ago`
  const diffDays = Math.floor(diffHours / 24)
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString()
}

function Toolbar({ editor }: { editor: Editor | null }) {
  if (!editor) return null

  const setLink = () => {
    const prev = editor.getAttributes('link').href as string | undefined
    const url = window.prompt('URL', prev ?? 'https://')
    if (url === null) return
    if (url === '') {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    editor.chain().focus().extendMarkRange('link').setLink({ href: url }).run()
  }

  return (
    <div className="flex items-center gap-0.5 border-b border-gray-100 px-2 py-1">
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().toggleBold().run()
        }}
        className={`rounded p-1 text-xs hover:bg-gray-100 ${editor.isActive('bold') ? 'bg-gray-200 text-gray-900' : 'text-gray-500'}`}
      >
        <Bold size={12} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          editor.chain().focus().toggleItalic().run()
        }}
        className={`rounded p-1 text-xs hover:bg-gray-100 ${editor.isActive('italic') ? 'bg-gray-200 text-gray-900' : 'text-gray-500'}`}
      >
        <Italic size={12} />
      </button>
      <button
        type="button"
        onMouseDown={(e) => {
          e.preventDefault()
          setLink()
        }}
        className={`rounded p-1 text-xs hover:bg-gray-100 ${editor.isActive('link') ? 'bg-gray-200 text-gray-900' : 'text-gray-500'}`}
      >
        <Link2 size={12} />
      </button>
      {editor.isActive('link') && (
        <button
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            editor.chain().focus().unsetLink().run()
          }}
          className="rounded p-1 text-xs text-gray-500 hover:bg-gray-100"
        >
          <Link2Off size={12} />
        </button>
      )}
    </div>
  )
}

export function NotePopover({
  note,
  onOpenChange,
  teamMembers,
  onSave,
  onDelete,
}: NotePopoverProps) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const memberMap = new Map(teamMembers.map((m) => [m.id, m.name ?? m.id]))

  const editor = useEditor(
    {
      extensions: [
        StarterKit.configure({ link: false }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          HTMLAttributes: { rel: 'noopener noreferrer', target: '_blank' },
        }),
      ],
      content: note?.content ?? '',
      immediatelyRender: false,
    },
    [note?.id ?? 'new', note?.content ?? ''],
  )

  const charCount = editor?.getText().length ?? 0
  const MAX_CHARS = 10000
  const overLimit = charCount > MAX_CHARS

  const handleSave = useCallback(async () => {
    if (!editor || overLimit) return
    const html = editor.getHTML()
    const isEmpty = editor.isEmpty
    setSaving(true)
    setError(null)
    try {
      if (isEmpty) {
        await onDelete()
      } else {
        await onSave(html)
      }
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save note')
    } finally {
      setSaving(false)
    }
  }, [editor, overLimit, onSave, onDelete, onOpenChange])

  const handleDelete = useCallback(async () => {
    setSaving(true)
    setError(null)
    try {
      await onDelete()
      onOpenChange(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete note')
    } finally {
      setSaving(false)
    }
  }, [onDelete, onOpenChange])

  const createdByName = note?.created_by_user_id ? memberMap.get(note.created_by_user_id) : null
  const updatedByName = note?.updated_by_user_id ? memberMap.get(note.updated_by_user_id) : null
  const showEditor = note?.created_by_user_id !== note?.updated_by_user_id

  return (
    <RadixPopover.Portal>
      <RadixPopover.Content
        side="left"
        align="center"
        sideOffset={8}
        hideWhenDetached
        className="z-50 w-[340px] rounded-lg border border-gray-200 bg-white shadow-lg"
        onOpenAutoFocus={(e) => e.preventDefault()}
      >
        {/* Toolbar */}
        <Toolbar editor={editor} />

        {/* Editor area */}
        <div className="min-h-[120px] px-3 py-2">
          <EditorContent
            editor={editor}
            className="prose prose-sm max-w-none text-sm text-gray-800 focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[100px]"
          />
        </div>

        {/* Footer */}
        <div className="border-t border-gray-100 px-3 py-2">
          {/* Attribution */}
          {note && (
            <div className="mb-2 text-[11px] text-gray-400">
              {createdByName && (
                <span>
                  Created by <span className="text-gray-600">{createdByName}</span>
                </span>
              )}
              {showEditor && updatedByName && (
                <span>
                  {' '}
                  · Edited by <span className="text-gray-600">{updatedByName}</span> ·{' '}
                  {formatRelativeTime(note.updated_at)}
                </span>
              )}
              {!showEditor && note.updated_at && createdByName && (
                <span> · {formatRelativeTime(note.updated_at)}</span>
              )}
            </div>
          )}

          {/* Char count + error */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`text-[11px] ${overLimit ? 'text-red-500 font-medium' : 'text-gray-400'}`}
              >
                {charCount}/{MAX_CHARS}
              </span>
              {error && <span className="text-[11px] text-red-500">{error}</span>}
            </div>
            <div className="flex items-center gap-1">
              {note && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="flex items-center gap-1 rounded px-2 py-1 text-xs text-gray-400 hover:bg-red-50 hover:text-red-500 disabled:opacity-50"
                >
                  <Trash2 size={11} />
                </button>
              )}
              <button
                type="button"
                onClick={handleSave}
                disabled={saving || overLimit}
                className="flex items-center gap-1 rounded bg-gray-900 px-3 py-1 text-xs font-medium text-white hover:bg-gray-800 disabled:opacity-50"
              >
                <Save size={11} />
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
        <RadixPopover.Arrow className="fill-gray-200" />
      </RadixPopover.Content>
    </RadixPopover.Portal>
  )
}

interface NoteIconButtonProps {
  hasNote: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  children: React.ReactNode
}

export function NoteIconButton({
  hasNote,
  open: isOpen,
  onOpenChange,
  children,
}: NoteIconButtonProps) {
  return (
    <RadixPopover.Root open={isOpen} onOpenChange={onOpenChange}>
      <RadixPopover.Trigger asChild>
        <button
          type="button"
          className={`rounded p-1 transition-colors ${
            isOpen
              ? 'bg-amber-100 text-amber-600'
              : hasNote
                ? 'text-amber-500 hover:bg-amber-50'
                : 'text-gray-300 hover:bg-gray-100 hover:text-gray-500'
          }`}
          title={hasNote ? 'View note' : 'Add note'}
        >
          <MessageSquare size={12} fill={hasNote ? 'currentColor' : 'none'} />
        </button>
      </RadixPopover.Trigger>
      {children}
    </RadixPopover.Root>
  )
}
