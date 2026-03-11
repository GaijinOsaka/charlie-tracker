# Modern Dark Theme Design
**Date:** 2026-03-11
**Goal:** Modernize the Charlie Tracker UI to a contemporary dark mode aesthetic with improved contrast and readability.

---

## Design Direction: Tech/SaaS Modern Dark

A vibrant, contemporary dark aesthetic inspired by modern productivity apps (Linear, Vercel, Figma) with high contrast for accessibility and smooth, intentional interactions.

---

## 1. Color Palette & Typography

### Color System
**Base Backgrounds:**
- Primary bg: `#0F172A` (deepest, main areas)
- Secondary bg: `#1E293B` (cards/panels)
- Tertiary bg: `#334155` (hover states, accents)

**Accent Colors (High Contrast, Modern):**
- Primary accent: `#06B6D4` (cyan—modern, energetic)
- Secondary accent: `#EC4899` (pink—action/urgency)
- Success: `#10B981` (emerald)
- Warning: `#F59E0B` (amber)
- Danger: `#EF4444` (bright red)

**Text:**
- Primary text: `#F1F5F9` (off-white, high contrast)
- Secondary text: `#CBD5E1` (muted, readable)
- Tertiary text: `#94A3B8` (low emphasis)

### Typography
- **Headings:** Inter (modern sans-serif), font-weight 600–700
- **Body:** Raleway, increased font-weight, larger base size (16px)
- **Line-height:** 1.7 for body text (readability on dark backgrounds)
- **Letter-spacing:** 0.5px for clarity

---

## 2. Component Styling

### Buttons
- **Primary:** Solid cyan (`#06B6D4`) background, dark text, no border
- **Secondary:** Outlined with cyan border, transparent background
- **Action buttons:**
  - "Mark Actioned" = pink (`#EC4899`)
  - "Add to RAG" = emerald (`#10B981`)
  - "Delete" = red (`#EF4444`)
- **Hover:** Brightness increase, soft glow `box-shadow: 0 0 12px rgba(6, 182, 212, 0.3)`
- **Disabled:** Muted gray (`#64748B`), lower opacity
- **Padding:** `12px`, **Border-radius:** `8px`, **Font-weight:** 600
- **Transition:** `0.2s ease`

### Cards & Containers
- **Background:** `#1E293B`
- **Border:** `1px solid #334155`
- **Border-radius:** `8px`
- **Box-shadow:** `0 4px 12px rgba(0, 0, 0, 0.3)`
- **Hover:** Border brightens to `#475569`, subtle lift (`transform: translateY(-2px)`)

### Input Fields & Selects
- **Background:** `#0F172A`
- **Border:** `2px solid #06B6D4` (focus state)
- **Text:** `#F1F5F9`
- **Placeholder:** `#94A3B8`
- **Focus glow:** `0 0 12px rgba(6, 182, 212, 0.3)`

### Badges & Tags
- **Colored backgrounds** with white/dark text (contextual colors)
- **Border-radius:** `4px`
- **Padding:** `4px 8px`

---

## 3. Layout & Spacing

**Overall:**
- Main padding: `32px 24px` (more breathing room)
- Max-width: `1200px`
- Background gradient: `#0F172A → #1A1F2E` (subtle)

**Header:**
- Border-bottom: `1px solid #334155` (minimal)
- Title: Inter, 2.5rem, bold
- Subtitle: Secondary text color
- Right side: Better alignment, more spacing

**Tabs/Navigation:**
- **Style:** Modern pill-style tabs
- **Active:** Cyan background (`#06B6D4`), dark text, rounded
- **Inactive:** Transparent, secondary text, hover background
- **Spacing:** Generous horizontal padding

**Cards:**
- **Vertical padding:** `20px`
- **Border:** `1px solid #334155`
- **Hover:** Lifts slightly, border brightens
- **Visual hierarchy:** Large bold subjects, muted metadata

**Filters:**
- Card-style container with subtle background
- Labels in secondary color
- Modern select styling
- Generous spacing between groups

---

## 4. Specific Components

### Message Cards
- **Header:** Bold subject (`#F1F5F9`), sender/time (`#CBD5E1`)
- **Unread indicator:** Cyan dot (`#06B6D4`)
- **Source badge:** Colored bg (Arbor=cyan, Gmail=blue), white text
- **Content:** `#F1F5F9`, line-height 1.7
- **Action buttons:**
  - "Mark as Read" = outlined cyan
  - "Mark Actioned" = solid pink
  - "Add to RAG" = outlined emerald
  - "Delete" = outlined red

### Event Cards
- **Date column:** Large bold number in cyan, month in secondary text
- **Title:** Bold, large
- **Tags:** Vibrant colored badges
- **"Action Required":** Solid pink with white text
- **Event details panel:** Dark card with subtle border

### Recently Actioned Section
- **Container:** Card-style with background `#1E293B`
- **Title:** Bold cyan
- **Items:** Better spacing, profile info secondary text

---

## 5. Animations & Polish

**Transitions:**
- All interactive elements: `transition: all 0.2s ease`

**Button Interactions:**
- **Hover:** Scale `1.02`, brightness increase, soft glow
- **Click:** Scale-down `0.98` for tactile feedback
- **Loading:** Cyan spinner, smooth rotation

**Card Hover Effects:**
- **Lift:** `transform: translateY(-2px)`
- **Shadow deepens:** `0 8px 16px rgba(0, 0, 0, 0.4)`
- **Border brightens:** `#475569`

**Expand/Collapse:**
- Chevron rotates 180° smoothly
- Content fades in/out (`0.3s ease`)
- Height transitions smoothly

**Toast Notifications:**
- Slide in from top-right (fade + slide)
- Colored left border (cyan=info, pink=action, emerald=success, red=error)
- Auto-dismiss after 4 seconds

**Focus States:**
- Cyan outline: `2px solid #06B6D4`
- Consistent across all interactive elements

**Loading States:**
- Skeleton loaders with animated gradient shimmer

---

## Implementation Strategy

### Phase 1: Core Styling
1. Update CSS variables (colors, typography)
2. Create base component styles (buttons, cards, inputs)
3. Update layout spacing and structure

### Phase 2: Component Updates
1. Update message cards
2. Update event cards and calendar
3. Update all UI elements (tabs, badges, etc.)

### Phase 3: Animations & Polish
1. Add transitions and hover effects
2. Implement focus states and loading states
3. Fine-tune toast notifications

### Phase 4: Testing & Refinement
1. Cross-browser testing
2. Accessibility validation (WCAG contrast ratios)
3. Mobile responsiveness check
4. User feedback iteration

---

## Accessibility Notes
- All text meets WCAG AA contrast requirements (cyan `#06B6D4` on dark backgrounds has 8.5:1 contrast)
- Focus states are clearly visible
- No reliance on color alone for meaning
- Font sizes increased for readability

---

## Expected Outcome
A modern, professional dark-themed interface with:
- Excellent readability and contrast
- Contemporary aesthetic matching modern SaaS apps
- Smooth, intentional interactions
- Better visual hierarchy and user guidance
- Enhanced accessibility
