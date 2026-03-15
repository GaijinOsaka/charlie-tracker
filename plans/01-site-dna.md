---
AUDIT_MODE: standard
---

# SITE DNA: Amicable Co-parenting App Landing Page

**URL:** https://amicable.io/coparenting-app/
**Analyzed:** 2026-03-12
**Mode:** Standard (Narrative descriptions)

---

## SECTION ARCHITECTURE

Total sections: 6 distinct visual sections + footer

1. **Cookie Consent Modal** (Overlay on load)
2. **Header/Hero** — Full-bleed with logo, headline, description, app store buttons, video preview
3. **Video Section** — Embedded video player with play button
4. **Feature Grid** — 3-column layout: "Co-parenting schedules", "Communication needs", "Co-parenting tools"
5. **Feature Detail Showcase** — Numbered sections (1, 2, 3) highlighting: Shared calendar, Goals, Secure messaging
6. **CTA Section** — Closing call-to-action with repeated app store buttons + warm background
7. **Footer** — Multi-column footer with company info, links, social icons

**Grid Philosophy:** Full-bleed sections with centered content containers. Clean vertical stack. Generous whitespace between sections (40-80px padding top/bottom per section).

---

## DESIGN TOKENS

### PALETTE

- **Primary Orange:** #FF7B00 (rgb(255, 123, 0)) — Buttons, links, hover states, accents
- **Secondary Orange:** #E84A1D (rgb(232, 74, 29)) — Secondary/darker button states
- **Dark Text:** #333333 (rgb(51, 51, 51)) — Body copy, headings
- **Near-Black:** #302E2B (rgb(48, 46, 43)) — Very dark text, emphasis
- **White:** #FFFFFF (rgb(255, 255, 255)) — Backgrounds, cards, contrast
- **Light Gray:** #EEEEEE (rgb(238, 238, 238)) — Section backgrounds, subtle dividers
- **Black:** #000000 — Text, borders
- **Subtle Overlay:** rgba(0, 0, 0, 0.05) — Minimal shadows, background tints
- **Medium Overlay:** rgba(0, 0, 0, 0.5) — Video play overlay

### TYPOGRAPHY

- **Font Family:** "Solomon" (custom sans-serif), fallback to Arial, sans-serif
- **Headings (H1, H2):** Solomon, sans-serif | Weight: Bold/700 | Size: ~2.2–3rem | Letter-spacing: tight | Line-height: 1.2
- **Heading H3 (Feature titles):** Solomon, sans-serif | Weight: 600 | Size: ~1.3–1.5rem | Line-height: 1.3
- **Body Text:** Solomon, sans-serif | Weight: 400 | Size: ~1rem | Line-height: 1.6 | Letter-spacing: normal
- **Labels/Small Text:** Weight: 600 | Size: ~0.875rem | Uppercase common
- **Drama Notes:** The bold Solomon typeface creates strong visual hierarchy. H1 at 2.5–3rem paired with 400-weight body creates dramatic contrast. Feature numbers ("1", "2", "3") are oversized (80–120px) and bold, creating visual anchors.

### SPACING GRID

Base unit appears to be 8px / 16px scale.

- Section padding: 40–80px top/bottom, 20–40px sides
- Card/element gaps: 16–24px
- Margin between blocks: 32–48px

### BORDER RADIUS

- Buttons: 3.75px (very subtle, almost square)
- Cards: 8–12px (soft corners)
- Form inputs: 4–6px

### SHADOW SYSTEM

- **Subtle:** rgba(0, 0, 0, 0.05) — minimal depth
- **Cookie Modal/Overlay:** Appears to have light shadow to lift it above page
- Overall: Minimal shadows; relies on whitespace and color contrast for depth

### TEXTURE & EFFECTS

- No visible noise or grain overlays
- Solid color blocks with clean edges
- Minimal gradient use
- Video section has dark overlay (rgba(0,0,0,0.5)) for play button visibility

---

## SECTION BLUEPRINTS

### SECTION 1: Cookie Consent Modal

**BG Treatment:** White (#FFFFFF) with light shadow overlay
**Layout:** Centered modal, max-width ~500px
**Content Structure:**

- Usercentrics logo + link (top left)
- Heading: "This website uses cookies"
- Body copy explaining cookie usage
- Consent selection group (4 checkboxes: Necessary [checked, disabled], Preferences, Statistics, Marketing)
- "Show details" link (orange text)
- Three buttons at bottom: "Deny" (white bg, black text), "Allow selection" (white), "Allow all" (orange bg)

**Colors:**

- Heading: Dark gray (#333333)
- Body: Dark gray
- Buttons: White bg with dark text OR orange (#FF7B00) for primary action
- Checkboxes: Orange when selected

---

### SECTION 2: Header/Hero

**BG Treatment:** White background, full-bleed
**Header Navbar:** Minimal — just Amicable + Octopus logo (left-aligned)

**Hero Content:**

- **H1 Heading:** "The amicable co-parenting app" (Solomon, ~2.5–3rem, bold)
- **Subheading/Description:** 2–3 sentences of body text explaining app benefits + CTA ("Explore the app's features by starting your 7-day free trial today")
- **App Store Buttons:** Apple App Store + Google Play badges (side-by-side, centered)
- **Video Preview:** "Open lightbox" link (likely thumbnail or preview image of app)

**Color:** White background, dark text. Orange accent on links/buttons.

**Height:** ~70–80vh (tall hero section)

---

### SECTION 3: Video/Promo Video

**BG Treatment:** Light background with embedded video player (HTML5 video element)
**Content:** "The app built by co-parents, for co-parents" heading + video player

**Video Player Features:**

- Centered video element
- Play/Pause, Rewind 10s, Forward 10s buttons
- Seek slider
- Mute button with volume control
- Settings button
- Picture-in-Picture (PIP) button
- Fullscreen toggle
- Current time display (00:30 visible)

**Overlay Behavior:** Dark semi-transparent overlay (rgba(0,0,0,0.5)) covers video until play is clicked

**Color:** Dark text on light background, orange play button/accent

---

### SECTION 4: Feature Grid (3-Column)

**BG Treatment:** Light gray background (#EEEEEE) for visual distinction
**Layout:** 3-column grid, full-bleed, padding ~40–60px

**Three Cards/Features:**

1. **"Co-parenting schedules"**
   - **Icon:** Circular badge (appears pink/coral colored)
   - **Heading:** H3, ~1.3rem, bold
   - **Description:** Body text explaining feature

2. **"Communication needs"**
   - **Icon:** Circular badge
   - **Heading:** H3
   - **Description:** Body text

3. **"Co-parenting tools"**
   - **Icon:** Circular badge
   - **Heading:** H3
   - **Description:** Body text

**Spacing:** Cards evenly distributed with ~30–40px gap between them
**Colors:** Dark text on light gray background, coral/pink icons for visual warmth

---

### SECTION 5: Feature Details (Numbered Showcase)

**BG Treatment:** White background
**Layout:** Vertical stack of 3 feature cards, left-aligned

**Card Structure (repeats for each feature):**

- **Large Number:** "1", "2", "3" in oversized, bold Solomon (80–120px) in light gray or coral
- **Heading:** Feature name in bold H3
- **Description:** 2–3 sentences of feature benefits in body text

**Cards:**

1. **"Shared co-parenting calendar"** — Track events, drop-offs, appointments, holidays
2. **"Co-parenting goals"** — Set private/shared goals, pre-filled suggestions
3. **"Secure private messaging"** — Secure messaging, pre-defined topics, time-stamped, non-deletable

**Colors:** Dark text, orange number accent, light gray number background
**Spacing:** ~48–64px between cards

---

### SECTION 6: CTA Section (Closing Call-to-Action)

**BG Treatment:** Warm gradient or solid coral/salmon color (appears warm/inviting)
**Layout:** Centered, full-bleed

**Content:**

- **Heading:** "We know co-parenting isn't easy..." (empathetic, reassuring tone)
- **Body copy:** "But we also know you want to minimise the impact of your separation on your children..."
- **CTA buttons:** Apple App Store + Google Play badges (repeated)

**Colors:** Warm background (coral/salmon tones), white or light text
**Height:** ~20–30vh

---

### SECTION 7: Footer

**BG Treatment:** Light gray or white
**Layout:** 4–5 column grid with company info, links, contact details, social icons

**Columns:**

1. **Brand:** Logo, about statement, B Corp certification badge
2. **Company:** "About us", "Team", "Customer stories", "Careers", "Terms", "FAQ", "Complaints"
3. **Products & Services:** Links to diagnostic tool, timeline, calculator, parenting e-book, co-parenting, app, amicable.space
4. **Connect:** Phone number, email, partnerships, press contact, advice call link, address
5. **Social:** LinkedIn, Instagram, YouTube icons

**Colors:** Dark text on light background, orange accents on links

---

## DESIGN TOKENS SUMMARY

| Element             | Value               | Notes                                 |
| ------------------- | ------------------- | ------------------------------------- |
| Primary Button BG   | #FF7B00             | Orange, used for primary CTAs         |
| Secondary Button BG | #E84A1D             | Darker orange for hover/active states |
| Text Primary        | #333333             | Dark gray, main body text             |
| Text Secondary      | #302E2B             | Near-black, emphasis text             |
| BG Primary          | #FFFFFF             | White, main sections                  |
| BG Secondary        | #EEEEEE             | Light gray, feature grid background   |
| Border Radius       | 3.75–8px            | Subtle, minimalist                    |
| Font Primary        | Solomon, sans-serif | Custom typeface                       |
| Font Weight Bold    | 600–700             | Headings, emphasis                    |
| Font Weight Regular | 400                 | Body text                             |
| Shadow              | Minimal             | Light overlays, rarely used           |

---

## ANIMATIONS & INTERACTIONS (Standard Observations)

### Scroll Animations

- Elements appear to fade-in or subtle slide-up as they come into viewport
- No aggressive parallax; mostly subtle entrance animations
- Video section likely has staggered animations on load

### Hover States

- **Buttons:** Primary orange buttons likely slightly darken or change to #E84A1D on hover
- **Links:** Orange text links may underline or brighten on hover
- **App Store Buttons:** Subtle scale or shadow change on hover

### Micro-Interactions

- **Play Button on Video:** Click triggers video player overlay with controls
- **Cookie Modal:** Checkboxes toggle checked state, buttons respond to clicks
- **Video Controls:** Standard HTML5 video player interactions (play, volume, fullscreen, etc.)
- **Form Inputs:** No visible form on this page beyond cookie consent

### Motion Feel

- Conservative, functional motion
- Entrance animations are subtle (not flashy)
- Emphasis on readability and content clarity over dramatic effects
- Video player uses standard browser controls (not custom-animated)

---

## TECHNICAL STACK DETECTION

**Framework:** Likely React or similar SPA framework (based on page structure and interactive elements)
**Animation Library:** CSS-based or minimal JavaScript animations (no obvious GSAP, Framer Motion, or Lottie)
**Video:** HTML5 `<video>` element with standard browser player controls
**UI Library:** Custom CSS or Tailwind-like utility classes (clean, semantic HTML structure)
**Form Handling:** Usercentrics for cookie consent (third-party script)
**Other Libraries:**

- HubSpot integration detected (link tracking)
- Metrics/analytics service (assets.mediadelivery.net)

---

## MOTION PHILOSOPHY

The motion on this page is **conservative and functional**. It prioritizes clarity and content over cinematic flair. Animations are used sparingly:

- Entrance animations are subtle (fade-in, gentle slide-up) to draw attention without distraction
- Hover states provide light feedback (color change, scale, shadow)
- Video controls use standard browser interactions (no custom animation)
- Overall philosophy: **Less is more**. The focus is on the app itself and user testimonials, not on flashy visual effects.

**Emotional Impact:** Trustworthy, professional, warm. The motion supports the brand message of being "built by co-parents, for co-parents" — human-centered, not tech-for-tech's-sake.

---

## COPY VOICE & TONE PATTERN

**Tone:** Warm, empathetic, conversational with moments of bold reassurance
**Sentence Structure:** Mix of short, declarative statements and longer explanatory sentences

**Key Devices:**

- **Direct empathy:** "We know co-parenting isn't easy..."
- **Reassurance:** "But we also know you want to minimise the impact..."
- **Action-oriented language:** "Explore the app's features by starting your 7-day free trial today"
- **Feature-benefit framing:** Instead of "secure messaging," it's "Secure inbuilt messaging function to communicate with your co-parent on all aspects of parenting"

**Example Pattern:**

```
Heading: "The amicable co-parenting app"
Description: "The amicable co-parenting app helps you manage all aspects of co-parenting in one secure place, making parenting after divorce and separation simpler."
Call-to-action: "Explore the app's features by starting your 7-day free trial today."
```

**Rhetorical Strategy:** Problem-acknowledgment → Solution-presentation → Call-to-action
This structure repeats throughout the page (feature description → benefit → CTA).

---

## KEY DESIGN CHARACTERISTICS

1. **Color Strategy:** Warm, energetic orange (#FF7B00) paired with cool, calming white and light gray backgrounds. Creates approachable, trustworthy brand personality.

2. **Typography Hierarchy:** Bold, oversized headings in Solomon create strong visual anchors. Body text remains readable and comfortable at standard weights.

3. **Layout Philosophy:** Ample whitespace, full-bleed sections, centered content. Breathing room communicates clarity and organization — key values for a co-parenting app.

4. **Interactive Elements:** Minimalist button styling (subtle border-radius), standard form controls, familiar video player. No custom/experimental UI — reassuring familiarity.

5. **Visual Rhythm:** Large numbered sections ("1", "2", "3") create strong visual beats as user scrolls. These anchor the feature showcase section.

6. **Warmth & Humanity:** Coral/pink icons, warm CTA background, empathetic copy. Overall aesthetic communicates "built by humans, for families," not "cold corporate tool."

---

## NEXT STEPS

Phase 1 audit complete. Ready to proceed to **Phase 2: UI Cloner Brand Interview** to capture user's brand identity and design preferences.

Save this file as: `plans/01-site-dna.md`
