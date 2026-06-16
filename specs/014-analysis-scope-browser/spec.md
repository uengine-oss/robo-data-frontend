# Feature Specification: Analysis Source Browser (분석 소스 브라우저 — IDE식 로컬 파일 브라우저)

**Feature Branch**: `014-analysis-scope-browser`

**Created**: 2026-06-15 · **Reconciled**: 2026-06-16 (구현·결정에 맞게 재작성)

**Status**: Implemented (구현 완료, 일부 정리 항목 잔존 — 아래 "Remaining" 참조)

**Input**: 사용자 결정 누적 — "analyzer 경로모드 입력을 IDE식 로컬 파일 브라우저로. 폴더 트리 + 파일 미리보기 + **편집·저장** + 파일작업(이름변경/복사/삭제/새폴더). 분석은 **폴더 전체** 대상. **포함/제외 범위선택은 하지 않기로 확정**."

> ⚠️ **재작성 이유 (SDD)**: 최초 스펙(2026-06-15)은 "포함/제외 범위선택 + 읽기전용 미리보기"였으나, 실제 구현과 사용자 결정은 "범위선택 폐기 + 편집 가능 + 파일작업"으로 진화했다. 문서와 코드가 어긋난 채 방치돼 작업 중 혼선을 유발 → 스펙을 **현실(=결정)에 맞게 단일 진실로 정합**한다. 이후 변경은 이 스펙을 먼저 고치고 구현한다.

## Overview (배경)

Electron(로컬 경로) 모드에서 analyzer는 로컬 폴더를 직접 읽는다(업로드 없음). 기존 입력 화면은 **폴더 경로 텍스트 + "분석 시작" 버튼**뿐이라 사용자는 폴더 안을 못 보고, 무엇이 있는지·어떤 파일인지 알 수 없었다.

이 기능은 그 빈약한 입력을 **IDE식 로컬 파일 브라우저**로 바꾼다. 사용자는 실제 폴더 트리를 보고, 파일을 열어 내용을 **읽고 편집·저장**하며, **이름변경·복사·삭제(휴지통)·새 폴더** 같은 파일작업을 한다. 인터랙션은 robo-architect Code 탭의 파일탐색기(`FileTreePane.vue`) 모델을 따른다.

**의도적으로 하지 않는 것 (Non-Goals)**:

- **포함/제외 범위선택 안 함** — 분석은 **선택된 폴더(루트) 전체**를 대상으로 한다. 체크박스로 파일을 골라 범위를 좁히는 기능은 만들지 않는다(사용자 명시 결정).
- **분류(무엇인가) 안 건드림** — DDL/프로시저/언어 분류는 엔진의 몫(내용 기반, antlr). 이 UI는 *파일을 보고·편집·정리*만 한다.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - 폴더를 IDE처럼 탐색한다 (Priority: P1)

분석가가 선택한 로컬 폴더의 트리를 펼치고 접으며, 파일·폴더 구조를 한눈에 본다.

**Why this priority**: 핵심 가치. 폴더 안이 보여야 사용자가 무엇을 분석/편집할지 안다. 트리 자체가 최소 가치.

**Independent Test**: 경로 모드에서 폴더를 열어 하위 폴더를 펼치고 접을 수 있고, 파일/폴더가 (폴더 먼저·이름순) 정렬돼 표시되는지 확인.

**Acceptance Scenarios**:

1. **Given** 선택된 로컬 폴더, **When** 입력 화면이 열린다, **Then** 폴더의 실제 계층 트리(펼침/접힘, 파일/폴더, 폴더 먼저·이름순)가 표시된다.
2. **Given** 트리가 보인다, **When** 폴더를 펼친다, **Then** 그 폴더의 즉시 자식이 **지연 로드**(펼칠 때만 listDir)되어 나타난다.
3. **Given** 디스크에서 폴더 내용이 바뀜, **When** 새로고침(↻), **Then** 트리가 재동기화된다.

---

### User Story 2 - 파일을 미리보고 편집·저장한다 (Priority: P1)

분석가가 트리에서 파일을 클릭해 내용을 읽고, 그 자리에서 수정해 저장한다.

**Why this priority**: 단순 분석 입력을 넘어, 분석 전 소스를 직접 손볼 수 있어야 한다는 사용자 요구의 핵심.

**Independent Test**: 텍스트 파일을 클릭→내용 표시→글자를 고치면 "저장" 버튼이 나타나고, 저장하면 디스크에 반영되며 버튼이 사라지는지 확인. 고친 걸 원래대로 되돌리면 저장 버튼이 저절로 사라지는지 확인.

**Acceptance Scenarios**:

1. **Given** 트리가 보인다, **When** 텍스트 파일을 선택, **Then** 내용이 편집 가능한 영역에 표시된다.
2. **Given** 파일을 편집해 원본과 달라짐(dirty), **When** 화면을 본다, **Then** "저장" 버튼이 나타난다. 편집을 원본과 같게 되돌리면(IDE식) 버튼이 사라진다.
3. **Given** dirty 상태, **When** 저장(버튼 또는 Ctrl/⌘+S), **Then** 내용이 디스크에 기록되고 dirty가 해제된다.
4. **Given** dirty 상태, **When** 다른 파일을 클릭, **Then** "버리고 이동" 확인을 거친다(미저장 보호).
5. **Given** 파일을 편집해 dirty가 됨, **When** 좌측 트리를 본다, **Then** 그 파일 행에 **미저장 마커**(점·강조색, IDE식)가 표시되고, 저장하거나 원본대로 되돌리면 마커가 사라진다.
6. **Given** 바이너리/초대형(>512KB) 파일을 선택, **When** 미리보기 시도, **Then** 렌더하지 않고 명확한 안내를 표시한다(편집 불가).

---

### User Story 3 - 파일작업(이름변경·복사·삭제·새 폴더) (Priority: P2)

분석가가 우클릭 메뉴로 파일/폴더를 이름변경·복사하거나 휴지통으로 보내고, 새 폴더를 만든다.

**Why this priority**: IDE식 정리 작업. 트리·편집(US1/US2)이 있으면 부가 가치지만 사용자가 명시적으로 요구.

**Independent Test**: 파일을 우클릭→이름변경(인라인 입력)·복사(`_복사` 사본)·삭제(OS 휴지통, 복구 가능)가 동작하고, 폴더 우클릭/빈 곳 우클릭→새 폴더가 기본명으로 생성 후 즉시 인라인 명명되는지 확인.

**Acceptance Scenarios**:

1. **Given** 항목 우클릭 메뉴, **When** "이름변경", **Then** 행에서 인라인 입력으로 바뀌고(확장자 앞까지 선택), Enter 저장·Esc 취소·blur 저장된다. *(Electron은 `window.prompt` 미지원이므로 인라인이 필수)*
2. **Given** 항목 우클릭, **When** "복사", **Then** 같은 폴더에 `이름_복사` 사본이 생긴다(폴더는 재귀 복사).
3. **Given** 항목 우클릭, **When** "삭제(휴지통)", **Then** 확인 후 OS 휴지통으로 이동(영구삭제 아님). 분석 루트 자체는 삭제 불가.
4. **Given** 폴더 우클릭 **또는 트리 빈 곳 우클릭**, **When** "새 폴더", **Then** 안 겹치는 기본명("새 폴더 N")으로 만든 뒤 즉시 인라인 명명(VS Code식, prompt 없음).

---

### Edge Cases

- **빈 폴더**: 빈 상태 표시("불러오는 중…"→자식 없음).
- **접근 불가/권한 거부 경로**: 비차단 안내; 나머지 트리는 사용 가능.
- **바이너리/초대형(>512KB) 파일**: 미리보기/편집 렌더 안 함; 명확한 안내.
- **심볼릭 링크/특수파일**: 목록에서 제외(무한 확장 방지) — 일반 파일·폴더만.
- **경로 탈출(`..`·절대경로 우회)**: 호스트가 루트 하위로 강제(거부).
- **이름변경 충돌/금지문자(`/`,`\`)·동일이름**: 무시 또는 호스트 에러 안내.
- **미저장 변경 보호**: 다른 파일 이동 시 확인.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: 경로 모드에서 선택된 로컬 폴더를 탐색 가능한 계층 트리(펼침/접힘, 파일/폴더, 폴더 먼저·이름순)로 표시해야 한다.
- **FR-002**: 폴더 펼침은 그 폴더 자식만 지연 로드해야 한다(전체 사전 스캔 금지). 새로고침으로 재동기화한다.
- **FR-003**: 사용자가 선택한 텍스트 파일 내용을 표시하고, **그 자리에서 편집**할 수 있어야 한다.
- **FR-004**: 편집이 원본과 다르면(dirty) 저장 수단을 노출하고, 저장 시 디스크에 기록한다. 원본과 같아지면 저장 수단을 감춘다(IDE식). 저장 단축키 Ctrl/⌘+S.
  - **줄바꿈(EOL) 정규화**: HTML textarea는 입력 시 `\r\n`을 `\n`으로 정규화하므로, dirty 비교가 어긋나지 않도록 **내부 편집·비교는 항상 `\n`으로 정규화**한다(로드 시 정규화·원래 EOL 기억). 저장 시 **파일 원래 EOL(CRLF/LF)로 복원**해 기록한다(줄바꿈 스타일 보존). 이 정규화가 없으면 CRLF 파일은 한 글자만 쳐도 영구 dirty가 되어 되돌려도 저장표시가 안 풀린다.
- **FR-005**: 편집 모델은 **멀티버퍼(VS Code 식)** — 파일을 전환해도 각 파일의 미저장 편집을 **메모리 버퍼에 보존**한다. 강제 "버리고 이동" 확인(native `window.confirm`)을 두지 않는다(이 Electron 호스트는 native dialog가 불안정하고, 강제 버리기는 IDE와 다름). 따라서 여러 파일을 동시에 미저장 상태로 두고 자유로이 오갈 수 있으며, 각 미저장 파일은 트리에 마커로 표시된다(FR-014). 파일을 휴지통/이름변경하면 해당 버퍼도 정리/이동된다.
- **FR-006**: 바이너리/초대형(>512KB) 파일은 렌더하지 않고 명확히 안내해야 한다.
- **FR-007**: 우클릭 메뉴로 이름변경(인라인)·복사·삭제(휴지통)·새 폴더를 제공해야 한다. 빈 곳 우클릭은 "새 폴더"(루트)만.
- **FR-008**: 삭제는 영구삭제가 아니라 OS 휴지통으로 보내야 한다(복구 가능). 분석 루트 자체는 삭제 불가.
- **FR-009**: 새 폴더는 안 겹치는 기본명 생성 후 즉시 인라인 명명한다(prompt 미사용 — Electron 제약). 생성 **기준 폴더**는 트리 선택을 따른다(VS Code 식) — 선택이 **폴더면 그 폴더 아래**, **파일이면 그 부모 아래**, 선택 없으면 **루트**. 폴더는 클릭으로 선택(하이라이트)되며, 빈 곳 우클릭 "새 폴더"는 기준 폴더명을 함께 표시한다.
- **FR-010**: 모든 FS 접근(목록·읽기·쓰기·이름변경·복사·삭제·새폴더)은 데스크톱 호스트 IPC 경유이며, 호스트가 모든 경로를 **분석 루트 하위로 한정**해야 한다(경로 탈출·심볼릭링크 추종 차단).
- **FR-011**: 분석은 **선택된 폴더(루트) 전체**를 대상으로 한다 — 포함/제외 범위선택 UI는 두지 않는다(Non-Goal).
- **FR-012**: 기존 자동 언어·DDL/프로시저 분류를 보존한다 — 수동 라벨링을 도입하지 않는다.
- **FR-013**: 이 기능은 로컬 경로(Electron 임베드) 모드 전용이다; 브라우저 업로드 흐름은 영향받지 않아야 한다.
- **FR-015 (★중요 뿌리)**: **네이티브 대화상자(`window.confirm`/`alert`/`prompt`) 사용 금지.** 이 Electron 임베드 호스트에서는 이들 호출 후 **렌더러가 키보드 포커스를 잃어 이후 모든 입력(파일 편집 포함)이 막힌다**(편집불가 회귀의 진짜 원인 — 삭제(confirm)·에러(alert)·옛 이름변경(prompt) 모두 해당). 확인은 **인앱 모달**, 안내/에러는 **인앱 토스트**로 처리한다. (이름변경/새폴더가 인라인인 것도 같은 이유 — FR-009.)
- **FR-014**: 미저장(dirty) 파일은 좌측 트리 행에 시각 마커로 표시하고, 저장 또는 원본 복원 시 마커를 해제해야 한다(IDE식). 마커 배치는 VS Code 관행을 따른다 — **점은 행 맨 오른쪽에 고정**(이름 말줄임표와 충돌 금지), **파일명은 강조색**으로. 활성 파일의 마커·저장버튼은 동일 `isDirty`(편집내용 ≠ 저장본)에 묶여 함께 나타나고 함께 사라진다. 멀티버퍼(FR-005)이므로 마커는 **미저장 편집을 가진 모든 파일**에 동시에 나타난다.

### Key Entities *(include if feature involves data)*

- **Source Tree Node(소스 트리 노드)**: 루트 아래 파일/폴더 — 경로·이름·타입(파일/폴더)·크기. 지연 로드(`childrenByPath` 맵).
- **File Preview/Edit State(미리보기·편집 상태)**: 선택 파일의 내용(`editContent`)·저장기준(`originalContent`)·상태(empty/loading/text/binary/too-large/error)·dirty 여부.
- **Host FS Contract(호스트 FS 계약)**: `window.desktop.fs` — listDir·readFile·writeFile·rename·copy·trash·mkdir. 봉투 `{ ok, data?, error? }`. (아래 Host Contract 참조)

## Success Criteria *(mandatory)*

- **SC-001**: 분석 전에 사용자가 폴더 트리를 펼쳐 구조 전체를 볼 수 있다.
- **SC-002**: 텍스트 파일을 열어 읽고, 고쳐 저장하면 디스크에 반영된다.
- **SC-003**: 편집을 원본과 같게 되돌리면 저장 수단이 사라진다(불필요한 저장 유도 없음).
- **SC-004**: 이름변경·복사·삭제(휴지통)·새 폴더가 우클릭으로 동작하고, 삭제는 복구 가능하다.
- **SC-005**: 어떤 FS 작업도 분석 루트 밖을 건드릴 수 없다.
- **SC-006**: 바이너리/초대형 파일은 안전하게 비렌더 처리된다.
- **SC-007**: 포함 범위 분석 산출물 품질이 기존 폴더 통째 동작과 동일하다.

## Host Contract (robo-architect 데스크톱 — 호스트 절반)

이 기능의 FS 접근은 robo-architect 데스크톱 호스트가 IPC로 제공한다. **계약 단일 진실**: `robo-architect/desktop/src/shared/fs-browser-contract.ts`, 구현: `desktop/src/main/fs-browser.ts`, 노출: `desktop/src/preload/index.ts`(`window.desktop.fs`).

| 채널 | 입력 | 반환 | 비고 |
|---|---|---|---|
| `fs:listDir` | `{root, path}` | `FsEntry[]` | 즉시 자식. 폴더 먼저·이름순. 심볼릭/특수 제외. |
| `fs:readFile` | `{root, path}` | `{kind:'text',content}` \| `{kind:'binary'}` \| `{kind:'too-large',size}` | NUL바이트=바이너리. 상한 512KB. |
| `fs:writeFile` | `{root, path, content}` | `{ok:true}` | 폴더엔 못 씀. |
| `fs:rename` | `{root, from, to}` | `{ok:true}` | 이동/이름변경. |
| `fs:copy` | `{root, from, to}` | `{ok:true}` | 폴더 재귀 복사. |
| `fs:trash` | `{root, path}` | `{ok:true}` | `shell.trashItem`(휴지통). 루트 자체 거부. |
| `fs:mkdir` | `{root, path}` | `{ok:true}` | 비재귀. EEXIST 안내. |

**보안 불변식**: `resolveWithinRoot(root, target)` — 모든 경로가 `root` 자신이거나 그 하위인지 검증, 위반 시 거부. 절대경로 우회·`..` 탈출·심볼릭 링크 추종 차단.

## Assumptions

- **경로 모드 전용**: Electron 임베드 로컬 경로 흐름. 브라우저 업로드 모드는 현행 입력 UI 유지.
- **로컬 FS 접근은 호스트 경유**: 렌더러는 디스크를 직접 못 읽는다; 모두 IPC.
- **분석=루트 전체**: 포함/제외 없음(결정). 범위 출력 = 선택된 루트 폴더 그대로 통합 입구(antlr)로.
- **호스트 UX와 일관**: 트리/인라인 이름변경/우클릭 경험을 robo-architect Code 탭 `FileTreePane.vue`와 일관되게.

## Dependencies & Cross-Service Impact

- **데스크톱 호스트(robo-architect)**: 위 Host Contract(IPC 7채널). 이 절반은 robo-architect 측 작업이며 본 스펙의 표(Host Contract)가 계약 진실. *(robo-architect 쪽 미커밋: `fs-browser.ts`·`fs-browser-contract.ts` 신규 + main/index.ts·preload·App.vue 수정)*
- **↓ antlr-code-parser**: 선택된 루트 폴더를 받아 표준 `data/`로 반입(범위선택 없으므로 루트 전체).
- **↓ robo-data-analyzer**: `data/`만 소비.
- **architect App.vue**: Analysis 탭에서 좌측 도메인 Navigator를 숨김(이 기능 화면과 무관한 통계 패널 제거).

## Implementation Map (구현 위치)

- **`src/features/code-analysis/components/upload/ScopeBrowser.vue`** — 트리·미리보기·편집·우클릭·인라인 이름변경 전부.
- **`src/features/code-analysis/components/upload/UploadTab.vue`** — 경로 모드에서 ScopeBrowser를 `.upload-tab` 직계로 두어 전체 높이 채움(업로드 모드는 `v-else`).

## Remaining (정리 항목 — SDD로 추적, 땜빵 금지)

1. **`@keydown.stop` 땜빵 제거**: ScopeBrowser 인라인 이름변경 입력의 `@keydown.stop`은 불필요(전역 키 인터셉터 부재 확인 완료 — open-pencil 등 모든 전역 keydown은 input/textarea를 가드함). 진짜 수정은 `renameValue` 평탄 ref 리팩토링이었다. 제거 후 런타임 회귀 검증.
2. **빈 곳 우클릭(루트) 메뉴 렌더**: `openRootCtx`로 `ctx.entry=null` 설정되나, 메뉴 `v-if="ctx.visible && ctx.entry"`라 루트 케이스가 렌더 안 됨. → `ctx.visible`만으로 열고 `entry=null`이면 "새 폴더"만 표시하도록 정합.
3. **편집 textarea 런타임 검증**: 정적 정상(평탄 ref v-model). 실제 Electron에서 입력·저장·dirty 동작 최종 확인.
4. **미커밋 정리 후 커밋·서브모듈 동기화**: analyzer 본체(ScopeBrowser/UploadTab/features) + architect 호스트(fs-browser 신규·main/preload/App.vue) + 서브모듈 포인터 bump.
