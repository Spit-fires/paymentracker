import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useApp } from '../state/AppContext'
import { studentPeriodPaidAny } from '../lib/ledger'
import { periodNow } from '../lib/format'
import { Card, EmptyState, Modal, Button } from '../components/ui'
import { StudentForm, type FormValue } from '../components/StudentForm'
import {
  IconPlus,
  IconSearch,
  IconUsers,
  IconArrow,
} from '../components/Icons'

type SortKey = 'name' | 'batch' | 'recent'
const SORT_LABELS: Record<SortKey, string> = { name: 'Name', batch: 'Batch', recent: 'Recently added' }

export function Students() {
  const { students, payments, online, addStudent, showToast } = useApp()
  const [params, setParams] = useSearchParams()

  const q = params.get('q') || ''
  const mode = params.get('mode')
  const wantNew = params.get('new') === '1'

  const [addOpen, setAddOpen] = useState(wantNew)
  const [adding, setAdding] = useState(false)
  const [sort, setSort] = useState<SortKey>('name')
  const [sortOpen, setSortOpen] = useState(false)
  const [batchFilter, setBatchFilter] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  useEffect(() => {
    if (wantNew) setAddOpen(true)
    params.delete('new')
    setParams(params, { replace: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantNew])

  const period = periodNow()
  const batches = useMemo(
    () => Array.from(new Set(students.map((s) => s.batch))).filter(Boolean).sort(),
    [students],
  )

  const filtered = useMemo(() => {
    let list = students.filter((s) => (showArchived ? true : !s.archived))
    if (batchFilter) list = list.filter((s) => s.batch === batchFilter)
    if (q.trim()) {
      const t = q.trim().toLowerCase()
      list = list.filter(
        (s) => s.name.toLowerCase().includes(t) || s.batch.toLowerCase().includes(t),
      )
    }
    const sorted = [...list]
    if (sort === 'name') sorted.sort((a, b) => a.name.localeCompare(b.name))
    else if (sort === 'batch') sorted.sort((a, b) => a.batch.localeCompare(b.batch) || a.name.localeCompare(b.name))
    else sorted.sort((a, b) => b.createdAt - a.createdAt)
    return sorted
  }, [students, q, batchFilter, sort, showArchived])

  const onAdd = async (v: FormValue) => {
    if (!online) return showToast('You need to be online to add students', 'err')
    setAdding(true)
    try {
      await addStudent({
        name: v.name,
        email: v.email,
        phone: v.phone,
        batch: v.batch,
        defaultFee: v.defaultFee ? Number(v.defaultFee) : 0,
        notes: v.notes,
        photo: v.photo,
      })
      setAddOpen(false)
      showToast(`${v.name} added`, 'ok')
    } catch (e) {
      showToast(e instanceof Error ? e.message : 'Could not add student', 'err')
    } finally {
      setAdding(false)
    }
  }

  return (
    <div>
      {/* Header */}
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[22px] font-bold text-[#12314f] dark:text-white">Students</div>
            <div className="text-[13px] text-[#8a8578] dark:text-[#93a7bb]">
              {students.filter((s) => !s.archived).length} active
            </div>
          </div>
          <Button onClick={() => setAddOpen(true)}>
            <IconPlus className="w-4 h-4" /> Add
          </Button>
        </div>

        {mode === 'record' && (
          <div className="mt-3 rounded-xl bg-[#0f766e]/10 dark:bg-[#0f766e]/20 border border-[#0f766e]/20 px-3.5 py-2.5 text-[13px] font-medium text-[#0f766e]">
            Pick a student to record their payment
          </div>
        )}

        <div className="relative mt-3">
          <IconSearch className="w-[18px] h-[18px] absolute left-3.5 top-1/2 -translate-y-1/2 text-[#a29b8d]" />
          <input
            value={q}
            onChange={(e) => setParams({ q: e.target.value, ...(mode ? { mode } : {}) }, { replace: true })}
            placeholder="Search by name or batch…"
            className="w-full rounded-xl bg-white dark:bg-[#141f2c] border border-[#e8e3d9] dark:border-[#253546] pl-10 pr-4 py-2.5 text-[15px] focus:outline-none focus:ring-2 focus:ring-[#12314f]/20"
          />
        </div>

        {/* Toolbar */}
        <div className="flex items-center gap-2 mt-3">
          <button
            onClick={() => setSortOpen(true)}
            className="rounded-lg border border-[#e8e3d9] dark:border-[#253546] bg-white dark:bg-[#141f2c] px-3 py-1.5 text-[13px] font-semibold text-[#12314f] dark:text-white"
          >
            Sort: {SORT_LABELS[sort]}
          </button>
          <div className="flex-1" />
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={`rounded-lg px-3 py-1.5 text-[13px] font-semibold transition ${
              showArchived
                ? 'bg-[#12314f] text-white'
                : 'border border-[#e8e3d9] dark:border-[#253546] bg-white dark:bg-[#141f2c] text-[#8a8578] dark:text-[#93a7bb]'
            }`}
          >
            Archived
          </button>
        </div>

        {/* Batch filter chips */}
        {batches.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto mt-2 pb-1 -mx-4 px-4">
            <button
              onClick={() => setBatchFilter('')}
              className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${
                !batchFilter ? 'bg-[#12314f] text-white' : 'bg-white dark:bg-[#141f2c] text-[#3d4c5c] dark:text-[#b8c6d4] border border-[#e8e3d9] dark:border-[#253546]'
              }`}
            >
              All
            </button>
            {batches.map((b) => (
              <button
                key={b}
                onClick={() => setBatchFilter(batchFilter === b ? '' : b)}
                className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold ${
                  batchFilter === b
                    ? 'bg-[#12314f] text-white'
                    : 'bg-white dark:bg-[#141f2c] text-[#3d4c5c] dark:text-[#b8c6d4] border border-[#e8e3d9] dark:border-[#253546]'
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* List */}
      <div className="px-4 pb-4">
        {filtered.length === 0 ? (
          <Card className="!rounded-2xl">
            <EmptyState
              icon={<IconUsers className="w-7 h-7" />}
              title={q || batchFilter ? 'No matches' : 'No students yet'}
              subtitle={
                q || batchFilter
                  ? 'Try a different search.'
                  : 'Add your first student to start tracking payments.'
              }
              action={
                !q && !batchFilter ? (
                  <Button onClick={() => setAddOpen(true)}>
                    <IconPlus className="w-4 h-4" /> Add student
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          <div className="space-y-2">
            {filtered.map((s) => {
              const paid = studentPeriodPaidAny(payments, s.id, period)
              return (
                <Link
                  key={s.id}
                  to={mode === 'record' ? `/payment/${s.id}` : `/student/${s.id}`}
                  className="block"
                >
                  <Card className="!rounded-xl p-3 flex items-center gap-3">
                    {s.photoBlob ? (
                      <img
                        src={URL.createObjectURL(s.photoBlob)}
                        alt=""
                        className="w-11 h-11 rounded-full object-cover"
                      />
                    ) : (
                      <div className="w-11 h-11 rounded-full bg-[#e8f0f7] dark:bg-[#1d3144] grid place-items-center text-[#12314f] dark:text-[#cfe2f4] font-bold text-[15px] shrink-0">
                        {s.name
                          .split(' ')
                          .slice(0, 2)
                          .map((x) => x[0])
                          .join('')
                          .toUpperCase()}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-[14.5px] font-bold text-[#12314f] dark:text-white truncate flex items-center gap-2">
                        {s.name}
                        {s.archived && (
                          <span className="text-[10px] font-semibold text-[#8a8578] border border-[#d8d3c8] rounded px-1">archived</span>
                        )}
                      </div>
                      <div className="text-[12px] text-[#8a8578] dark:text-[#93a7bb]">
                        {s.batch || 'No batch'}
                      </div>
                    </div>
                    <div
                      className={`text-[11px] font-bold px-2 py-1 rounded-full ${
                        paid
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-red-50 text-red-600 dark:bg-red-900/40 dark:text-red-300'
                      }`}
                    >
                      {paid ? 'Paid' : 'Due'}
                    </div>
                    <IconArrow className="w-4 h-4 text-[#c4beb0] dark:text-[#5f7a92]" />
                  </Card>
                </Link>
              )
            })}
          </div>
        )}
      </div>

      {/* Sort sheet */}
      <Modal open={sortOpen} onClose={() => setSortOpen(false)} title="Sort students">
        <div className="space-y-1.5">
          {(Object.keys(SORT_LABELS) as SortKey[]).map((k) => (
            <button
              key={k}
              onClick={() => {
                setSort(k)
                setSortOpen(false)
              }}
              className={`w-full text-left rounded-xl px-4 py-3 text-[15px] font-semibold ${
                sort === k
                  ? 'bg-[#e8f0f7] text-[#12314f] dark:bg-[#1d3144] dark:text-[#cfe2f4]'
                  : 'text-[#3d4c5c] dark:text-[#b8c6d4]'
              }`}
            >
              {SORT_LABELS[k]}
            </button>
          ))}
        </div>
      </Modal>

      {/* Add student modal */}
      <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add student">
        <StudentForm
          submitLabel={adding ? 'Adding…' : 'Add student'}
          onSubmit={(v) => void onAdd(v)}
          onCancel={() => setAddOpen(false)}
        />
      </Modal>
    </div>
  )
}
