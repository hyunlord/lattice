# L12 사용자 5분 테스트

질문은 [questions.md](questions.md)에 제품 변경과 새 저장소 조사 전에 고정했습니다. 아래 한국어 문장은 같은 다섯 질문의 번역이며 추가 질문이나 정답 힌트가 아닙니다. 갤러리 여섯 개와 사용자 표본 세 개의 정확한 소스는 [repositories.json](repositories.json)에 고정합니다.

## 먼저 읽을 진행 방법

각 사용자 표본을 처음 볼 때 **Lattice만 먼저 5분** 봅니다. 시작 전에 README, GitHub 소스, DeepWiki, 이전 평가나 정답지를 열지 않습니다. Lattice의 근거 링크는 제품 기능으로 사용할 수 있으며, 사용 여부를 기록합니다. 처음 화면을 본 순간부터 시간을 재고 5분이 되면 작성 중인 답을 그대로 보존합니다. 이미 저장소를 알고 있었다면 사전 지식을 기록하고 새로운 표본인 것처럼 보고하지 않습니다.

답변을 저장한 뒤에만 아래 접힌 비교 링크를 열어 DeepWiki와 README/GitHub를 봅니다. 두 번째 탐색 시간은 학습 효과가 있으므로 공정한 속도 대결로 계산하지 않습니다. 숫자는 참고 기록이며 합격 점수나 시간 절감률 관문이 아닙니다. 정답 키는 세 표본 테스트가 끝난 뒤에만 공개합니다.

## 질문 다섯 개

1. 이 저장소는 무엇을 제공하며, 누가 또는 무엇이 사용하나요?
2. 가장 중요한 부품 세 개를 꼽고, 각각의 역할을 한 문장으로 설명해 주세요.
3. 그 부품들 사이의 방향 있는 의존 두 개를 설명해 주세요. 어느 부품이 어느 부품을 무엇 때문에 사용하나요?
4. 주요 실행이나 공개 API를 이해하려면 어디부터 읽겠나요? 파일 또는 기호와 이유를 적어 주세요.
5. 대표 동작 하나가 시작점에서 이후 두 단계 이상으로 어떻게 이어지는지 추적해 주세요. 근거 파일 또는 기호를 적고, 확인된 호출과 추정한 구조 단계를 구별해 주세요.

## 답변 양식 (표본마다 복사)

- 저장소 / 지도에 표시된 소스 커밋:
- 사전 지식: 없음 / 있음 (내용)
- 시작 시각 / 종료 시각 / 경과 초 (최대 300):
- 사용 화면 폭 / 브라우저:
- 지도에서 근거 링크를 열었는지:
- 답 1:
- 답 2:
- 답 3:
- 답 4:
- 답 5:
- **여기까지 먼저 저장한 시각:**
- 이후 비교: DeepWiki 접근 가능 여부 / 표시된 인덱스 커밋·날짜 / README 소스 커밋:
- DeepWiki 또는 README로 처음 봤다면 더 빨랐을 것 같은가? 이유:
- **다음에 처음 보는 저장소를 파악할 때 DeepWiki 대신 Lattice를 열겠는가? 예 / 아니오**
- 판단 이유:
- 테스트 종료 뒤 정답 대조 결과: 정답 / 일부 / 오답 / 미답 (질문별 기록, 합격 점수 아님)

## 사용자 표본 지도

지도 링크는 L12 게시 검증 전까지 예정 주소입니다. 게시 담당자가 실제 로딩과 source commit을 확인한 뒤에만 테스트를 시작합니다. 표본의 소개나 역할 설명을 이 질문지에 미리 넣지 않습니다.

- [huggingface/smolagents — Lattice 먼저](https://hyunlord.github.io/lattice/smolagents/#/home?lang=en)
- [pocketbase/pocketbase — Lattice 먼저](https://hyunlord.github.io/lattice/pocketbase/#/home?lang=en)
- [outline/outline — Lattice 먼저](https://hyunlord.github.io/lattice/outline/#/home?lang=en)

<details>
<summary>5분 답변을 저장한 뒤에만 열기: DeepWiki · README/GitHub</summary>

- huggingface/smolagents: [DeepWiki](https://deepwiki.com/huggingface/smolagents) · [고정 커밋 README](https://github.com/huggingface/smolagents/tree/96f33faaf028479119ec8d34507b47694cf14e34#readme) · [고정 커밋 GitHub](https://github.com/huggingface/smolagents/tree/96f33faaf028479119ec8d34507b47694cf14e34)
- pocketbase/pocketbase: [DeepWiki](https://deepwiki.com/pocketbase/pocketbase) · [고정 커밋 README](https://github.com/pocketbase/pocketbase/tree/6f370ea741f33adf889eef02e3c1b884a47aa522#readme) · [고정 커밋 GitHub](https://github.com/pocketbase/pocketbase/tree/6f370ea741f33adf889eef02e3c1b884a47aa522)
- outline/outline: [DeepWiki](https://deepwiki.com/outline/outline) · [고정 커밋 README](https://github.com/outline/outline/tree/3789ca60f4ae91f13a35e98ce8415a69d8386c4c#readme) · [고정 커밋 GitHub](https://github.com/outline/outline/tree/3789ca60f4ae91f13a35e98ce8415a69d8386c4c)

DeepWiki는 외부 서비스이며 Lattice와 같은 커밋으로 고정하지 못합니다. 열리지 않으면 접근 실패로 기록하고 대신 결과를 만들어 내지 않습니다. 인덱스 날짜·커밋이 다르면 비교 제한으로 남깁니다. 비교 링크를 클릭해 인덱스 갱신이나 이메일 가입을 요청할 필요는 없습니다.

</details>

## 판정과 중단

사용자 표본 세 개에서 마지막 질문의 **예가 두 개 이상이 아니면** 신규 기능 개발을 중단하고 MCP·CI 차이 보기만 유지합니다. 에이전트가 사용자 판정을 대체하지 않습니다. 현재 판정은 **사용자 테스트 전, 미판정**입니다. 대형 5만 파일 이상 완성 실패와 #100·#102는 범위 밖이며 열린 상태로 둡니다.

## 갤러리 여섯 개

갤러리에도 같은 다섯 질문을 적용하지만, 중단 조건의 세 표본 투표에는 포함하지 않습니다.

- [junegunn/fzf: Lattice](https://hyunlord.github.io/lattice/fzf/#/home?lang=en) · [GitHub/README](https://github.com/junegunn/fzf/tree/c0a193e031f01fb50bf6f7be4381990a3753f7cf#readme) · [DeepWiki](https://deepwiki.com/junegunn/fzf)
- [encode/httpx: Lattice](https://hyunlord.github.io/lattice/httpx/#/home?lang=en) · [GitHub/README](https://github.com/encode/httpx/tree/b5addb64f0161ff6bfe94c124ef76f6a1fba5254#readme) · [DeepWiki](https://deepwiki.com/encode/httpx)
- [BurntSushi/ripgrep: Lattice](https://hyunlord.github.io/lattice/ripgrep/#/home?lang=en) · [GitHub/README](https://github.com/BurntSushi/ripgrep/tree/3fce3b5bb0236da2df6d99672afb8a719642eca7#readme) · [DeepWiki](https://deepwiki.com/BurntSushi/ripgrep)
- [android/nowinandroid: Lattice](https://hyunlord.github.io/lattice/nowinandroid/#/home?lang=en) · [GitHub/README](https://github.com/android/nowinandroid/tree/a49ed253d75e61a2b6ab80a8da677b57437b08eb#readme) · [DeepWiki](https://deepwiki.com/android/nowinandroid)
- [spring-projects/spring-petclinic: Lattice](https://hyunlord.github.io/lattice/spring-petclinic/#/home?lang=en) · [GitHub/README](https://github.com/spring-projects/spring-petclinic/tree/500158f732419217507c7656904b8e6aa1bcc0d6#readme) · [DeepWiki](https://deepwiki.com/spring-projects/spring-petclinic)
- [excalidraw/excalidraw: Lattice](https://hyunlord.github.io/lattice/excalidraw/#/home?lang=en) · [GitHub/README](https://github.com/excalidraw/excalidraw/tree/e65eca999e071503efb893d3379a29fb96ff37c4#readme) · [DeepWiki](https://deepwiki.com/excalidraw/excalidraw)
