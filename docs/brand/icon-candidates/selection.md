# Clarifold icon selection decision

## Human decision

On 2026-07-25, Jerome Queck selected the **Learning Trail** direction from the review packet for focused refinement. The selected exploratory source asset is [`learning-trail.png`](learning-trail.png), with derived previews in [`previews/`](previews/) and dark/light context comparisons in [`context/learning-trail.png`](context/learning-trail.png).

This is the only candidate promoted for the current Clarifold application identity. The source remains an AI-assisted asset with a retained provenance record; no uniqueness, registration, or trademark-clearance claim is made. The other candidates remain unchanged in this packet for future review:

- **Mirror** — retained as a calm reflective alternative.
- **Proof structure** — retained as the explicit claims-and-dependencies alternative.
- **Unfolding surface** — retained as the most distinctive clarity-through-unfolding alternative.

No retained candidate is rejected or deleted. A future review may revisit any of them if Learning Trail refinement does not satisfy the production gates.

## Why Learning Trail

Learning Trail connects most directly to the product's established Learning Trail language and communicates visible, revisitable progress without a finish-line or mastery claim. Its loop and waypoint silhouette remain recognizable at 32 px, while the central turn preserves an inspectable gap rather than a completion badge.

The unresolved risk is recognition: the inner turn can be read as an arrow or generic progress indicator. The mark must therefore be tested without relying on its teal, violet, or amber colors, and the refinement must not add an arrowhead, success check, or other mastery signal.

## Required gates before production use

Before the selected direction becomes an official app, repository, or release asset:

1. Produce native macOS icon resources from the retained source while preserving editable source artwork and the provenance record.
2. Test the refined mark at the packet's 16, 32, 64, 128, 256, 512, and 1024 px review sizes on light and dark surfaces, including color-independent recognition and contrast.
3. Complete accessibility and unfamiliar-viewer recognition review, specifically checking the arrow/progress interpretation and any implication of guaranteed mastery or correctness.
4. Complete the Clarifold brand/trademark and rights-chain review. The current provenance supports exploratory retention but does not establish uniqueness, copyright registration, trademark clearance, or official-brand clearance.
5. Wire the approved native assets into the application and packaging only after gates 1–4, then verify the packaged app and release provenance on the exact candidate bytes.

Before the production wiring review below, the selected direction was **selected for refinement**, not an official logo. The future candidates remain available in this review packet and must not be silently replaced or discarded.

## Production wiring review

Issue #100 completed the engineering gates for the current internal evaluation candidate on 2026-07-25:

1. `scripts/generate-clarifold-icon.mjs` derives a transparent-edge renderer PNG and a native `Clarifold.icns` from this selected source. The committed iconset contains the 16, 32, 64, 128, 256, 512, and 1024 px review sizes, including the required macOS `@2x` representations. The source digest and generation contract are recorded in [`clarifold-icon-manifest.json`](../../../src/renderer/src/assets/clarifold-icon-manifest.json).
2. Review of the generated mark at 16, 32, 64, 128, 256, 512, and 1024 px found the loop and central opening remain recognizable on light and dark surfaces. The grayscale review retains the silhouette and central gap without relying on the teal, violet, or amber accents. The transparent outside edge leaves the macOS mask to the platform rather than retaining black corner fill.
3. The selected source has no reference images or third-party artwork. The rights-chain review records the source and generation method, but does not claim uniqueness, copyright registration, trademark clearance, or a general brand licence. Serious commercial promotion and any future clearance decision remain governed by [`ADR-0040`](../../adr/0040-reserve-the-clarifold-brand-and-plan-singapore-first-clearance.md).
4. Electron Forge packaging now points at `Clarifold.icns`, and the renderer Brand surface uses the same generated PNG. `npm run branding:icon:check` validates the source digest, dimensions, iconset contents, and `.icns` round trip before packaging.

The selected Learning Trail asset is therefore the official current Clarifold application identity for this source-available internal candidate. This does not make the candidate a signed or notarized public distribution asset, and it does not authorize modified distributions to retain the Clarifold name or icon.
