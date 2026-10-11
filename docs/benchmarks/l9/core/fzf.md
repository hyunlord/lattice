# L9 frozen benchmark: fzf

Repository: https://github.com/junegunn/fzf
Commit: `c0a193e031f01fb50bf6f7be4381990a3753f7cf`

Questions frozen before any Lattice output inspection. Answers derived only from the pinned source. No implementation or benchmark run informed these questions.

Representative action: 기본 CLI 실행에서 입력 읽기와 검색 실행

Purpose: 범용 명령행 퍼지 검색기. Go 모듈 하나 안에 실행기, 검색 오케스트레이터, 매칭 알고리즘, 터미널, 공용 기능 패키지가 있다.

## structure

주요 패키지 또는 모듈과 각 역할은 무엇인가?

루트 main은 CLI 옵션과 실행을 연결한다. src는 Reader·Matcher·Terminal을 조정한다. src/algo는 퍼지 매칭, src/tui는 터미널 렌더러/입력, src/util은 공유 실행·이벤트·문자 처리다. 빌드 모듈은 go.mod의 하나이며 이 내부 Go 패키지들을 별도 Cargo식 모듈로 지어내지 않는다.

Evidence:
- [go.mod:1–20](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/go.mod#L1-L20)
- [main.go:57–114](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/main.go#L57-L114)
- [src/core.go:204–210](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/core.go#L204-L210)
- [src/core.go:258–258](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/core.go#L258-L258)
- [src/core.go:361–372](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/core.go#L361-L372)
- [src/algo/algo.go:1–35](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/algo/algo.go#L1-L35)
- [src/tui/tui.go:1–12](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/tui/tui.go#L1-L12)

## dependencies

어떤 내부 패키지 또는 모듈이 어떤 다른 내부 패키지 또는 모듈을 사용하는가?

루트 main → src 및 src/protector. src → src/algo·src/util (pattern.go), src/tui → src/util. 방향은 사용하는 쪽에서 제공하는 쪽이며 대상 패키지의 모든 파일과 완전 이분 연결로 펼치면 오답이다.

Evidence:
- [main.go:10–11](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/main.go#L10-L11)
- [src/pattern.go:8–9](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/pattern.go#L8-L9)
- [src/tui/tui.go:9–9](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/tui/tui.go#L9-L9)
- [src/reader.go:17–17](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/reader.go#L17-L17)

## entry

제품 실행 또는 공개 API 사용은 어디에서 시작하는가? 근거 파일과 줄을 제시하라.

실행 진입점 main.go의 main. ParseOptions 후 옵션별 빠른 종료를 제외하면 fzf.Run(options)를 호출한다.

Evidence:
- [main.go:57–60](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/main.go#L57-L60)
- [main.go:113–114](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/main.go#L113-L114)

## flow

대표 동작이 어떤 저장소 내부 함수들을 거치는가? 호출 순서와 근거를 제시하라.

main → ParseOptions → Run. 일반 인터랙티브 실행에서 Run이 NewReader/ReadSource로 입력을 읽고 NewMatcher로 매처를 만든 뒤 Matcher.Loop와 Terminal.Loop를 각각 goroutine으로 시작한다. 이 둘은 병렬 이벤트 루프이며 순차 직접 호출로 주장하면 안 된다.

Evidence:
- [main.go:60–60](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/main.go#L60-L60)
- [main.go:113–113](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/main.go#L113-L113)
- [src/core.go:204–210](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/core.go#L204-L210)
- [src/core.go:258–258](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/core.go#L258-L258)
- [src/core.go:361–372](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/core.go#L361-L372)
- [src/reader.go:125–151](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/reader.go#L125-L151)
- [src/matcher.go:81–95](https://github.com/junegunn/fzf/blob/c0a193e031f01fb50bf6f7be4381990a3753f7cf/src/matcher.go#L81-L95)

## Dependency oracle

go.mod는 단일 모듈, 내부 manifest 의존 분모 0(N/A). Go import의 모듈 접두사를 제거해 실제 패키지 디렉터리로 대응하고 source importer를 별도 집계한다. Go toolchain이 있는 환경에서는 go list -json ./... Imports로 교차 검증; 현재 환경 go 없음.

Independent inventory: `oracles/fzf.json`. Empty denominators are N/A, never 100% recall.

## Scoring fixed before implementation

Each of four answers earns 0 (absent/wrong), 1 (partially correct with no invented facts), or 2 (correct core facts and source evidence), total 0–8. Entry and flow answers must distinguish framework dispatch, callback, concurrent execution, and directly resolved calls. Extra unsupported links lose that question’s evidence credit. Compare Lattice-only and source-only agents on identical questions. These benchmark source answers are oracle material and must not be exposed to the blind Lattice agent.
