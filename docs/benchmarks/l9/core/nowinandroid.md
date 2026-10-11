# L9 frozen benchmark: nowinandroid

Repository: https://github.com/android/nowinandroid
Commit: `a49ed253d75e61a2b6ab80a8da677b57437b08eb`

Questions frozen before any Lattice output inspection. Answers derived only from the pinned source. No implementation or benchmark run informed these questions.

Representative action: MainActivity 생성에서 앱 화면 구성

Purpose: Android/Jetpack Compose 아키텍처를 보여 주는 뉴스 앱 샘플.

## structure

주요 패키지 또는 모듈과 각 역할은 무엇인가?

Gradle include 35개와 별도 build-logic composite build. app은 실행/화면 조립, feature:*의 api/impl은 사용자 기능, core:data/domain/model은 데이터와 도메인, database/datastore/network는 저장·통신, designsystem/ui는 공통 화면, sync:work는 동기화다. 추적 Kotlin 파일은 310개이며 app/build.gradle 한 파일만 제품으로 보는 것은 오답이다.

Evidence:
- [settings.gradle.kts:17–18](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/settings.gradle.kts#L17-L18)
- [settings.gradle.kts:48–83](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/settings.gradle.kts#L48-L83)
- [app/build.gradle.kts:69–87](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/app/build.gradle.kts#L69-L87)
- [core/data/build.gradle.kts:29–35](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/core/data/build.gradle.kts#L29-L35)
- [core/domain/build.gradle.kts:27–28](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/core/domain/build.gradle.kts#L27-L28)

## dependencies

어떤 내부 패키지 또는 모듈이 어떤 다른 내부 패키지 또는 모듈을 사용하는가?

app → feature api/impl 및 core:data/model/ui/designsystem 등, core:domain → core:data·core:model, core:data → core:common/database/datastore/network/analytics/notifications. typesafe projects.core.data 표기도 Gradle project 의존이다. 테스트 configuration은 별도 분리한다.

Evidence:
- [app/build.gradle.kts:69–87](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/app/build.gradle.kts#L69-L87)
- [core/domain/build.gradle.kts:27–28](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/core/domain/build.gradle.kts#L27-L28)
- [core/data/build.gradle.kts:29–35](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/core/data/build.gradle.kts#L29-L35)

## entry

제품 실행 또는 공개 API 사용은 어디에서 시작하는가? 근거 파일과 줄을 제시하라.

AndroidManifest의 Application=.NiaApplication, MAIN/LAUNCHER Activity=.MainActivity. NiaApplication.onCreate와 MainActivity.onCreate가 Android lifecycle 진입점이다.

Evidence:
- [app/src/main/AndroidManifest.xml:31–55](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/app/src/main/AndroidManifest.xml#L31-L55)
- [app/src/main/kotlin/com/google/samples/apps/nowinandroid/NiaApplication.kt:34–48](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/app/src/main/kotlin/com/google/samples/apps/nowinandroid/NiaApplication.kt#L34-L48)
- [app/src/main/kotlin/com/google/samples/apps/nowinandroid/MainActivity.kt:78–80](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/app/src/main/kotlin/com/google/samples/apps/nowinandroid/MainActivity.kt#L78-L80)

## flow

대표 동작이 어떤 저장소 내부 함수들을 거치는가? 호출 순서와 근거를 제시하라.

MainActivity.onCreate → setContent 람다 → rememberNiaAppState와 NiaApp(appState). NiaApp의 외부 overload가 내부 overload를 호출하고 entryProvider에서 forYouEntry/bookmarksEntry/interestsEntry/topicEntry/searchEntry를 등록한 뒤 NavDisplay로 표시한다. Compose 프레임워크가 composable을 실행하므로 직접 Kotlin 호출과 UI 등록/렌더 관계를 구별한다.

Evidence:
- [app/src/main/kotlin/com/google/samples/apps/nowinandroid/MainActivity.kt:135–154](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/app/src/main/kotlin/com/google/samples/apps/nowinandroid/MainActivity.kt#L135-L154)
- [app/src/main/kotlin/com/google/samples/apps/nowinandroid/ui/NiaApp.kt:90–142](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/app/src/main/kotlin/com/google/samples/apps/nowinandroid/ui/NiaApp.kt#L90-L142)
- [app/src/main/kotlin/com/google/samples/apps/nowinandroid/ui/NiaApp.kt:259–270](https://github.com/android/nowinandroid/blob/a49ed253d75e61a2b6ab80a8da677b57437b08eb/app/src/main/kotlin/com/google/samples/apps/nowinandroid/ui/NiaApp.kt#L259-L270)

## Dependency oracle

settings include와 각 build.gradle.kts projects accessor를 독립 집계: 35 project, 105 scoped dependency declarations. Gradle 실행 oracle는 JDK 미설치로 아직 미확인; static source inventory를 실행된 Gradle 결과로 보고하지 않는다. JDK 환경에서 모든 configuration ProjectDependency를 tooling/init task로 export하고 source inventory와 비교해야 95% 관문을 확정한다.

Independent inventory: `oracles/nowinandroid.json`. Empty denominators are N/A, never 100% recall.

## Scoring fixed before implementation

Each of four answers earns 0 (absent/wrong), 1 (partially correct with no invented facts), or 2 (correct core facts and source evidence), total 0–8. Entry and flow answers must distinguish framework dispatch, callback, concurrent execution, and directly resolved calls. Extra unsupported links lose that question’s evidence credit. Compare Lattice-only and source-only agents on identical questions. These benchmark source answers are oracle material and must not be exposed to the blind Lattice agent.
