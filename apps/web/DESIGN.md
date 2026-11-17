# Design

## Replacement direction

A flat, blue analytical desk, not a stack of dashboard cards. The rejected design repeated page names in an account bar and again in the content, enclosed every section in a rounded card, and gave explanations the same weight as results. This replacement separates navigation, account context and the working document into three unambiguous regions.

## Workspace composition

- A 196px cool-neutral navigation rail spans the workspace height. Original 号来 / Phoenix artwork leads the rail; active navigation uses solid bright blue, not a pale card. History, data refresh and missing-panel warnings remain available below navigation.
- The working document uses a white canvas in light mode and charcoal in dark mode. A compact utility line carries account identity, source server, level, account switching and theme controls. It never repeats the page heading. 天真工具箱 remains a real home link.
- Exactly one primary page heading lives inside each loaded shared business page. 26px on phones, up to 34px on desktop. Rules are subordinate but remain fully accessible. No slogan, decorative eyebrow or invented analytics.
- Main content uses ruled sections, plain tables and aligned rows. Rounded surfaces are reserved for controls, real media items and protected dialogs, not section scaffolding. Filters and results become distinct adjacent working regions where appropriate.
- Desktop analysis content has fluid 24–48px insets. Mobile uses a 16px gutter, normal document scrolling and the existing labelled drawer. Account metadata wraps rather than forcing page overflow. Shared pages remain the sole implementation for both Web and desktop.

## Page structure

- Empty account entry remains one large link input with paste/read actions, no navigation, slogan or page heading. Original branding, theme, errors, login/session handling and history clearing remain. Loaded overview is a ruled account data sheet, not repeated statistic cards.
- Speed: title, task toolbar and result evidence; all six slot values remain visible. Independent configurations retain reorder, edit, delete, presets and slot details.
- PVE: scores are compared in a real table; setup/rules and output have different regions. Damage comparisons are tabular rather than nested cards, reflowing into compact tables on phones.
- Skills: search and counts lead a compact grouped roster. Empty groups are short truthful status rows, not large blank panels. Hero artwork, duplicate counts, skills and modes remain.
- Relics: desktop filter rail beside inventory; phone filters precede results. Every property, slot, sort/reset control and detail action remains.
- Calculator: retain the original full-width configuration form above the results, not a sidebar/results split. Restore the original responsive condition grids and tabular results. All conditions, rules, saved plans, exclusions and execution modes remain. Keep one page heading consistent with the shared shell. Source metadata sits in that header; ruled condition groups lead to a muted execution strip with the mode switch and one start action. Saved configuration actions stay secondary; method documentation follows the results.
- Collections: category rail on desktop and wrapping choices on phones, followed by a media gallery without enclosing nested cards. Real ownership, names, correct ratios, missing-art recovery and pagination remain.

## Controls and verification

Route changes use one 200ms content entrance (55% to full opacity, 6px upward settle). Navigation and account context stay still. On Web, menu selection responds optimistically to client navigation before route content is ready, then reconciles with the actual pathname; modified clicks keep native new-tab behavior. Clicking a Web menu immediately starts a 120ms upward fade of the current document while fetching the target in parallel. A centered global status appears after that departure if navigation is still pending and clears when the transition finishes, including after the mobile drawer closes. Fast routes skip the status; reduced motion skips the departure and status delay. Keep navigation available for a newer selection. Cancel interrupted entrances without delaying navigation or remounting page content; skip the effect for reduced motion. Web and desktop use the same shared container.

Bright blue remains the primary action/selection color. Red is only an error or destructive semantic. Light/dark controls retain contrast, focus outlines, keyboard behavior, accurate labels and 44px phone hit targets. No new dependencies, new backend logic or reduced information. Verify actual rendered light/dark desktop and 320/390px layouts with real account data, not only TypeScript or synthetic fixtures. Existing regression assertions must not be weakened to disguise layout failures.
