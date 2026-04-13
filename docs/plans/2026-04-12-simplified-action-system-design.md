# Simplified Action System Design

**Date:** 2026-04-12
**Status:** Approved
**Goal:** Reduce UI complexity and improve navigation by consolidating action marking into a focused, two-step system.

## Problem

The current action marking system is scattered and cluttered. Users struggle to navigate the UI and track items requiring action.

## Solution Overview

Replace the complex action UI with a simplified two-step flow:
1. Click action button on a message
2. Choose "Action Required" (amber) or "Actioned" (green)
3. Item moves to a compact actions box at the top

## Components

### Actions Box (Top of Page)
- **Location:** Above the main message list, dedicated section
- **Display:** Compact list showing:
  - Subject (truncated if long)
  - Source icon (gmail, arbor, whatsapp)
  - Date (short format, e.g., "12 Apr")
  - Color dot (amber = action required, green = actioned)
- **Interaction:** Click any item to expand inline and view:
  - Full message content
  - Notes/context
  - Ability to change status or clear it

### Action Button
- **Location:** On each message in the main list (hover or always visible)
- **Behavior:** Click opens a small popover with two options:
  - **Action Required** (amber)
  - **Actioned** (green)
- **Result on click:**
  - Immediately updates message's `action_status`
  - Moves message to actions box
  - Shows colored dot next to message in list
  - Dismisses popover
  - Can be clicked again to change status or clear it entirely

### Visual Indicator in Message List
- **Colored dot** next to messages with action status
- Amber = action required
- Green = actioned
- Allows scanning without clicking into each message

## Data Model

No schema changes needed. Uses existing `action_status` field on messages:
- `null` — no action status
- `"pending"` — action required
- `"actioned"` — already handled

## User Flow

1. **Marking an item:** Click action button → select status → item appears in actions box with colored dot
2. **Viewing actions:** Scan actions box or colored dots in list → click item in actions box to expand
3. **Changing status:** Click expanded item or action button again to toggle or clear
4. **Clearing:** Remove status entirely (remove from actions box, remove dot from list)

## Simplifications

- **Removed:** Complex modal dialogs, multiple action fields, scattered UI controls
- **Simplified:** One button, two clear options, focused actions box
- **Result:** Cleaner main list, easier navigation, clear "at a glance" view of what needs attention

## Mobile Consideration

On screens <768px, actions box could collapse into a badge ("3 pending, 2 actioned") that expands on tap, keeping the interface compact.

## Implementation Priority

1. Create actions box component
2. Add action button + popover to message items
3. Style colored dots
4. Test interaction flow
5. Mobile responsive adjustments
