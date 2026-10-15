# 스토리 게임 서재

Dollars Archive의 레트로 스토리 게임 및 Nintendo Switch·PS Vita 비주얼 노벨 서재입니다.

[서재 열기](https://dollars-archive.github.io/Game-Story-Library/)

- [레트로 서재](https://dollars-archive.github.io/Game-Story-Library/retro-story-library.html): 503개 작품
- [Switch·Vita 서재](https://dollars-archive.github.io/Game-Story-Library/switch-vita-vn.html): 536개 작품

사용자가 제공한 두 HTML의 데이터·이미지와 기존 검색·필터·상세 보기를 보존하며, 게임별 찜과 찜만 보기 기능을 제공합니다. 작품별 한국어화 기록과 점수는 자료의 확인 범위에 따라 해석하며, 최신 상태나 실기 적용 성공을 보장하지 않습니다.

## 찜 사용하기

게임 카드에서 `☆ 찜`을 누르면 `★ 찜됨`으로 바뀝니다. `★ 찜만 보기`를 선택하면 찜한 작품 중 현재 검색·기종·장르 등 필터에 맞는 게임만 표시합니다. 초기화는 필터를 해제하며 저장된 찜은 삭제하지 않습니다.

찜은 발굴 아카이브와 같은 **GitHub 편집 열쇠** 방식으로 기기 간 연동합니다. 페이지의 `⚙ 찜 편집 열쇠 · 기기 간 연동`에서 열쇠를 각 기기에 저장하세요. 같은 브라우저에 발굴 아카이브 열쇠가 있으면 먼저 사용합니다. 열쇠에는 `Game-Story-Library` 저장소의 `Contents: Read and write` 권한이 필요합니다. 설정에 열쇠를 미리 노출하지 않으며, 열쇠는 브라우저에만 보관하고 GitHub API 인증에만 사용합니다.

찜 목록은 공개 저장소의 `watchlist-data` 브랜치 `docs/data/favorites.json`에 저장합니다. 열쇠가 없는 기기도 저장된 찜을 읽을 수 있고, 열쇠 없이 추가·해제한 내용은 해당 브라우저에 보관합니다. 기존 브라우저의 찜은 처음 편집 연동할 때 합치며, 다른 기기에서 해제한 찜은 다시 살리지 않습니다. 레트로·Switch/Vita 목록은 구분합니다.

페이지를 열거나 돌아왔을 때, 또는 `찜 새로고침`을 누르면 최신 내용을 읽습니다. 저장 충돌 시 최신 파일에 변경한 항목만 합쳐 재시도합니다. 연결 실패 시 저장 대기 내용을 이 기기에 남기고 다시 연결했을 때 재시도합니다. 브라우저 데이터 삭제 시 아직 GitHub에 저장되지 않은 변경과 열쇠는 사라집니다. 브라우저 저장을 사용할 수 없으면 현재 화면에서만 유지된다는 안내를 표시합니다.

## 배포 준비

`docs/data/favorites.json`은 빈 데이터 양식입니다. **실제 찜 데이터가 있는 브랜치를 이 빈 양식으로 덮어쓰지 않습니다.** 첫 게시 때 `watchlist-data` 브랜치를 확인하고, 없을 때만 새 브랜치와 데이터 파일을 준비합니다. 이후 사이트 수정은 main에, 실제 찜 저장은 watchlist-data에 분리합니다. 별도 DB·OAuth 앱은 필요하지 않습니다.

## 검증

`node --test tests/favorites.cjs tests/favorites-sync.cjs`

기존 검색·필터·찜 저장, 두 기기 가져오기·해제, 저장 충돌, 서재 구분, 오프라인 재시도, 잘못된 열쇠·권한 오류와 실제 페이지 연결을 검증합니다.

## 파일과 출처

2026-10-13에 전달받은 원본 파일입니다. 아래 해시는 최초 제공 원본의 해시이며, 이후 찜 기능을 추가한 현재 게시 파일의 해시와는 다릅니다. 게임 데이터와 출처는 보존합니다.

| 제공 파일 | 게시 파일 | 최초 제공 원본 SHA256 |
|---|---|---|
| 레트로_스토리_게임_서재.html | docs/retro-story-library.html | 00cff0da7a75505bdeb3dbac7f9bc289352b06609099c5c503b811442638296f |
| Switch_Vita_VN_Catalogue.html | docs/switch-vita-vn.html | 02726b7faa9e8388c259fdfc2dbd28fcc6ad887aa0799a0d36b53d463c49cf86 |

GitHub Pages는 main 브랜치의 docs 폴더를 게시합니다. HTML 내부에 자료와 이미지가 포함되어 있고, 외부 검색 및 출처 링크는 인터넷 연결이 필요합니다.
