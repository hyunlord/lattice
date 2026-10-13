# L12 five-minute human test: frozen questions

Frozen before inspecting the three new repositories or changing the product. These same five questions apply independently to each repository below. Questions must not be rewritten after implementation; corrections require an explicit dated erratum.

## Questions (five minutes total)

1. What does this repository provide, and who or what uses it?
2. Name its three most important components and explain each component's responsibility in one sentence.
3. Describe two directed dependencies between those components: which component uses which, and for what?
4. Where would you start reading to understand its primary execution or public API? Give a file or symbol and explain why.
5. Trace one representative operation from its entry through at least two subsequent steps. Identify the files or symbols supporting the trace; distinguish a confirmed call from an inferred architectural step.

## Repositories

Gallery: junegunn/fzf, encode/httpx, BurntSushi/ripgrep, android/nowinandroid, spring-projects/spring-petclinic, excalidraw/excalidraw.

User-selected test: huggingface/smolagents, pocketbase/pocketbase, outline/outline.

## Test order and decision (user-selected protocol)

For each user-selected repository, open Lattice first without reading the source, README, DeepWiki, reference answers, or this repository's other study results. Spend at most five minutes on the five questions. Save the verbatim answers and elapsed time before opening comparison material. Only then inspect DeepWiki and README/GitHub and judge whether those would have helped more quickly. Do not time this second stage as an unbiased head-to-head experiment: prior exposure creates a learning effect.

Final question for each repository: **Next time I encounter an unfamiliar repository, would I open Lattice instead of DeepWiki?** Record yes/no and the user's reason. Accuracy and time are descriptive supporting records, not numerical acceptance thresholds. The user owns the verdict.

If fewer than two of the three final answers are yes, stop new feature development and retain maintenance only for MCP and CI differences. Issues #100 and #102 and full builds of repositories with at least 50,000 files remain outside this scope and open.

Reference answers are private local evaluation artifacts until the user has completed the tests. Do not publish them in this directory, the gallery, issues, PRs, previews, screenshots, or chat before completion. Source-grounded product summaries remain ordinary map content, not reference answer sheets.
