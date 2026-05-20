# DESIGN.md

## Parley - Design System & UI/UX Guidelines

## 1. Core Brand Aesthetic

The Parley visual identity is built around the core logo: a clean, glowing, monochrome dot-matrix/halftone design. The aesthetic should bridge the gap between a high-performance developer tool and a professional tactical environment.

- **Vibe:** Utilitarian, minimalist, high-contrast, and fast.
- **Anti-Pattern:** Do **not** use stereotypical "gaming" styles. No neon RGB gradients, no jagged aggressive borders, and no cluttered "gamer" fonts.
- **Inspiration:** Think of the clean layouts of platforms like Vercel, Cloudflare, or Linear, but adapted for tactical competitive play.

### Color Palette

- **Background (Primary):** Deep Charcoal/Near Black (`#0F0F13`)
- **Background (Secondary/Cards):** Dark Grey (`#1A1A1E`)
- **Text (Primary):** Pure White (`#FFFFFF`) with a subtle glow effect on active states.
- **Text (Secondary):** Muted Light Grey (`#A1A1AA`)
- **Accents:** Reserved strictly for statuses (Success/Error/Warning) or active chat indicators.
- **Borders:** Subtle Grey (`#27272A`)

### Typography

- **Headings/Logos:** A clean geometric sans-serif (e.g., _Inter_ or _Geist_).
- **Data/Stats/Match IDs:** A crisp monospace font (e.g., _JetBrains Mono_ or _Geist Mono_) to reflect the dot-matrix style of the logo.

---

## 2. Discord Bot Guidelines

The Discord integration must feel like a modern application, not a traditional text-parsing bot. It relies entirely on structured UI elements.

### Strict Interaction Rule (Components v2 Only)

Users should never have to type raw commands to navigate menus or take actions. All interactions must be handled via **Discord Components v2**:

- **Buttons:** For immediate actions (e.g., [Join Lobby], [Ready Up], [Cancel]).
- **Select Menus (Dropdowns):** For configuration (e.g., selecting a map ban, choosing a tournament bracket, assigning a role).
- **Modals:** For text input (e.g., submitting a match dispute, entering a custom team name).

### Embed Design & Type-Safe UI Wrapper

Embeds must be highly standardized. Because Parley uses a custom Discord API wrapper, raw emoji strings are never hardcoded. Instead, UI construction relies on the wrapper's type safety to automatically inject the correct custom emoji and hex color based on the embed's semantic status.

- **Error/Failure:**
  - **System State:** Handled via the wrapper's error type (injects `#EF4444` and the `parley_error` icon).
  - **Usage:** Missing permissions, lobby full, invalid action.
- **Success/Confirmation:**
  - **System State:** Handled via the wrapper's success type (injects `#22C55E` and the `parley_success` icon).
  - **Usage:** Match started, team joined, settings saved.
- **Information/Neutral:**
  - **System State:** Handled via the wrapper's info/default type (injects `#FFFFFF` and the `parley_info` icon).
  - **Usage:** General menus, player stats, tournament brackets.
- **Warning/Alert:**
  - **System State:** Handled via the wrapper's warning type (injects `#F59E0B` and the `parley_alert` icon).
  - **Usage:** Check-in reminders, pending timeouts.

---

## 3. Web Platform Design (Dashboard & Player Portal)

The web platform translates the Discord functionality into a full-screen, high-data-density environment.

### The Admin Dashboard (Guild Management)

- **Layout:** Classic sidebar navigation (Guild selector, General, Roles, Matchmaking Settings) with a wide, clean content area.
- **Forms & Settings:** Use simple toggles, clean drop-downs, and monospace text for internal IDs or role mappings. Keep the UI flat and borders thin.

### The Player Portal & Chat Advantage

- **Tournament View:** A clean, horizontal-scrolling bracket system using the dark grey palette. Hovering over a match highlights the connecting lines in white.
- **The Web-Exclusive Chat:**
  - Since the web chat is the platform's primary advantage over Discord, it must take center stage during an active match.
  - **Layout:** A split-screen view. The left 70% shows real-time match stats, map veto statuses, and team rosters. The right 30% is a persistent WebSocket-powered chat window.
  - **Chat UI:** Minimalist message bubbles. Use the pure white/grey palette for standard messages, and system alerts (e.g., _“Match server is booting...”_) in monospace with a subtle background tint. No bulky avatars; just clean usernames and timestamps to ensure maximum screen efficiency.
