import type { Payment, Student, Center } from '../types'
import { fmtTaka, takaToWords, fmtDate, periodLabel } from '../lib/format'

interface Props {
  center: Center
  student: Student
  payment: Payment
}

const NAVY = '#12314f'
const GOLD = '#b98a2f'
const INK = '#1c2936'
const MUTED = '#7c7668'
const CREAM = '#fbfaf5'
const LINE = '#e2dccd'

const BASE = import.meta.env.BASE_URL
const DEFAULT_LOGO = `${BASE}logo.png`
const PAID_STAMP = `${BASE}paid.png`

export function ReceiptCard({ center, student, payment }: Props) {
  const due = payment.due || 0
  const showDue = due > 0
  const receivedBy = payment.receivedBy
  const showPaid = payment.amount > 0 && center.paidStamp !== false

  return (
    <div
      className="receipt-card"
      style={{
        width: 480,
        background: '#ffffff',
        border: `2px solid ${NAVY}`,
        outline: `1px solid ${NAVY}`,
        outlineOffset: 4,
        borderRadius: 0,
        padding: 20,
        color: INK,
        fontFamily: "'Segoe UI', system-ui, sans-serif",
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Header: logo + center identity */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        {center.logo ? (
          <img
            src={center.logo}
            alt=""
            style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 0, background: CREAM, border: `1px solid ${LINE}`, padding: 4 }}
          />
        ) : (
          <img
            src={DEFAULT_LOGO}
            alt=""
            style={{ width: 64, height: 64, objectFit: 'contain', borderRadius: 0, background: CREAM, border: `1px solid ${LINE}`, padding: 4 }}
          />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 18, fontWeight: 800, letterSpacing: '0.04em', color: NAVY }}>
            {center.name || 'UTSAHO EDUCARE'}
          </div>
          {center.tagline && (
            <div style={{ fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', color: GOLD, marginTop: 2 }}>
              {center.tagline}
            </div>
          )}
          {(center.address || center.phone) && (
            <div style={{ fontSize: 9.5, color: MUTED, marginTop: 4 }}>
              {[center.address, center.phone].filter(Boolean).join(' · ')}
            </div>
          )}
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 9, letterSpacing: '0.22em', color: MUTED, fontWeight: 600 }}>
            PAYMENT RECEIPT
          </div>
          <div style={{ fontSize: 26, fontWeight: 800, color: NAVY, marginTop: 2, letterSpacing: '0.02em' }}>
            #{String(payment.receiptNo).padStart(4, '0')}
          </div>
          <div style={{ fontSize: 9.5, color: MUTED, marginTop: 2 }}>{fmtDate(payment.date)}</div>
        </div>
      </div>

      {/* Gold rule */}
      <div style={{ height: 2, background: `linear-gradient(90deg, ${GOLD}, ${NAVY} 60%)`, margin: '14px 0' }} />

      {/* Student details */}
      <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr', rowGap: 7, fontSize: 12.5 }}>
        {[
          ['Student', student.name],
          ['Batch / Class', student.batch || '—'],
          ['Payment mode', payment.mode],
          ['For the month', periodLabel(payment.period)],
          ['Date received', fmtDate(payment.date)],
        ].map(([k, v]) => (
          <div key={k} style={{ display: 'contents' }}>
            <div style={{ color: MUTED }}>{k}</div>
            <div style={{ fontWeight: 600 }}>{v}</div>
          </div>
        ))}
      </div>

      {/* Amount panel */}
      <div
        style={{
          marginTop: 14,
          border: `1.5px solid ${NAVY}`,
          borderRadius: 0,
          background: CREAM,
          overflow: 'hidden',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px' }}>
          <div>
            <div style={{ fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED }}>
              Amount paid
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, color: NAVY, marginTop: 3, lineHeight: 1 }}>
              {fmtTaka(payment.amount)}
            </div>
          </div>
          {showDue && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#b23b3b' }}>
                Due
              </div>
              <div style={{ fontSize: 18, fontWeight: 700, color: '#b23b3b', marginTop: 3, lineHeight: 1 }}>
                {fmtTaka(due)}
              </div>
            </div>
          )}
        </div>
        <div style={{ borderTop: `1px dashed ${LINE}`, padding: '8px 16px', fontSize: 10.5, fontStyle: 'italic', color: MUTED }}>
          Taka {takaToWords(payment.amount)} Only
        </div>
      </div>

      {/* Rules */}
      {center.rules?.trim() && (
        <div style={{ marginTop: 14, border: `1px solid ${LINE}`, borderRadius: 0, padding: '10px 12px', background: '#fff' }}>
          <div style={{ fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: GOLD, fontWeight: 700, marginBottom: 4 }}>
            নিয়মাবলী
          </div>
          <div style={{ fontSize: 11, color: INK, whiteSpace: 'pre-wrap', lineHeight: 1.55 }}>
            {center.rules}
          </div>
        </div>
      )}

      {/* Sign-off */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 16 }}>
        <div>
          <div style={{ fontSize: 9.5, letterSpacing: '0.18em', textTransform: 'uppercase', color: MUTED }}>
            Received by
          </div>
          <div style={{ fontWeight: 700, fontSize: 13, color: NAVY, marginTop: 3 }}>
            {receivedBy?.name || center.name || 'UTSAHO EDUCARE'}
          </div>
          {receivedBy?.phone && (
            <div style={{ fontSize: 10.5, color: MUTED, marginTop: 1 }}>{receivedBy.phone}</div>
          )}
          {!receivedBy && (
            <div style={{ width: 150, borderBottom: `1px solid ${INK}`, marginTop: 4 }} />
          )}
        </div>
        <div style={{ textAlign: 'right', fontSize: 10, color: MUTED, fontStyle: 'italic' }}>
          {center.tagline || 'Thank you!'}
          <div style={{ marginTop: 2, fontSize: 9, color: GOLD, fontWeight: 600 }}>উৎসাহ এডুকেয়ার</div>
        </div>
      </div>

      {/* PAID stamp */}
      {showPaid && (
        <img
          src={PAID_STAMP}
          alt="PAID"
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%) rotate(-18deg)',
            width: 230,
            height: 'auto',
            opacity: 0.85,
            pointerEvents: 'none',
            userSelect: 'none',
            zIndex: 2,
          }}
        />
      )}
    </div>
  )
}
