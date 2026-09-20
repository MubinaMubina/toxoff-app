# toxoff mascot

- `../toxoff-mascot-icon-1024.png` is the user's original `newicon.jpeg`, converted to an opaque 1024 × 1024 PNG without changing its artwork. It is also exported verbatim as `../icon.png`.
- `toxoff-mascot.png` is the matching transparent 1254 × 1254 cutout, made with the built-in image-generation tool. Its generation instructions are in `prompt.txt`.
- Keep the lavender comment bubble blank. Do not add a check mark, text, or another symbol.
- The shared `LogoMark` uses the original icon in app headers. `Mascot` uses the transparent artwork on the welcome screen.

Run `npm run gen:assets` to export platform assets. The Node exporter uses the image tooling already installed with Expo. It preserves the icon master and packages the cutout into the splash, Android adaptive foreground, and white notification silhouette. Rebuild native apps after changing launcher or launch-screen images.
