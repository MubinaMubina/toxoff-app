# Mascot update verification

- `welcome-light.png` and `welcome-dark.png`: iPhone 17 Pro simulator captures of the updated welcome screen. The original character holds a blank lavender comment bubble. Both actions and the free-plan caption remain visible.
- `npm run typecheck`: passed.
- `npm run gen:assets`: passed. Icon 1024 × 1024, adaptive foreground 1024 × 1024, favicon 196 × 196, splash 1284 × 2778, notification 96 × 96. The icon is opaque and byte-identical to the approved PNG master; the cutout and Android foreground have transparency.
- Local ignored iOS icon and launch-image catalogs were refreshed from the exported PNGs. The installed app's in-app artwork was checked through Metro. A native rebuild could not run because this checkout has no `ios/toxoff.xcworkspace` or installed `ios/Pods` directory; installed launcher/launch-screen updates remain for the next native build.

The light-mode screenshot used an in-memory theme change; it did not change the saved theme preference.
