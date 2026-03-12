import React from 'react'
import '../styles/MobileNav.css'

export default function MobileNav({ isOpen, onClose, activeTab, onTabChange, unreadCount }) {
  const tabs = [
    { id: 'messages', label: 'Messages', icon: '💬' },
    { id: 'events', label: 'Events', icon: '📅' },
    { id: 'calendar', label: 'Calendar', icon: '🗓️' },
    { id: 'documents', label: 'Documents', icon: '📄' },
    { id: 'settings', label: 'Settings', icon: '⚙️' }
  ]

  const handleTabClick = (tabId) => {
    onTabChange(tabId)
    onClose()
  }

  return (
    <>
      {isOpen && <div className="mobile-nav-overlay" onClick={onClose} />}
      <nav className={`mobile-nav ${isOpen ? 'open' : ''}`}>
        <div className="mobile-nav-header">
          <h2>Menu</h2>
          <button className="mobile-nav-close" onClick={onClose}>✕</button>
        </div>
        <ul className="mobile-nav-list">
          {tabs.map(tab => (
            <li key={tab.id}>
              <button
                className={`mobile-nav-item ${activeTab === tab.id ? 'active' : ''}`}
                onClick={() => handleTabClick(tab.id)}
              >
                <span className="mobile-nav-icon">{tab.icon}</span>
                <span className="mobile-nav-label">{tab.label}</span>
                {tab.id === 'messages' && unreadCount > 0 && (
                  <span className="mobile-nav-badge">{unreadCount}</span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
