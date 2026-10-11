# L9 frozen benchmark: ripgrep

Repository: https://github.com/BurntSushi/ripgrep
Commit: `3fce3b5bb0236da2df6d99672afb8a719642eca7`

Questions frozen before any Lattice output inspection. Answers derived only from the pinned source. No implementation or benchmark run informed these questions.

Representative action: 기본 CLI 텍스트 검색

Purpose: gitignore 등을 존중하며 디렉터리를 재귀적으로 정규식 검색하는 CLI.

## structure

주요 패키지 또는 모듈과 각 역할은 무엇인가?

루트 ripgrep 패키지의 rg 바이너리와 workspace 라이브러리 10개(총 11 package)다. grep은 검색 라이브러리 묶음, grep-cli는 CLI 지원, grep-matcher는 매처 계약, grep-regex/grep-pcre2는 엔진, grep-searcher는 검색, grep-printer는 출력, ignore/globset은 파일 선택, grep-index는 선택적 인덱싱이다.

Evidence:
- [Cargo.toml:1–9](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/Cargo.toml#L1-L9)
- [Cargo.toml:30–51](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/Cargo.toml#L30-L51)
- [crates/grep/Cargo.toml:1–23](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/grep/Cargo.toml#L1-L23)
- [crates/searcher/Cargo.toml:1–21](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/searcher/Cargo.toml#L1-L21)
- [crates/printer/Cargo.toml:1–25](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/printer/Cargo.toml#L1-L25)
- [crates/index/Cargo.toml:1–10](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/index/Cargo.toml#L1-L10)

## dependencies

어떤 내부 패키지 또는 모듈이 어떤 다른 내부 패키지 또는 모듈을 사용하는가?

ripgrep → grep·ignore·선택적 grep-index; grep → grep-cli·grep-matcher·grep-printer·grep-regex·grep-searcher·선택적 grep-pcre2; ignore → globset; grep-cli → globset; grep-regex/grep-pcre2/grep-searcher → grep-matcher; grep-printer → grep-matcher·grep-searcher. dev 의존은 별도 표기한다. 하이픈 crate명과 Rust underscore import명을 대응해야 한다.

Evidence:
- [Cargo.toml:57–62](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/Cargo.toml#L57-L62)
- [crates/grep/Cargo.toml:18–23](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/grep/Cargo.toml#L18-L23)
- [crates/ignore/Cargo.toml:24–24](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/ignore/Cargo.toml#L24-L24)
- [crates/cli/Cargo.toml:19–19](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/cli/Cargo.toml#L19-L19)
- [crates/printer/Cargo.toml:24–32](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/printer/Cargo.toml#L24-L32)
- [crates/searcher/Cargo.toml:21–27](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/searcher/Cargo.toml#L21-L27)

## entry

제품 실행 또는 공개 API 사용은 어디에서 시작하는가? 근거 파일과 줄을 제시하라.

Cargo [[bin]] rg의 path crates/core/main.rs, 함수 main. main은 flags::parse 결과를 run에 전달한다.

Evidence:
- [Cargo.toml:30–33](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/Cargo.toml#L30-L33)
- [crates/core/main.rs:44–46](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/core/main.rs#L44-L46)

## flow

대표 동작이 어떤 저장소 내부 함수들을 거치는가? 호출 순서와 근거를 제시하라.

main → flags::parse → run, 검색 모드에서 스레드 1이면 search, 아니면 search_parallel. 단일 스레드 파일 검색 branch는 search → SearchWorker.search → search_path helper → grep-searcher Searcher.search_path. 이는 기본 CLI 검색의 조건부 경로이며 모든 기본 호출이 단일 스레드라고 주장하지 않는다.

Evidence:
- [crates/core/main.rs:44–46](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/core/main.rs#L44-L46)
- [crates/core/main.rs:78–96](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/core/main.rs#L78-L96)
- [crates/core/main.rs:113–132](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/core/main.rs#L113-L132)
- [crates/core/search.rs:245–266](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/core/search.rs#L245-L266)
- [crates/core/search.rs:342–350](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/core/search.rs#L342-L350)
- [crates/core/search.rs:380–405](https://github.com/BurntSushi/ripgrep/blob/3fce3b5bb0236da2df6d99672afb8a719642eca7/crates/core/search.rs#L380-L405)

## Dependency oracle

실행 완료한 cargo metadata --no-deps --format-version 1을 oracle로 사용. workspace_members 11개, local-path 선언 의존 18개(normal/dev/optional scope 유지); package pair 집계 시 중복 scope를 합친다. cargo build는 필요하지 않다.

Independent inventory: `oracles/ripgrep.json`. Empty denominators are N/A, never 100% recall.

## Scoring fixed before implementation

Each of four answers earns 0 (absent/wrong), 1 (partially correct with no invented facts), or 2 (correct core facts and source evidence), total 0–8. Entry and flow answers must distinguish framework dispatch, callback, concurrent execution, and directly resolved calls. Extra unsupported links lose that question’s evidence credit. Compare Lattice-only and source-only agents on identical questions. These benchmark source answers are oracle material and must not be exposed to the blind Lattice agent.
