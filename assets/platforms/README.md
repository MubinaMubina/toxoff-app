# Platform icons

`instagram.png` and `tiktok.png` are transparent PNGs prepared from the user's
`instanew.jpeg` and `tiktoknew.jpeg` references. The baked checkerboard was
removed with the image-generation tool, preserving the full-color marks.

`PlatformIcon.tsx` bundles both assets locally, without tinting. Its white tile
keeps the black TikTok note visible in both light and dark appearances. These
platform brand colors are separate from toxoff's semantic UI colors.
