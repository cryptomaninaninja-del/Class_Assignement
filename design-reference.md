# Cipher RAT Dashboard --- Design Reference

## Purpose

Recreate and refine the existing Cipher RAT dashboard UI using the
current HTML, CSS, and JavaScript project. This document is the visual
reference for a model that cannot inspect the original screenshot.

The goal is to improve the existing implementation, not rebuild the
application unnecessarily. Preserve existing functionality and
integrations.

## 1. Overall Visual Direction

A polished, dark cybersecurity lab dashboard with a compact, organized,
technical appearance. Use restrained gradients and subtle blue borders.
Avoid excessive glow, oversized typography, clutter, and inconsistent
spacing.

### Color palette

  Purpose                        Color
  ------------------------------ -----------
  Main page background           `#080D18`
  Sidebar and panel background   `#0D1627`
  Raised panel / table header    `#121E32`
  Subtle border                  `#1D304D`
  Primary blue                   `#3478FF`
  Secondary purple               `#633BFF`
  Cyan accent                    `#24B8F0`
  Violet accent                  `#A35BFF`
  Main text                      `#F4F6FF`
  Secondary text                 `#A1B5DB`
  Muted text                     `#778BAF`
  Success green                  `#4BEA91`
  Danger red                     `#FF4566`

These are target values; small adjustments are acceptable to maintain
consistency with existing styles.

### Typography and shape

-   Use a clean sans-serif font such as Inter, system UI, or the font
    already included in the project.
-   Main page title: approximately 34--38px, bold.
-   Panel titles: approximately 16--18px, semibold.
-   Body and navigation text: approximately 14--16px.
-   Supporting labels: approximately 12--13px.
-   Use 8px-based spacing increments where practical: 8, 12, 16, 24, and
    32px.
-   Panel corner radius: approximately 10--14px.
-   Buttons and inputs should have consistent heights, padding, border
    radii, and focus states.
-   Borders should be subtle and visible against the dark background.

## 2. Desktop Layout

Reference viewport: approximately **1648 × 927px**.

Build a three-column dashboard:

1.  **Left navigation sidebar:** approximately 275px wide, full viewport
    height.
2.  **Main content:** flexible width, containing the page header, four
    statistics cards, and Recent Activity panel.
3.  **Right details/actions panel:** approximately 430px wide.

Use CSS Grid for the overall layout where appropriate. Keep consistent
gaps between the main content and right panel. Avoid accidental overlap,
horizontal overflow, or large unexplained empty margins.

The page header begins near the top of the main content. The statistics
cards appear in a single horizontal row on wide screens. The Recent
Activity panel occupies most of the remaining main-content height.

On narrower screens, allow the right panel to move below the main
content, reduce the statistics grid to fewer columns, and provide a
sensible mobile navigation treatment.

## 3. Left Navigation Sidebar

### Brand header

At the top of the sidebar:

-   Blue shield icon.
-   Brand text: **CIPHER RAT**.
-   "CIPHER" is white; "RAT" is bright blue.
-   A thin horizontal divider below the brand.

### Navigation items

Display icon-and-label rows in this order:

1.  Dashboard
2.  Payload Generator
3.  Clients
4.  Data Storage
5.  Settings

Inactive items use muted blue-gray icons and text. The active Dashboard
row uses a blue-to-purple gradient, a thin blue outline, rounded
corners, and white text. Use consistent icon size and alignment.

### Server status card

Anchor a bordered card near the bottom of the sidebar. It contains:

-   Server icon.
-   Green status indicator and text: **Lab server: Running**
-   **Port:** 8443
-   **Connected clients:** 0

Keep this card inset from the sidebar edges, with clear line spacing and
readable labels.

## 4. Main Page Header

At the upper-left of the main content:

-   A pale blue pie-chart/dashboard icon.
-   Large title: **Dashboard**
-   Subtitle: **Local lab environment • Monitor clients, generate
    payloads and manage data.**

Place a compact square theme-toggle button with a sun icon at the
top-right of the overall page. It should have a subtle border and
rounded corners.

## 5. Statistics Cards

Display four equally sized cards in one row on desktop, with even gaps:

### Card 1 --- Connected Clients

-   Blue icon tile with a users icon.
-   Label: **Connected Clients**
-   Value: **0**
-   Caption: **Total active connections**

### Card 2 --- Payloads Generated

-   Purple icon tile with a document/file icon.
-   Label: **Payloads Generated**
-   Value: **0**
-   Caption: **Total payloads created**

### Card 3 --- Files Stored

-   Cyan/blue icon tile with a database icon.
-   Label: **Files Stored**
-   Value: **0**
-   Caption: **Total files in storage**

### Card 4 --- System Uptime

-   Violet icon tile with a clock icon.
-   Label: **System Uptime**
-   Value: **00:00:00**
-   Caption: **Since server start**

Each card uses a dark raised surface, subtle blue border, consistent
padding, and a clear hierarchy between label, large value, and caption.
Keep card heights and internal alignment consistent.

## 6. Recent Activity Panel

Place a large bordered panel beneath the statistics cards. It should
expand to use the remaining available main-content height.

### Panel header

-   Blue lightning icon.
-   Title: **Recent Activity**
-   Right-aligned **View All** button with a right-chevron icon.

### Activity table

Use a table header with a slightly lighter dark background and these
columns:

-   `#`
-   `Event`
-   `Time`

Initial activity row:

-   Number: `1`
-   Green status dot.
-   Event: `Lab service started on port 8443`
-   Time: `Just now`

Use thin horizontal dividers. Keep table headers muted and table content
bright enough to read.

### Empty-state area

Below the existing row, center a restrained empty-state illustration
consisting of a document icon inside a faint circular outline, followed
by:

**No more activity yet**

Supporting text:

**Events and client activity will appear here as they happen.**

The empty state should be centered in the remaining panel space without
covering the table or causing overflow.

## 7. Right Panel --- Client Details

At the top of the right column, create a bordered card titled **Client
Details**.

Header: - Blue user icon. - Bold title. - Close `X` icon aligned to the
right. - Thin divider beneath the header.

Display these seven rows, each separated by a subtle horizontal border:

  Label              Initial value
  ------------------ ---------------
  Client ID          ---
  IP Address         ---
  Operating System   ---
  Hostname           ---
  Username           ---
  Platform           ---
  Connection Time    ---

Labels align left; values align right. Keep rows evenly spaced and avoid
wrapping values unnecessarily. The initial state indicates that no
client is selected.

## 8. Right Panel --- Lab Actions

Place a second bordered card directly below Client Details, with a
wrench icon and the title **Lab Actions**.

### Action buttons

Use a two-column grid with consistent gaps:

  Button               Visual treatment
  -------------------- ----------------------------------------------
  Screenshot Preview   Blue-to-purple primary gradient; camera icon
  Command Console      Purple primary gradient; terminal icon
  File Browser         Dark blue secondary surface; folder icon
  Input Test           Dark purple secondary surface; keyboard icon

Buttons should have consistent heights, compact icons, legible labels,
and restrained borders. Do not invent or change their behavior; preserve
the existing event handlers.

Below the grid, add a full-width danger-style button:

-   Red power icon.
-   Label: **Disconnect**
-   Dark red translucent background and red border/text.

Preserve its existing functionality and do not connect it to any new
backend behavior.

### Console Output

Below the action buttons:

-   Document/terminal icon.
-   Label: **Console Output**
-   Dark bordered output region with a fixed or controlled height.
-   Placeholder text: `Output will appear here...` in muted, monospaced
    text.

At the bottom, include a compact **Close** button with a subdued
slate-colored background and border.

Keep the card compact enough to fit within the desktop viewport where
practical. If content exceeds available height, use sensible page
scrolling rather than clipping essential controls.

## 9. Icons

Use the project's existing icon library if one is already present.
Otherwise, use a single consistent icon set, such as Lucide, or simple
inline SVG icons.

Suggested icons:

-   Shield: brand
-   House: Dashboard
-   File/text document: Payload Generator
-   Users: Connected Clients and Client Details
-   Database: Files Stored and Data Storage
-   Gear: Settings
-   Pie chart: page title
-   Sun: theme toggle
-   Lightning bolt: Recent Activity
-   Clock: System Uptime
-   Wrench: Lab Actions
-   Camera: Screenshot Preview
-   Terminal: Command Console
-   Folder: File Browser
-   Keyboard: Input Test
-   Power: Disconnect

Avoid mixing emoji, mismatched icon styles, and inconsistent icon sizes.

## 10. Responsive Behavior

### Wide desktop

-   Three-column layout.
-   Four statistics cards in one row.
-   Action buttons in two columns.

### Tablet

-   Keep navigation usable.
-   Allow the right panel to move beneath the main dashboard if needed.
-   Use two statistics cards per row.

### Mobile

-   Prevent horizontal scrolling.
-   Use a compact or collapsible navigation sidebar if the project
    supports it.
-   Stack statistics cards in one or two columns depending on available
    width.
-   Stack the right-side panels beneath Recent Activity.
-   Keep action buttons easy to tap.
-   Ensure table content remains readable.

## 11. Implementation and Preservation Rules

-   Inspect the existing project before editing.
-   Preserve current filenames, stylesheet links, IDs, classes,
    JavaScript event handlers, and working integrations wherever
    possible.
-   Do not replace the whole application merely to achieve the visual
    redesign.
-   Fix incorrect stylesheet paths, conflicting selectors, and layout
    bugs if discovered.
-   Prefer reusable CSS variables for colors, spacing, radii, and
    borders.
-   Prefer CSS Grid and Flexbox over fragile absolute positioning.
-   Avoid unnecessary `!important` declarations.
-   Do not add frameworks or external dependencies without a clear need.
-   Do not invent functionality for controls whose behavior is
    undefined.
-   Do not remove existing functionality just because it is not visible
    in the design reference.
-   Keep changes focused and report any unverified behavior.

## 12. Validation Checklist

After implementation:

-   [ ] The stylesheet loads successfully.
-   [ ] The sidebar, main content, and right panel align correctly.
-   [ ] The four statistics cards have consistent sizes and spacing.
-   [ ] Recent Activity fills the available main-content area without
    overlap.
-   [ ] Client Details rows align consistently.
-   [ ] Action buttons form a neat two-column grid.
-   [ ] Colors, borders, typography, and radii are consistent.
-   [ ] No unintended horizontal scrolling occurs.
-   [ ] Existing interactions still work.
-   [ ] Browser console shows no new errors.
-   [ ] The result has been checked at desktop, tablet, and mobile
    widths.

## Acceptance Criteria

The result should look like a coherent, polished dark dashboard based on
this specification while remaining a functional improvement to the
existing project. Prioritize visual consistency and preserving existing
behavior over adding new features.
