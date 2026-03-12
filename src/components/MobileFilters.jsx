import React from 'react'
import '../styles/MobileFilters.css'

export default function MobileFilters({ isOpen, onToggle, onFilterChange }) {
  return (
    <div className="mobile-filters-wrapper">
      <button className="filters-toggle-btn" onClick={onToggle}>
        <span>Filters</span>
        <span className="toggle-icon">{isOpen ? '▼' : '▶'}</span>
      </button>

      {isOpen && (
        <div className="filters-panel">
          <div className="filter-group">
            <label>Message Type</label>
            <select onChange={(e) => onFilterChange('type', e.target.value)}>
              <option value="">All Messages</option>
              <option value="email">Email</option>
              <option value="arbor">Arbor</option>
              <option value="whatsapp">WhatsApp</option>
            </select>
          </div>

          <div className="filter-group">
            <label>Date Range</label>
            <input
              type="date"
              placeholder="Start Date"
              onChange={(e) => onFilterChange('startDate', e.target.value)}
            />
            <input
              type="date"
              placeholder="End Date"
              onChange={(e) => onFilterChange('endDate', e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  )
}
