# Semantic color system: gstack iOS review

**Status: DONE.** No blocking color or layout issue was found in the nine requested native captures. State labels, icons, and switch positions reinforce color; neutral body text on semantic soft fills matches the brief. No displayed state contradicts its label or selected control in these samples.

Reviewed on 2026-09-16 using the relevant parts of the `gstack-ios-design-review` rubric: color hierarchy, readable typography, state communication, and spacing. This was a read-only review of simulator PNGs plus the theme, protection summary, badges, comment rows, and Filters source. No simulator interaction, account operation, or app edit was performed by this reviewer.

## Screen assessment

Scores are design judgments out of 10, not accessibility certification. Remaining checks are listed below rather than assumed to pass.

| Screen / captured states | Color hierarchy | Readability | State clarity | Spacing | Evidence |
| --- | ---: | ---: | ---: | ---: | --- |
| Home: active light/dark, paused light | 9 | 9 | 9 | 9 | Green protection, amber paused card/badge, and blue normal usage are distinct. The paused switch is off and the text offers a next step; active samples show the on switch and protection label. |
| Log: Hidden and Deleted, light | 9 | 9 | 9 | 9 | Reason badges retain readable labels. Concealed deleted comments use neutral panels; permanent erasure uses red. Tab selection stays in the brand color. |
| Filters: actions light, category toggles light/dark | 9 | 9 | 9 | 9 | Selected controls use brand styling; irreversible-mode explanations use amber, informational hints use blue. Green on tracks and gray off tracks remain distinct, with thumb position providing another cue. |
| Connected accounts: light | 9 | 9 | 9 | 9 | Active Instagram has a green label/check; disabled Add account and TikTok Coming soon are neutral. Disconnect remains visibly destructive. |

Capture coverage: [Home light](images/home-light.png), [Home dark](images/home-dark.png), [Home paused](images/home-warning.png), [Hidden log](images/log-light.png), [Deleted log](images/log-deleted-light.png), [Filters actions](images/filters-light.png), [Filters toggles light](images/filters-toggles-light.png), [Filters toggles dark](images/filters-toggles-dark.png), and [Connected accounts](images/accounts-light.png). Every linked capture was visually inspected.

There is no unintended overlap or clipped state label in the shown viewports. Partial content at the top/bottom of scrolled Filters, the lower Hidden list, Home's following sections, and the account permissions note is normal viewport cropping. These captures do not establish complete bottom-of-screen coverage for every long screen. Hidden comment previews are intentionally limited to one line in source.

## Source and validation evidence

- Protection source preserves state priority: loading and offline are amber and cannot claim verified protection; unconnected setup is informational; verified active coverage is green. Paused, reconnect, quota, and plan-limit conditions remain amber. Pending/loading amber follows the user's explicit requirement. The paused capture is visual evidence of an amber attention state; pending and offline were checked in source, not captured here.
- Semantic foreground/fill contrast calculations have minimum ratios of **5.19:1 in light mode** and **6.99:1 in dark mode**. These concern the five semantic text/fill pairs, not every rendered component or state. The current light `textFaint` token is `#596760`; token references and template placeholders render as real text/colors in the supplied captures.
- Root ran **28 tests successfully**, including six new theme-contrast checks, and `npm run typecheck` plus `git diff --check` passed. This reviewer did not rerun that suite. The earlier scoped protection suite passed all 12 cases, including preservation of state priority and the revised tone assertions.
- Bodies use `text`/`textMuted`, while semantic labels, borders, icons, and fills carry status. Navigation and actual actions retain brand styling. This separation is intentional and does not require turning all body copy into a status color.

## Limits and disposition

Keep the current color mapping. Physical hardware, VoiceOver, color-blindness visual simulation, smallest-phone layouts, and dynamic interaction were not tested in this review. The captures verify only their shown themes and states; Log and Accounts dark mode, live loading/error transitions, and large-text behavior are not certified here. The remaining gstack dimensions, including animation, asynchronous states, and runtime touch behavior, are outside this color-focused evidence. No Apple App Review approval is implied.

Large-text follow-up: the iOS category `accessibility-extra-extra-extra-large` and React Native fontScale 3.571 were confirmed, but live screenshots did not show a visual increase. Attempts to verify a cold reload lost the Expo Go inspection connection. This is inconclusive; the additional large-text files are not counted as Dynamic Type evidence. The simulator was restored to the standard `large` category. This color change does not certify large-text typography.

Durable learning: a sample preview with the backend disabled is useful visual verification, not evidence of a real account connection or live moderation. Sample counts, account status, and historical TikTok rows must be described as fixtures rather than production activity.


## Browser preview validation

The separate HTML review page uses exact theme tokens and is explicitly labeled as a component preview. Gstack's built-in browser verified light/dark switching, a switch's visual/accessible state update, all nine local screenshot loads, local Manrope loading, no page overflow at widths 1440 and 390, and no console errors. Native screenshots use sample data with backend connections disabled. The page is available at [index.html](index.html).

The color tests apply the [WCAG normal-text contrast target of 4.5:1](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html). They cover all semantic foreground/fill pairs, standard text/secondary/placeholder tokens on supported fills, primary CTA text, inactive navigation text, and 3:1 switch track contrast against both thumb and adjacent surfaces. This is color-pair verification, not a full app accessibility certification.
