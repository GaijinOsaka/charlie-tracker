import { useState } from 'react'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December']

function CalendarView({ events, linkify, downloadAttachment, archiveEvent }) {
  const today = new Date()
  const todayStr = today.toISOString().split('T')[0]
  const [viewYear, setViewYear] = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())
  const [selectedDate, setSelectedDate] = useState(null)
  const [expandedCalEvent, setExpandedCalEvent] = useState(null)

  // Build a map of date string -> events
  const eventsByDate = {}
  events.forEach(evt => {
    if (!eventsByDate[evt.event_date]) eventsByDate[evt.event_date] = []
    eventsByDate[evt.event_date].push(evt)
  })

  // Calendar grid
  const firstDay = new Date(viewYear, viewMonth, 1)
  // Monday=0 ... Sunday=6
  let startDow = firstDay.getDay() - 1
  if (startDow < 0) startDow = 6
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const cells = []
  // Leading blanks
  for (let i = 0; i < startDow; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  // Trailing blanks to fill grid
  while (cells.length % 7 !== 0) cells.push(null)

  function prevMonth() {
    if (viewMonth === 0) { setViewYear(viewYear - 1); setViewMonth(11) }
    else setViewMonth(viewMonth - 1)
    setSelectedDate(null)
    setExpandedCalEvent(null)
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewYear(viewYear + 1); setViewMonth(0) }
    else setViewMonth(viewMonth + 1)
    setSelectedDate(null)
    setExpandedCalEvent(null)
  }

  function goToday() {
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setSelectedDate(todayStr)
    setExpandedCalEvent(null)
  }

  function dateStr(day) {
    return `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  const selectedEvents = selectedDate ? (eventsByDate[selectedDate] || []) : []

  const upcomingEvents = events
    .filter(e => e.event_date >= todayStr)
    .sort((a, b) => a.event_date.localeCompare(b.event_date) || (a.event_time || '').localeCompare(b.event_time || ''))
    .slice(0, 5)

  function renderEventCard(evt, showDate) {
    return (
      <div key={evt.id} className={`cal-event-card ${expandedCalEvent === evt.id ? 'cal-event-expanded' : ''}`}>
        <div className="cal-event-row" onClick={() => setExpandedCalEvent(expandedCalEvent === evt.id ? null : evt.id)}>
          {showDate && (
            <div className="cal-upcoming-date">
              <span className="cal-upcoming-day">{new Date(evt.event_date + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric' })}</span>
              <span className="cal-upcoming-month">{new Date(evt.event_date + 'T00:00:00').toLocaleDateString('en-GB', { month: 'short' })}</span>
            </div>
          )}
          <div className="cal-event-info">
            <h5 className="cal-event-title">{evt.title}</h5>
            {evt.event_time && (
              <span className="cal-event-time">
                {evt.event_time.slice(0, 5)}{evt.event_end_time ? ` – ${evt.event_end_time.slice(0, 5)}` : ''}
              </span>
            )}
            {evt.description && <p className="cal-event-desc">{evt.description}</p>}
            <div className="cal-event-meta">
              {evt.action_required && (
                <span className="event-action-badge">{evt.action_detail || 'Action Required'}</span>
              )}
              {evt.event_tags && evt.event_tags.map(t => (
                <span key={t.tag} className="event-tag">{t.tag}</span>
              ))}
              {evt.messages && (
                <span className="event-source">From: {evt.messages.sender_name || evt.messages.subject}</span>
              )}
              {evt.documents && !evt.messages && (
                <span className="event-source event-document-source">From: {evt.documents.filename}</span>
              )}
            </div>
          </div>
          {(evt.messages || evt.documents) && (
            <span className="event-expand-hint">
              {expandedCalEvent === evt.id
                ? (evt.messages ? 'Hide message \u25B2' : 'Hide document \u25B2')
                : (evt.messages ? 'Show message \u25BC' : 'Show document \u25BC')}
            </span>
          )}
          {archiveEvent && (
            <button
              className="btn-event-delete"
              onClick={(e) => { e.stopPropagation(); archiveEvent(evt.id); }}
              title="Archive event"
            >
              &times;
            </button>
          )}
        </div>
        {expandedCalEvent === evt.id && evt.messages && (
          <div className="event-message-panel">
            <div className="event-message-header">
              <h4 className="message-subject">{evt.messages.subject}</h4>
              <div className="event-message-meta-row">
                <span className="message-sender">{evt.messages.sender_name || evt.messages.sender_email}</span>
                <span className="message-time">{new Date(evt.messages.received_at).toLocaleString()}</span>
                <span className={`source-badge source-${evt.messages.source}`}>
                  {(evt.messages.source || 'arbor').toUpperCase()}
                </span>
              </div>
            </div>
            <div className="message-content">
              {linkify(evt.messages.content)}
            </div>
            {evt.messages.attachments && evt.messages.attachments.length > 0 && (
              <div className="message-attachments">
                <span className="attachments-label">Attachments:</span>
                {evt.messages.attachments.map(att => (
                  <button
                    key={att.id}
                    className="attachment-link"
                    onClick={(e) => { e.stopPropagation(); downloadAttachment(att.file_path, att.filename) }}
                    title={att.filename}
                  >
                    <span className="attachment-icon">
                      {att.mime_type?.includes('pdf') ? '\u{1F4C4}' : '\u{1F4CE}'}
                    </span>
                    <span className="attachment-name">{att.filename}</span>
                    {att.file_size && (
                      <span className="attachment-size">
                        ({Math.round(att.file_size / 1024)}KB)
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {expandedCalEvent === evt.id && !evt.messages && evt.documents && (
          <div className="event-message-panel">
            <div className="event-doc-panel">
              <span className="event-doc-icon">{evt.documents.filename?.endsWith('.pdf') ? '\u{1F4C4}' : '\u{1F4CE}'}</span>
              <div className="event-doc-info">
                <span className="event-doc-filename">{evt.documents.filename}</span>
              </div>
              <button
                className="btn-doc-download"
                onClick={(e) => { e.stopPropagation(); downloadAttachment(evt.documents.file_path, evt.documents.filename); }}
              >
                Download
              </button>
            </div>
          </div>
        )}
        {expandedCalEvent === evt.id && !evt.messages && !evt.documents && (
          <div className="event-message-panel">
            <p className="cal-no-events">No linked source for this event.</p>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="cal">
      <div className="cal-header">
        <button className="cal-nav-btn" onClick={prevMonth}>&lsaquo;</button>
        <h3 className="cal-title">{MONTHS[viewMonth]} {viewYear}</h3>
        <button className="cal-nav-btn" onClick={nextMonth}>&rsaquo;</button>
        <button className="cal-today-btn" onClick={goToday}>Today</button>
      </div>

      <div className="cal-grid">
        {DAYS.map(d => (
          <div key={d} className="cal-dow">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`blank-${i}`} className="cal-cell cal-blank" />
          const ds = dateStr(day)
          const hasEvents = !!eventsByDate[ds]
          const isToday = ds === todayStr
          const isSelected = ds === selectedDate
          const dayEvents = eventsByDate[ds] || []
          const hasAction = dayEvents.some(e => e.action_required)
          return (
            <div
              key={ds}
              className={`cal-cell ${isToday ? 'cal-today' : ''} ${isSelected ? 'cal-selected' : ''} ${hasEvents ? 'cal-has-events' : ''}`}
              onClick={() => { setSelectedDate(ds); setExpandedCalEvent(null) }}
            >
              <span className="cal-day-num">{day}</span>
              {hasEvents && (
                <div className="cal-event-summaries">
                  {dayEvents.slice(0, 2).map((e, j) => (
                    <div key={j} className={`cal-event-summary ${e.action_required ? 'cal-event-action' : ''}`}>
                      <span className="cal-event-name">{e.title}</span>
                      {e.event_time && (
                        <span className="cal-event-time">
                          {e.event_time.slice(0, 5)}{e.event_end_time ? `–${e.event_end_time.slice(0, 5)}` : ''}
                        </span>
                      )}
                    </div>
                  ))}
                  {dayEvents.length > 2 && (
                    <span className="cal-event-more">+{dayEvents.length - 2} more</span>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {selectedDate && (
        <div className="cal-detail">
          <h4 className="cal-detail-date">
            {new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </h4>
          {selectedEvents.length === 0 && (
            <p className="cal-no-events">No events on this date.</p>
          )}
          {selectedEvents.map(evt => renderEventCard(evt, false))}
        </div>
      )}

      {upcomingEvents.length > 0 && (
        <div className="cal-upcoming">
          <h4 className="cal-upcoming-title">Upcoming Events</h4>
          {upcomingEvents.map(evt => renderEventCard(evt, true))}
        </div>
      )}
    </div>
  )
}

export default CalendarView
