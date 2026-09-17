# Login and signup: gstack iOS design review

**Outcome: DONE.** The requested simplification is present: signup reads **Create your account**, login reads **Log in**, marketing subtitles are removed, and the header and form spacing are consistent. Signup clearly states **7 days of Plus · 20 total checks**, with no card needed and no automatic charge. No unintended clipping, overlap, or missing section appears in the reviewed captures.

Reviewed on 2026-09-16 using the `gstack-ios-design-review` ten-dimension rubric. Scope is the current login/signup source and three iOS simulator screenshots at standard text size in light mode. No app edits, authentication submissions, or additional runtime tests were performed by this reviewer.

Evidence: [login](02-login-simple.png), [signup top](04-signup-simple.png), and [signup bottom](05-signup-simple-bottom.png). Login fits through its signup link. Signup's top capture ends within the scrolling social-button section; the overlapping bottom capture shows both complete social buttons and the Log in footer. The partially scrolled heading in the bottom capture is expected viewport clipping.

| Dimension | Assessment | Evidence / remaining limit |
| --- | --- | --- |
| Typography hierarchy | 9/10 | Direct headings, visible field labels, and a separate trial note make the task easy to scan. Larger accessibility text was not tested for these screens. |
| Spacing rhythm | 9/10 | Shared 20pt gutters, 16pt form gaps, and 20pt section spacing remove excess header space without crowding fields. |
| Color hierarchy | 9/10 | Forest identifies primary actions; sage identifies headers; lavender separates signup terms. Dark mode and color-vision simulation were not reviewed. |
| Touch targets | 9/10, source | Shared primary buttons have a 56pt minimum height. Signup's inline Log in now has a 44 × 44pt minimum; back and recovery controls retain their existing targets. Physical hit-testing was not performed. |
| Loading, empty, and error states | Unverified | Loading and error handling remain in source, including alert roles. No form was submitted, so these states were not captured. Empty-state treatment is not applicable to these forms. |
| Accessibility | Partial | Headings, input labels, button roles, and error alerts remain. Full text scaling, wrapping footers, and keyboard-aware scrolling are preserved in source. VoiceOver, keyboard-open layouts, and largest text sizes remain unverified. |
| Animation discipline | N/A | The reviewed layouts contain no new animation. |
| iOS convention alignment | 9/10 | Safe areas, back navigation, native fields, password visibility controls, and scrolling remain familiar. No keyboard interaction was exercised. |
| Information density | 9/10 | Marketing paragraphs are gone. The remaining trial terms explain the offer before signup, while all actions remain available in the captured scroll sequence. |
| Distinctiveness / generic-design check | 8/10 | The real logo and existing forest/sage/lavender palette retain identity within appropriately conventional auth forms. No unnecessary illustration or decoration was introduced. |

The implementing agent reports that authentication handlers were untouched and that typecheck and diff checks passed. Only the screens were viewed; no account creation, login, or social authentication was submitted. The simulator was left on signup at the top.

Keep the current implementation. The evidence supports this bounded layout change, not a full authentication or accessibility audit. Physical-device behavior, smaller phones, dark mode, VoiceOver, and large-text/keyboard combinations remain outside this review; it does not guarantee Apple App Review approval.

Durable-learning review: no new durable learnings were identified in this bounded change.
