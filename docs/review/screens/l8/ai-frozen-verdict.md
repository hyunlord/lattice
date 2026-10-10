# 첫 화면 캡처 이해도 평가 (1.png, 2.png)

## 1.png — zod 지도

**① 무엇을 하는 저장소인가**
Zod 저장소입니다. TypeScript를 우선으로 한 스키마 검증 라이브러리이고, 스키마에서 정적 타입을 추론해 줍니다. 소스 루트는 `packages/zod/src`입니다.

**② 핵심 덩어리 3개와 역할**
1. **v4 (106개 파일, 하위 폴더 4개)**: Zod v4 구현 전체입니다. core가 스키마 생성자, 파싱, 검사, 오류, JSON Schema 변환, 컴파일러를 제공합니다. classic과 mini는 이것을 각자의 공개 API로 감쌉니다.
2. **진입 모듈 4개 (루트, locales, mini, v4-mini)**: 자체 로직이 거의 없고 v4를 다시 내보내는 얇은 모듈입니다.
   - 루트: v4 classic API를 내보냅니다.
   - mini, v4-mini: v4 mini API를 내보냅니다.
   - locales: v4 로케일 색인을 내보냅니다.
3. **v3 레거시 묶음 (v3, v3/helpers, v3/locales)**: v3 API 본체, 파싱 보조 모듈, 영어 오류 메시지가 서로를 참조하는 순환 묶음입니다.

**③ 무엇이 무엇을 쓰는가**
- 루트(2개 파일), locales(1), mini(1), v4-mini(1)가 모두 아래쪽 v4를 씁니다. 이것이 외부 화살표 4개입니다.
- v3 묶음 안에서는 서로 쓰는 관계입니다. v3는 helpers와 locales를 쓰고, helpers는 v3와 locales를 쓰고, locales는 v3와 helpers를 씁니다.
- v3 묶음은 바깥과 연결된 화살표가 없습니다.

**점수: 4 / 5**
- **이유:**
  - 목적, 계층, 방향이 30초 안에 잡힙니다. "얇은 진입점 여러 개가 거대한 v4 하나를 쓴다"는 구조가 위에서 아래로 그려져 있습니다.
  - 화살표마다 사용 파일 수가 붙어 있어 근거도 보입니다.
- **모호한 부분:**
  - mini와 v4-mini의 설명이 거의 같아서 둘이 왜 따로 있는지 모르겠습니다.
  - v3 묶음을 누가 쓰는지, 아무도 쓰지 않는 고립 상태인지 화면만으로는 알 수 없습니다.
  - v4 안의 하위 폴더 4개는 core, classic, mini 정도만 추측되고, 나머지 하나와 내부 의존 방향은 보이지 않습니다.

## 2.png — AutoMapper 지도

**① 무엇을 하는 저장소인가**
AutoMapper입니다. .NET에서 한 객체를 다른 객체로 옮기는 매핑 코드를 없애 주는 라이브러리입니다. 소스 루트는 `src/AutoMapper`입니다.

**② 핵심 덩어리 3개와 역할**
1. **매핑 엔진 코어 묶음 (폴더 6개)**: 루트, Configuration, Execution, Internal, Mappers, QueryableExtensions로 이루어집니다.
   - Configuration: 설정을 맡고, 실행 계획을 컴파일하고 캐시합니다.
   - Execution: 식 트리를 만듭니다.
   - Mappers: 타입 쌍별 매퍼 구현과 레지스트리입니다.
   - QueryableExtensions: ProjectTo 프로젝션을 제공합니다.
   - Internal: 리플렉션과 캐시 같은 공용 헬퍼입니다.
2. **Licensing**: JWT 라이선스 키를 RSA 서명으로 검증하고, 결과를 로그로만 남깁니다.
3. **주변 폴더 (ApiCompat, Configuration/Annotations)**:
   - ApiCompat: 직전 버전 NuGet 패키지와 API 호환성을 비교하는 셸 스크립트입니다.
   - Annotations: 타입과 멤버에 붙이는 매핑 특성 모음입니다.

**③ 무엇이 무엇을 쓰는가**
- 묶음 사이 화살표는 Configuration → Licensing(1개 파일) 하나뿐입니다.
- 묶음 내부에서 행별로 적힌 관계는 다음과 같습니다.
  - Configuration → 루트, Mappers, QueryableExtensions, Execution
  - Execution → 루트, Internal
  - Mappers → 루트, Execution, Internal
  - Internal → 루트, QueryableExtensions, Configuration, Mappers
  - QueryableExtensions → 루트
  - 루트 → Configuration, Internal
- 즉 내부는 서로 얽힌 그물 구조입니다.
- ApiCompat과 Annotations에는 "표시 범위의 명시 import 연결 없음"이라고 되어 있어, 누가 쓰는지 모릅니다.

**점수: 3 / 5**
- **이유:**
  - 목적과 주요 덩어리, 일부 의존은 파악됩니다.
  - 묶음 요약 문장("설정 쪽이 매퍼를 등록하고, 실행 쪽이 식 트리를 만든다")이 대략적인 흐름도 줍니다.
  - 하지만 폴더 9개 중 6개가 순환 묶음 상자 하나에 들어가 있습니다. 그래서 그림만으로 보이는 방향은 주변부인 Licensing으로 가는 화살표 하나뿐입니다.
  - 핵심 흐름은 행별 텍스트를 하나씩 읽어야 하므로 30초를 넘깁니다.
- **모호한 부분:**
  - 코어 내부에 위아래 순서가 없어서 어디가 상위 계층인지 즉시 보이지 않습니다.
  - Annotations는 파일이 10개인데 연결이 없습니다. 리플렉션으로 쓰이는 것으로 추측되지만 화면에는 근거가 없습니다.
  - ApiCompat은 제품 코드인지 빌드 도구인지 위치가 애매합니다.
  - Licensing이 결과를 로그로만 남긴다면 동작을 막지는 않는 것 같지만, 그 의미는 확인할 수 없습니다.

## 요약
| 그림 | 점수 | 한 줄 평 |
|---|---|---|
| 1.png (zod) | 4 | 진입점 → v4라는 방향이 그림으로 바로 보입니다. v3의 쓰임새와 mini/v4-mini의 차이는 불명확합니다. |
| 2.png (AutoMapper) | 3 | 목적과 역할은 명확하지만, 핵심이 한 순환 상자 안에 있어 흐름은 텍스트를 읽어야 알 수 있습니다. |
