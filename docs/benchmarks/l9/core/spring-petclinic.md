# L9 frozen benchmark: spring-petclinic

Repository: https://github.com/spring-projects/spring-petclinic
Commit: `500158f732419217507c7656904b8e6aa1bcc0d6`

Questions frozen before any Lattice output inspection. Answers derived only from the pinned source. No implementation or benchmark run informed these questions.

Representative action: GET /owners 요청으로 소유자 검색

Purpose: Spring Boot 기반 동물병원 샘플 웹 앱.

## structure

주요 패키지 또는 모듈과 각 역할은 무엇인가?

Maven artifact는 spring-petclinic 하나. Java 내부에는 owner(소유자·동물·방문 웹/도메인), vet(수의사), model(공통 엔티티), system(홈/오류)이 있다. src/main/java는 제품 코드이며 main 경로를 테스트로 제외하면 오답이다.

Evidence:
- [pom.xml:11–15](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/pom.xml#L11-L15)
- [src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java:49–70](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java#L49-L70)
- [src/main/java/org/springframework/samples/petclinic/vet/VetController.java:30–48](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/vet/VetController.java#L30-L48)
- [src/main/java/org/springframework/samples/petclinic/model/Person.java:16–29](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/model/Person.java#L16-L29)
- [src/main/java/org/springframework/samples/petclinic/system/WelcomeController.java:19–29](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/system/WelcomeController.java#L19-L29)

## dependencies

어떤 내부 패키지 또는 모듈이 어떤 다른 내부 패키지 또는 모듈을 사용하는가?

owner.Owner → model.Person, vet.Vet → model.Person 및 model.NamedEntity. OwnerController는 OwnerRepository를 사용한다. Maven 내부 modules 의존은 없으며 Spring/JPA는 외부 프레임워크 경계다.

Evidence:
- [src/main/java/org/springframework/samples/petclinic/owner/Owner.java:23–50](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/owner/Owner.java#L23-L50)
- [src/main/java/org/springframework/samples/petclinic/vet/Vet.java:24–45](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/vet/Vet.java#L24-L45)
- [src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java:54–66](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java#L54-L66)

## entry

제품 실행 또는 공개 API 사용은 어디에서 시작하는가? 근거 파일과 줄을 제시하라.

PetClinicApplication.main과 @SpringBootApplication이 앱 시작 근거다. HTTP GET /owners는 @GetMapping으로 processFindForm에 연결된다. 프레임워크의 런타임 디스패치를 앱이 직접 함수를 호출한 것으로 꾸미지 않는다.

Evidence:
- [src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java:28–34](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/PetClinicApplication.java#L28-L34)
- [src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java:94–107](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java#L94-L107)

## flow

대표 동작이 어떤 저장소 내부 함수들을 거치는가? 호출 순서와 근거를 제시하라.

GET /owners → OwnerController.processFindForm → findPaginatedForOwnersLastName → OwnerRepository.findByLastNameStartingWith. 저장소 메서드는 Spring Data가 구현하는 인터페이스이므로 SQL 구현 함수까지 정적으로 지어내지 않는다. 결과 수에 따라 상세 리다이렉트나 목록 뷰로 간다.

Evidence:
- [src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java:94–145](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/owner/OwnerController.java#L94-L145)
- [src/main/java/org/springframework/samples/petclinic/owner/OwnerRepository.java:31–45](https://github.com/spring-projects/spring-petclinic/blob/500158f732419217507c7656904b8e6aa1bcc0d6/src/main/java/org/springframework/samples/petclinic/owner/OwnerRepository.java#L31-L45)

## Dependency oracle

pom.xml root artifact 하나, reactor modules 없음. 내부 manifest 의존 분모 0(N/A); Java package imports는 별도 관계. mvn help:effective-pom으로 교차 검증 가능하나 현재 JDK 없음.

Independent inventory: `oracles/spring-petclinic.json`. Empty denominators are N/A, never 100% recall.

## Scoring fixed before implementation

Each of four answers earns 0 (absent/wrong), 1 (partially correct with no invented facts), or 2 (correct core facts and source evidence), total 0–8. Entry and flow answers must distinguish framework dispatch, callback, concurrent execution, and directly resolved calls. Extra unsupported links lose that question’s evidence credit. Compare Lattice-only and source-only agents on identical questions. These benchmark source answers are oracle material and must not be exposed to the blind Lattice agent.
