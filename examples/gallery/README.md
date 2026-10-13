# Public repository gallery

These six public source snapshots are gallery inputs, not special cases in the analyzer. Their commits match the L11 registration. Display descriptions and stack labels here are editorial navigation metadata; each map supplies its own source-backed analysis and limitations. The optional game lens is linked separately.

Build the producer first, then run:

```sh
npm ci --ignore-scripts
npm run build
node tools/build-gallery.mjs \
  --manifest examples/gallery/repositories.json \
  --output /tmp/lattice-gallery-site \
  --sources /tmp/lattice-gallery-sources \
  --cache /tmp/lattice-gallery-cache
```

Existing clean Git checkouts at `<sources>/<id>` are reused only when HEAD exactly matches the manifest commit. Missing checkouts are initialized and fetched shallowly by exact SHA over public GitHub HTTPS. There is no branch lookup, target installation, target build, submodule update, or LFS download. Source checkouts, generated caches, and exported output must be separate directories. The builder invokes the existing Lattice CLI with raw argument arrays, `--no-lens`, and an external cache. It does not modify existing source checkouts.

An output directory must be absent or owned by a previous gallery build. Each map retains the CLI's export ownership and evidence contracts. Failed builds exit nonzero and are never uploaded by the workflow. Re-running uses the same sources and external caches.

`.github/workflows/gallery.yml` uses GitHub-hosted Ubuntu, pinned actions, and Node 22; the normal Core workflow retains Node 20/22/24 checks. The gallery workflow runs `npm run check` and installed-package smoke checks before building the gallery, uploads a Pages artifact, then deploys from `main` with job-scoped Pages and OIDC permissions. Before first deployment, repository Pages must use **GitHub Actions** as its build source and the `github-pages` environment must permit `main`. The workflow does not change those repository settings. A manual workflow run on another branch can build/upload for inspection but cannot deploy.

Smoke verification: `node --test tests/gallery.test.mjs` after the producer build. Public URL availability and desktop/mobile navigation must still be verified after deployment; a successful local export is not public-site evidence.
