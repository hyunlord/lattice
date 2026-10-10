# Repository image references

A lens may map a node to a repository-local image or rectangular atlas frame. No image service or additional dependency is required.

```yaml
presentation:
  media:
    field: icon
    nodes:
      'example:seed':
        path: art/items.png
        alt: Seed packet
        frame: { x: 16, y: 32, width: 16, height: 16 }
```

`field` selects an attribute containing a path string or the same `{path, alt?, frame?}` object. `nodes` overrides that attribute for an exact graph node ID. Atlas coordinates use pixels from the top left of the original image. Width and height must be positive integers; x and y are nonnegative integers. The viewer clips the original image to this rectangle; export does not generate modified images.

The asset resolver accepts PNG, JPEG, WebP, GIF, SVG and AVIF. Only existing regular files physically inside the repository are published. Absolute paths, remote URLs, path traversal and symlinks escaping the repository are not published. Missing or unreadable files become `status: missing` entries with the source path and reason, so an unavailable thumbnail does not invalidate the graph.

The `media.json` manifest maps node IDs to available URLs, original repository paths and SHA-256 hashes, with optional frame and alt text. Available assets use content-addressed `media/<sha256>.<extension>` URLs. Identical bytes share one exported file. The same manifest and URLs are used by the local server and static export; image bytes remain separate from graph JSON. The hash describes the image bytes, not an AI interpretation or runtime implementation claim.
