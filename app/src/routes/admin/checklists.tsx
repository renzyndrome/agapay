import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { GripHorizontal, Plus, Trash2 } from 'lucide-react'
import { STAGES } from '#/lib/stages'
import type { Stage } from '#/lib/stages'
import { useStore } from '#/store'
import { Card } from '#/components/ui'

export const Route = createFileRoute('/admin/checklists')({
  component: AdminChecklists,
})

function AdminChecklists() {
  const { masterChecklists, addMasterItem, removeMasterItem, moveMasterItem } =
    useStore()
  const [stage, setStage] = useState<Stage>('New Believer')
  const [newItem, setNewItem] = useState('')
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const items = masterChecklists[stage]

  const add = () => {
    const text = newItem.trim()
    if (!text) return
    addMasterItem(stage, text)
    setNewItem('')
  }

  return (
    <div className="max-w-180 px-8 pt-7 pb-10 max-md:px-5">
      <div className="font-display text-[24px] font-bold tracking-[-.01em] text-ink">
        Checklists
      </div>
      <div className="mt-0.5 text-[13px] font-medium text-ink/55">
        What each disciple walks through per stage. Drag to reorder.
      </div>

      <div className="mt-4.5 flex gap-1.5">
        {STAGES.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStage(s)}
            className="cursor-pointer rounded-full border-[1.5px] border-cream-border px-4 py-2 text-[12px] font-bold"
            style={{
              background: stage === s ? 'var(--color-ink)' : 'var(--color-white)',
              color: stage === s ? '#fff' : 'var(--color-ink-700)',
            }}
          >
            {s}
          </button>
        ))}
      </div>

      <Card className="mt-3.5">
        {items.length === 0 ? (
          <div className="px-4.5 py-6 text-center text-[12px] font-medium text-ink/50">
            No items yet for this stage — add the first one below.
          </div>
        ) : (
          items.map((text, i) => (
            <div
              key={`${text}-${i}`}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragIndex !== null && dragIndex !== i)
                  moveMasterItem(stage, dragIndex, i)
                setDragIndex(null)
              }}
              onDragEnd={() => setDragIndex(null)}
              className="flex cursor-grab items-center gap-3 border-b border-cream-surface px-4.5 py-3.5 active:cursor-grabbing"
              style={{
                background:
                  dragIndex === i ? 'var(--color-rose)' : 'var(--color-white)',
              }}
            >
              <GripHorizontal size={14} strokeWidth={2.4} className="text-ink/30" />
              <span className="w-4.5 text-[11px] font-bold text-ink/35">{i + 1}</span>
              <span className="flex-1 text-[13.5px] font-semibold text-ink">
                {text}
              </span>
              <button
                type="button"
                aria-label={`Remove "${text}"`}
                onClick={() => removeMasterItem(stage, i)}
                className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-full text-ink/35 hover:bg-rose hover:text-maroon"
              >
                <Trash2 size={14} strokeWidth={2.2} />
              </button>
            </div>
          ))
        )}
        <div className="flex gap-2 bg-cream px-4.5 py-3.5">
          <input
            type="text"
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') add()
            }}
            placeholder="Add a checklist item…"
            className="h-[42px] flex-1 rounded-(--radius-input) border-[1.5px] border-cream-border bg-white px-3 text-[13px] font-semibold text-ink outline-none focus:border-brand"
          />
          <button
            type="button"
            onClick={add}
            className="press flex h-[42px] cursor-pointer items-center gap-1.5 rounded-full bg-brand px-4.5 text-[12.5px] font-bold text-white hover:bg-brand-press"
          >
            <Plus size={13} strokeWidth={2.6} /> Add
          </button>
        </div>
      </Card>
    </div>
  )
}
