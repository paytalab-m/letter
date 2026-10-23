# 패스오더 편지 린테스트 · 랜딩 3종

| 페이지 | 주소 | 들어오는 경로 |
|---|---|---|
| 모집 | https://paytalab-m.github.io/letter/landing/ | 모집 메시지 버튼 (`?uid=&sid=&grp=&g=&src=&store=&nick=&close=`) |
| 내 편지 | https://paytalab-m.github.io/letter/my-letter/ | 도착 · 리마인드 알림톡 버튼 (`?uid=&store=&nick=&due=&sent=`) |
| 점주 QR | https://paytalab-m.github.io/letter/owner-qr/ | 편지 속 QR (`?c=편지코드`) |

- 신청 · 기록은 구글 시트(Apps Script 웹 앱)로 들어갑니다. 주소는 각 폴더 `config.js`의 `SUBMIT_URL`.
- 내 편지 · 점주 QR 링크는 시트 「편지」 탭에서 편지마다 자동으로 만들어집니다(도착일 입력 시).
- `apps-script/Code.gs`는 시트에 붙은 스크립트의 사본입니다. 신청 마감은 랜딩에서 막지 않고 메시지 발송 단계에서 제어합니다.
- 회원 명단 · 시트 데이터는 이 저장소에 올리지 않습니다.
