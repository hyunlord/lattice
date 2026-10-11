# L9 frozen benchmark: click

Repository: https://github.com/pallets/click
Commit: `2247b35ea1c47c727d7a06e51fa280e12a863ff6`

Questions frozen before any Lattice output inspection. Answers derived only from the pinned source. No implementation or benchmark run informed these questions.

Representative action: Command.main으로 명령 콜백 실행

Purpose: Composable command line interface toolkit. 독립 앱 main이 아니라 Python 라이브러리 공개 API가 출발점이다.

## structure

주요 패키지 또는 모듈과 각 역할은 무엇인가?

배포 패키지는 click 하나. __init__.py는 공개 API, decorators는 명령/옵션 선언, core는 Command/Context와 명령 호출, parser는 인수 파싱, types는 값 변환, formatting/termui는 도움말·터미널이다.

Evidence:
- [pyproject.toml:1–5](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/pyproject.toml#L1-L5)
- [pyproject.toml:62–67](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/pyproject.toml#L62-L67)
- [src/click/__init__.py:1–29](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/__init__.py#L1-L29)
- [src/click/decorators.py:8–15](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/decorators.py#L8-L15)
- [src/click/core.py:24–48](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/core.py#L24-L48)

## dependencies

어떤 내부 패키지 또는 모듈이 어떤 다른 내부 패키지 또는 모듈을 사용하는가?

공개 __init__ → core·decorators, decorators → core·globals·utils, core → types·exceptions·formatting·parser·termui·utils. 이는 한 배포 패키지 내부 모듈 관계이며 여러 pyproject 패키지 의존으로 부풀리지 않는다.

Evidence:
- [src/click/__init__.py:10–29](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/__init__.py#L10-L29)
- [src/click/decorators.py:8–15](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/decorators.py#L8-L15)
- [src/click/core.py:24–48](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/core.py#L24-L48)

## entry

제품 실행 또는 공개 API 사용은 어디에서 시작하는가? 근거 파일과 줄을 제시하라.

공개 click.Command와 click.command를 소비자가 가져온다. Command.main은 명령 실행 진입 API다. pyproject에 이 라이브러리 자체를 실행하는 console_scripts가 없으므로 임의 main을 만들지 않는다.

Evidence:
- [src/click/__init__.py:11–19](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/__init__.py#L11-L19)
- [src/click/core.py:1515–1545](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/core.py#L1515-L1545)
- [pyproject.toml:1–67](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/pyproject.toml#L1-L67)

## flow

대표 동작이 어떤 저장소 내부 함수들을 거치는가? 호출 순서와 근거를 제시하라.

일반 Command.main → make_context → parse_args 후 main → Command.invoke → Context.invoke → 등록 callback. 마지막 callback은 사용자 제공 동적 값이므로 정해진 저장소 내부 함수로 단정할 수 없다. Group의 override는 별도 흐름이다.

Evidence:
- [src/click/core.py:1591–1592](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/core.py#L1591-L1592)
- [src/click/core.py:1359–1394](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/core.py#L1359-L1394)
- [src/click/core.py:1432–1446](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/core.py#L1432-L1446)
- [src/click/core.py:887–940](https://github.com/pallets/click/blob/2247b35ea1c47c727d7a06e51fa280e12a863ff6/src/click/core.py#L887-L940)

## Dependency oracle

pyproject [project] 및 [tool.flit.module]가 단일 click 배포 단위를 확정. 내부 manifest 의존 분모 0(N/A), 상대 import 기반 모듈 의존은 별도 검증. 테스트·문서 dependency-groups를 제품 패키지로 세지 않는다.

Independent inventory: `oracles/click.json`. Empty denominators are N/A, never 100% recall.

## Scoring fixed before implementation

Each of four answers earns 0 (absent/wrong), 1 (partially correct with no invented facts), or 2 (correct core facts and source evidence), total 0–8. Entry and flow answers must distinguish framework dispatch, callback, concurrent execution, and directly resolved calls. Extra unsupported links lose that question’s evidence credit. Compare Lattice-only and source-only agents on identical questions. These benchmark source answers are oracle material and must not be exposed to the blind Lattice agent.
