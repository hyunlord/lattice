# R16 원문 대조와 사실 보정

관문은 **부분**이다. Cobra·Zod·AutoMapper 순서로 무설정 **3·3·3**, 외부 에이전트 요약 후 **4·4·3**을 그대로 보존한다. 같은 고정 표본의 수정 검수이며 새 저장소 검수가 아니다. 원래 화면 판정과 사후 원문 판정은 수정하지 않았다. 아래는 사후 판정 자체를 소스·표시 범위와 다시 대조한 보충 기록이다.

## 화면 판정과 원문이 일치한 범위

무설정 검수의 Zod 목적·v4/v3 구분·루트와 재수출 진입점에서 v4로 향하는 2·1·1·1개 파일 수는 원문과 일치했다. AutoMapper 목적, 설정·실행·내부 유틸·타입별 매퍼·쿼리 확장의 역할 추측, Configuration→Licensing도 일치했다. 요약 후에는 두 저장소의 역할을 더 구체적으로 설명했지만 AutoMapper는 관계를 읽는 데 시간이 걸려 3점에 머물렀다. Cobra는 화면 바이트가 같아 기존 점수와 원문 대조를 이월했다.

## 첫 문장과 전체 AI 요약의 차이

- **Zod 루트:** 화면 첫 문장은 두 파일 중 하나가 v4 classic을 재수출한다고 설명한다. 전체 원본 요약의 다음 문장에는 다른 파일이 전역 후처리기를 설치하고 컴파일 실패 시 런타임 파서로 돌아간다는 설명이 있다. 독자가 루트 전체를 재수출로 일반화한 것은 불완전하다. 다만 첫 화면에서 둘째 문장이 숨겨져 있다는 표현상 한계도 남는다. 전체 AI 원문이 재수출만 있다고 주장한 것은 아니다. [index.ts](https://github.com/colinhacks/zod/blob/284243fb0d6532665afdc9239188773bb624f73c/packages/zod/src/index.ts#L1), [compile.ts](https://github.com/colinhacks/zod/blob/284243fb0d6532665afdc9239188773bb624f73c/packages/zod/src/compile.ts#L13).
- **AutoMapper ApiCompat:** 보이는 첫 문장은 이전 메이저 패키지를 내려받아 DLL을 추출한다고 설명한다. 전체 요약은 호출 타깃이 주석 처리되어 현재 빌드 실행 여부를 확인할 수 없다고 명시한다. 독자의 “API 호환성을 비교하는 스크립트”는 다운로드·추출보다 강한 주장이다. 비교가 현재 실행된다는 근거는 없다. [PreBuild.sh](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/ApiCompat/PreBuild.sh#L16), [주석 처리된 프로젝트 설정](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/AutoMapper.csproj#L55).

## AutoMapper 방향에 대한 사후 판정 보정

지도는 **명시 import를 하는 서로 다른 파일 수**를 물리 폴더에 투영한다. 물리 루트 폴더와 `AutoMapper` 네임스페이스는 같은 개념이 아니다. 사후 검수에서 미확인이라고 한 아래 방향은 실제 import와 로컬 선언 위치로 확인된다.

| 방향 | 파일 수 | 근거 |
|---|---:|---|
| Configuration → 루트 | 5 | IMappingExpressionBase·MapperConfiguration·MapperConfigurationExpression·TypeMapConfiguration의 Features import와 Profile의 Runtime.CompilerServices import. [예: Features](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Configuration/MapperConfiguration.cs#L7), [Profile](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Configuration/Profile.cs#L1) |
| Execution → 루트 | 1 | [ExpressionBuilder.cs](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Execution/ExpressionBuilder.cs#L2)의 Runtime.CompilerServices import |
| Mappers → 루트 | 2 | [FromDynamicMapper](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Mappers/FromDynamicMapper.cs#L1)와 [ToDynamicMapper](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Mappers/ToDynamicMapper.cs#L1)의 같은 import |
| QueryableExtensions → 루트 | 2 | [NullsafeQueryRewriter](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/QueryableExtensions/NullsafeQueryRewriter.cs#L24)와 [ProjectionBuilder](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/QueryableExtensions/ProjectionBuilder.cs#L1)의 같은 import |
| Mappers → Execution | 1 | [StringToEnumMapper.cs](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Mappers/StringToEnumMapper.cs#L39)의 `#else` 안 `using static Execution.ExpressionBuilder` |
| Mappers → Internal | 1 | [CollectionMapper.cs](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Mappers/CollectionMapper.cs#L6)의 `using static ReflectionHelper` |

루트의 [Features.cs](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Features.cs#L1) 및 [AssemblyInfo.cs](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/AssemblyInfo.cs#L6)에 해당 로컬 네임스페이스 선언이 있다. 이는 네임스페이스 import 투영이며 특정 타입을 실제 사용했다는 증거는 아니다. 조건부 컴파일의 양쪽 소스도 분석하므로 활성 빌드·런타임 호출 수로 읽으면 안 된다.

## 남는 분석·표현 한계

C#의 같은 네임스페이스·전역 using·리플렉션 관계는 명시 import만으로 모두 나오지 않는다. [Configuration의 Annotations 사용](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Configuration/MapperConfigurationExpression.cs#L190), [Licensing의 IGlobalConfiguration 사용](https://github.com/AutoMapper/AutoMapper/blob/6e8697bc44f02fb54ef6a556a7d134e63485299e/src/AutoMapper/Licensing/LicenseAccessor.cs#L15)이 그 예다. 따라서 화면의 “표시 범위의 명시 import 연결 없음”은 전체 의미상 의존이 없다는 뜻이 아니다. 반대로 “화면에 외부 화살표가 하나 보인다”는 관찰 자체를 누락된 의미 관계 때문에 거짓으로 바꾸지는 않는다. ApiCompat 디스크 파일 2개와 분석 파일 1개의 차이도 지원하지 않는 PowerShell을 포함한 전체 파일 수와 분석 범위의 차이다.

23개 요약·310개 선언 근거의 원본 해시, 누락 여부, 각 렌더링의 근거 집합은 확인했다. **310개 근거가 모든 요약 문장의 의미적 정확성을 증명하지는 않는다.** 전체 요약과 실패 기록을 보존하며, 실제 상호 의존 묶음을 근거 없는 실행 순서로 바꾸거나 점수를 올리지 않는다.
