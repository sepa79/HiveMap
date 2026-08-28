# Verification Evidence

This directory contains bounded review evidence for user-visible behavior that
cannot be established by typechecking alone.

## Ruleset-v2 authentication panel

![HiveMap tab-scoped authentication panel](ruleset-v2-auth-token-panel.png)

Captured from the built web application at 1440×1000 after the token lifecycle
change. The panel keeps a password input, explicit Set/Clear actions, and the
visible statement that storage lasts only for the current browser tab.

Interaction behavior is covered by
`apps/web/src/AuthTokenPanel.test.tsx`: save writes `sessionStorage`, authenticated
requests attach the bearer header, and clear removes both stored and visible
token state.
