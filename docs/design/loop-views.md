# Generic loop, focus, and catalog views

The user-approved [reference HTML](l7-prototype.html) is preserved verbatim. It supersedes the initial island overview for L7. Its structure is ported into generic viewer components; its embedded data and domain branches are not production inputs. Production uses the graph and consumer lens. System fonts replace the reference's external font requests.

`presentation.loop` selects the home experience:

- `title`, `subtitle`, `lead`, `center: {title,description}`, and `defaultStage` control headings and initial selection.
- `stages: [{id,title,summary,unit,kinds,systemIds,groupBy?}]` selects member kinds and related system IDs. Original IDs are accepted across data revisions. Group values use presentation facet labels. Empty stages remain visible.
- `flows: [{source,target,label,tone?,auxiliary?}]` names directed primary and auxiliary arrows. These are authored lens interpretations, not inferred execution.
- `relationGroups: [{label,side,kinds?,steps:[{edgeKinds,direction}]}]` selects focus groups. `side` is left/right; each traversal step is in/out. Multi-step traversal supports shared inputs without domain logic. Results exclude the focus node and deduplicate identities. A group shows six nodes then an explicit remainder control and full list.
- `catalogKinds`, `summaryFields`, `statusFacet`, `statusLabels`, and `kindStyles` control catalog membership, summaries, status, and shape/color. Status defaults to unknown. A program-presence marker is not runtime observation.
- `strips: [{title,description,kinds}]` and `places: {title,description,kinds}` provide optional supporting lists from the same nodes.

Without stage configuration, code-module folders become stages (file folders when no modules exist) and resolved imports become arrows labeled with their actual counts. No imaginary cycle is added. Modules and extracted types/functions remain available in focus and catalog. The same viewer serves all repositories. `--no-lens` explicitly inspects a repository that already has a lens using automatic extraction.

The evidence disclosure holds source revision, graph hash, input scope, layers, and raw views. AI summaries carry attribution, source links, and stale status; they never replace source facts. See [interpretation workflow](../review/l7-interpretation.md) and [image references](media-references.md).

The approved prototype's 163 content records and 28 program bindings are an oracle for its pinned source revision, not permanent data-count gates. Consumer verification compares exact IDs and focus connections when given the reference. Data changes must update the comparison evidence instead of changing expectations silently.
