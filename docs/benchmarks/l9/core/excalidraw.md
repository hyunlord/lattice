# L9 frozen benchmark: excalidraw

Repository: https://github.com/excalidraw/excalidraw
Commit: `e65eca999e071503efb893d3379a29fb96ff37c4`

Questions frozen before any Lattice output inspection. Answers derived only from the pinned source. No implementation or benchmark run informed these questions.

Representative action: 앱 루트 마운트에서 캔버스 편집기 생성

Purpose: 루트 README의 협업·종단간 암호화 가능한 손그림 스타일 가상 화이트보드. 하위 utils/math 패키지 설명을 저장소 소개로 쓰면 안 된다.

## structure

주요 패키지 또는 모듈과 각 역할은 무엇인가?

루트 workspaces는 excalidraw-app, packages/*, examples/*이며 package.json 있는 member 10개. app은 서비스 조립, @excalidraw/excalidraw는 React 편집기, element는 도형 로직, math는 기하, common은 공통 상수/함수, fractional-indexing은 순서 키, laser-pointer는 포인터 윤곽, utils는 유틸리티다.

Evidence:
- [package.json:1–9](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/package.json#L1-L9)
- [packages/excalidraw/package.json:41–41](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/excalidraw/package.json#L41-L41)
- [packages/element/package.json:31–31](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/element/package.json#L31-L31)
- [packages/math/package.json:25–25](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/math/package.json#L25-L25)
- [packages/common/package.json:25–25](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/common/package.json#L25-L25)
- [packages/fractional-indexing/package.json:4–4](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/fractional-indexing/package.json#L4-L4)
- [packages/laser-pointer/package.json:4–4](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/laser-pointer/package.json#L4-L4)
- [packages/utils/package.json:22–22](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/utils/package.json#L22-L22)
- [README.md:15–19](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/README.md#L15-L19)

## dependencies

어떤 내부 패키지 또는 모듈이 어떤 다른 내부 패키지 또는 모듈을 사용하는가?

excalidraw 편집기 → common·element·laser-pointer·math, element → common·math·fractional-indexing, math → common, utils → laser-pointer. app 소스도 편집기를 가져오며 tsconfig paths가 workspace 원본에 매핑한다. manifest 선언 의존과 실제 import 관계를 따로 보고한다.

Evidence:
- [packages/excalidraw/package.json:87–92](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/excalidraw/package.json#L87-L92)
- [packages/element/package.json:66–68](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/element/package.json#L66-L68)
- [packages/math/package.json:64–64](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/math/package.json#L64-L64)
- [packages/utils/package.json:52–52](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/utils/package.json#L52-L52)
- [tsconfig.json:21–35](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/tsconfig.json#L21-L35)
- [excalidraw-app/App.tsx:948–951](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/excalidraw-app/App.tsx#L948-L951)

## entry

제품 실행 또는 공개 API 사용은 어디에서 시작하는가? 근거 파일과 줄을 제시하라.

웹 앱은 excalidraw-app/index.tsx가 createRoot 후 ExcalidrawApp을 렌더한다. 라이브러리 공개 Excalidraw는 packages/excalidraw/index.tsx가 React.memo(ExcalidrawBase)로 내보낸다. Node main 함수가 없는 것을 진입점 없음으로 결론내리지 않는다.

Evidence:
- [excalidraw-app/index.tsx:1–17](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/excalidraw-app/index.tsx#L1-L17)
- [packages/excalidraw/index.tsx:401–401](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/excalidraw/index.tsx#L401-L401)

## flow

대표 동작이 어떤 저장소 내부 함수들을 거치는가? 호출 순서와 근거를 제시하라.

index.tsx root.render → ExcalidrawApp → ExcalidrawWrapper → Excalidraw(React.memo ExcalidrawBase) → 내부 App 편집기. JSX 렌더 연결은 일반 함수 직접 호출과 구분하며 React runtime가 컴포넌트를 호출한다.

Evidence:
- [excalidraw-app/index.tsx:11–17](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/excalidraw-app/index.tsx#L11-L17)
- [excalidraw-app/App.tsx:1304–1322](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/excalidraw-app/App.tsx#L1304-L1322)
- [excalidraw-app/App.tsx:375–375](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/excalidraw-app/App.tsx#L375-L375)
- [excalidraw-app/App.tsx:948–951](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/excalidraw-app/App.tsx#L948-L951)
- [packages/excalidraw/index.tsx:67–67](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/excalidraw/index.tsx#L67-L67)
- [packages/excalidraw/index.tsx:210–214](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/excalidraw/index.tsx#L210-L214)
- [packages/excalidraw/index.tsx:401–401](https://github.com/excalidraw/excalidraw/blob/e65eca999e071503efb893d3379a29fb96ff37c4/packages/excalidraw/index.tsx#L401-L401)

## Dependency oracle

root workspaces globs에서 member package.json name을 모아 dependencies/devDependencies/peerDependencies/optionalDependencies 중 내부 이름만 연결: member 10개, scoped 선언 10개. tsconfig paths의 소스 import는 별도 검증하며 설치 스크립트 실행 불필요.

Independent inventory: `oracles/excalidraw.json`. Empty denominators are N/A, never 100% recall.

## Scoring fixed before implementation

Each of four answers earns 0 (absent/wrong), 1 (partially correct with no invented facts), or 2 (correct core facts and source evidence), total 0–8. Entry and flow answers must distinguish framework dispatch, callback, concurrent execution, and directly resolved calls. Extra unsupported links lose that question’s evidence credit. Compare Lattice-only and source-only agents on identical questions. These benchmark source answers are oracle material and must not be exposed to the blind Lattice agent.
