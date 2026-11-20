// 편지 신청을 「신청」 시트에, 페이지 방문을 「방문」 시트에 한 줄씩 쌓습니다.
// 배포: 확장 프로그램 → Apps Script → 이 코드 붙여넣기 → 배포 → 새 배포 → 웹 앱
//       (실행 계정: 나, 액세스 권한: 모든 사용자) → 웹 앱 URL을 config.js의 SUBMIT_URL에 넣기
//
// 개인화: 메시지 링크에는 ?t=열쇠 하나만 붙인다. 열쇠로 「모집대상」 시트를 찾아
//   - GET  : 화면에 쓸 매장명 · 닉네임 · 요청 수 · 첫 참여 · 경로만 돌려준다 (회원ID 등은 밖으로 내보내지 않음)
//   - POST : 방문 · 신청을 기록할 때 회원ID · 매장ID · 소구 · 경로 · 매장명을 시트 값으로 채운다
//
// 페이지가 보내는 요청 (type)
//   visit : 페이지를 열었을 때 → 「방문」에 한 줄 추가
//   step  : 신청 화면으로 넘어갔을 때 → 「방문」의 도달 단계 갱신
//   apply : 신청했을 때 (type 없는 예전 요청도 신청으로 처리) → 「신청」에 한 줄 추가 + 「방문」 갱신
//   delivered : 「내 편지」에서 「편지 건넸어요」를 눌렀을 때 → 「전달」에 한 줄 추가 + 「모집대상」 전달 기록 Y
//   letter_view : 「내 편지」를 열었을 때 → 「열람」에 한 줄 추가 + 「모집대상」 내 편지 열람 Y
//   scan    : 사장님이 편지 QR(점주 페이지)을 열었을 때 → 「QR 접속」에 한 줄 + 「모집대상」 QR 접속 Y
//   inquiry : 사장님이 전화 안내를 신청했을 때 → 「문의」에 한 줄 + 「모집대상」 사장님 문의 Y (10/23 이전 방식)
//   contact_click : 사장님이 「안내 신청하기」로 비즈 입점 문의(/contact)에 넘어갈 때 → 「문의」에 처리상태 「biz 이동」으로 한 줄.
//                   실제 접수는 슬랙 #00랜딩문의알림의 utm_content(= 편지코드)로 확인해 처리상태를 「접수」로 바꾼다
//
// 10/23: 모집 · 내 편지는 링크에 값(uid · sid · grp · g · src · store · nick 등)을 넣는 방식, 점주 QR은 편지코드(?c=) 방식.
//   uid가 오면 「모집대상」에서 그 손님 줄을 찾아 열쇠 · 매장ID를 잇는다(10/15 예전 명단에 있는 손님만).
//   가게당 3명 · 우편 정원 마감은 랜딩에서 막지 않고 CRM 발송 단계에서 한다(「마감 관리」 탭 참고).
//   GET ?sid=&grp=&store= → 마감 여부 { closed, reason }
//   링크의 la(편지 종류 1·2·3) · qr(1 = QR 있음, 0 = QR 없음) · w(차수)는 명단의 letter_arm · qr_arm · wave. 편지 탭에 그대로 옮겨 인쇄 기준으로 쓴다.
//   QR 없음 가게의 편지는 점주 QR 링크를 비운다(편지에 QR을 넣지 않음).
//
// 편지 한 통 = 신청 한 건. 편지코드(점주 QR의 ?c=)는 신청번호를 그대로 쓴다.
// 신청이 들어오면 「편지」 탭에 한 줄이 생기고, 도착일을 적으면 전달 · 문의 기한과 내 편지 · 점주 QR 링크가 자동으로 만들어진다.

var APPLY_HEAD = ['신청번호', '신청시각', '진입시각', '소요시간(초)', '회원ID', '열쇠', '매장ID', '소구', '경로', '매장', '표시 숫자', '첫 참여', '닉네임', '닉네임 변경', '받는 분', '우편번호', '주소', '상세 주소', '기기', '열린 앱', '유입 URL', '요일', '시간대', '중복 신청', '처리상태', '편지 발송일', '운송장번호', '사장님 문의 여부', '참여쿠폰 지급일', '성공쿠폰 지급일', '메모', '시험', '편지 종류', 'QR 여부', '차수'];
var VISIT_HEAD = ['방문ID', '진입시각', '회원ID', '열쇠', '매장ID', '소구', '경로', '매장', '기기', '열린 앱', '도달 단계', '신청화면 진입시각', '신청시각', '유입 URL', '시험', '차수', '들어온 메시지'];
var DELIV_HEAD = ['기록시각', '열쇠', '회원ID', '매장ID', '매장', '닉네임', '건넨 날', '누구에게', '신청번호', '기기', '열린 앱', '유입 URL', '참여쿠폰 지급일', '메모', '건넨 뒤 체크'];
var STEP_COL = 11, FORM_AT_COL = 12, APPLY_AT_COL = 13; // 「방문」의 도달 단계 · 신청화면 진입시각 · 신청시각 열
var DELIV_MARK_COL = 14; // 「모집대상」 N열 「전달 기록」
var VIEW_HEAD = ['열람시각', '열쇠', '회원ID', '매장ID', '매장', '전달 기한', '이미 기록함', '기기', '열린 앱', '유입 URL', '들어온 메시지', '브라우저 번호', '기기 특징'];
var VIEW_MARK_COL = 15; // 「모집대상」 O열 「내 편지 열람」
var STEPS = ['랜딩', '신청화면', '신청완료'];
// 마감 규칙: 랜딩에서 신청 마감을 막지 않음 (2026-10-23 사용자 결정). 다시 켜려면 숫자를 넣고 새 버전 배포
var STORE_CAP = 0;                    // 가게당 인원 마감 (예: 3). 0이면 안 씀
var QUOTA = {};                       // 시험별 우편 정원 (예: { s: 1505, q: 801 }). 비우면 안 씀
var QUOTA_ALL = 0;                    // 전체 정원. 0이면 안 씀
var APPLY_CLOSE_AT = new Date('2026-11-13T10:00:00+09:00');   // 3차 신청 마감: 2026-11-13(금) 오전 10시(한국 시각)로 당김(사용자 결정 2026-11-13, 원래 11-14 0시)부터 신청 거절 · 랜딩은 마감 화면(3일차 모집 11/11 발송 + 2일, 2026-11-11). 2차는 11-10 0시 마감이었음
var APPLY_CLOSED = new Date() >= APPLY_CLOSE_AT;   // 요청마다 다시 계산됨. 11-03~11-06은 true(전체 마감), 11-06~11-09 열림. 다시 열려면 날짜를 바꾸고 새 버전 배포
var APPLY_GRP_COL = 32;               // 「신청」 AF열 「시험」
var LETTER_HEAD = ['신청번호', '신청시각', '열쇠', '매장ID', '매장', '닉네임', '발송일', '운송장번호', '도착일', '전달 기한', '문의 기한', '리마인드 발송일', '내 편지 링크', '점주 QR 링크', '메모', '회원ID', '시험', '편지 종류', 'QR 여부', '인쇄 회차', '인쇄일', '도착 알림 링크', '리마인드 링크', '도착 알림 발송일'];
var PRINT_ROUND_COL = 20, PRINT_DATE_COL = 21; // 「편지」 T · U열
var CLOSED_DB_ID = '1s3S_jX01KEKfbqD_AOG9SkcaIjLniuqdvJaPLiN2kyM';   // 네이버 플레이스 기반 신규 매장 데이터(폐업 매장 DB 탭) · 2026-11-12
var GUIDE_COL = 26;   // 「편지」 Z열 「안내지 QR 주소」(손님 안내지 QR = 그 손님의 「내 편지」 짧은 주소)
var SCAN_HEAD = ['접속시각', '편지코드', '열쇠', '매장ID', '매장', '손님 전달 기록 있음', '기기', '열린 앱', '유입 URL', '브라우저 번호', '기기 특징', '신청자 판정'];
var INQ_HEAD = ['접수시각', '편지코드', '열쇠', '매장ID', '매장', '손님 닉네임', '전화번호', '통화 시간대', '매장 첫 문의', '기기', '유입 URL', '처리상태', '첫 통화일', '결과', '성공쿠폰 지급일', '메모', '다시 보냄', '슬랙 알림', '브라우저 번호', '기기 특징', '신청자 판정'];
var QR_MARK_COL = 16, INQ_MARK_COL = 17; // 「모집대상」 P열 「QR 접속」 · Q열 「사장님 문의」
// 링크 주소 (정식 계정으로 옮기면 여기 두 줄만 바꾼다)
var MYLETTER_URL = 'https://paytalab-m.github.io/letter/my-letter/';
var OWNER_URL = 'https://paytalab-m.github.io/letter/owner-qr/';

function doGet(e) {
  var q = e.parameter || {};
  var out = { ok: false };
  if (q.k) {
    // 짧은 주소(go/?k=코드) → 원래 긴 주소. 메시지 변수 길이 제한 때문에 링크를 줄여 보냄(2026-10-27)
    var lk = linkOf(q.k);
    if (lk) out = { ok: true, url: lk };
  } else if (q.code && isDmCode(q.code)) {
    // 수요 안내 랜딩(letter/req/): 매장명 · 문의 기한만(2026-11-20)
    var cs = dmStore(q.code);
    if (cs) out = { ok: true, store: cs.store, nick: '', due: cs.due };
  } else if (q.code) { // c는 Apps Script 웹 앱이 예약한 이름이라 조회에는 code를 쓴다
    // 점주 페이지: 편지코드로 매장명 · 편지 전한 손님 닉네임 · 문의 기한만 돌려준다
    var lp = letter(q.code);
    if (lp) out = { ok: true, store: lp.store, nick: lp.nick, due: lp.due };
  } else if (q.fix) {
    out = fixInfo(String(q.fix));   // 주소 다시 적기 화면(letter/fix): 받는 주소 확인용 정보(상세 주소 · 이름 가림)
  } else if (q.closed) {
    // 모집 명단 채우기(fill_list.py): 신청이 가게당 마감 인원(「마감 관리」 B3) 이상인 가게ID만 돌려준다
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cap = Number(ss.getSheetByName('마감 관리') ? ss.getSheetByName('마감 관리').getRange('B3').getValue() : 3) || 3;
    var ap = ss.getSheetByName('신청'), cnt = {};
    if (ap && ap.getLastRow() > 1) ap.getRange(2, 7, ap.getLastRow() - 1, 1).getValues().forEach(function (r) { var k = String(r[0]); if (k) cnt[k] = (cnt[k] || 0) + 1; });
    // 그룹별 우편 정원 · 신청 · 남은 정원(「마감 관리」 A6:E7) → 정원이 찬 그룹은 다음 묶음에서 뺌
    var grp = {};
    if (ss.getSheetByName('마감 관리')) ss.getSheetByName('마감 관리').getRange('A6:E7').getValues().forEach(function (r) {
      if (r[0]) grp[String(r[0])] = { quota: Number(r[2]) || 0, apps: Number(r[3]) || 0, left: Number(r[4]) || 0 };
    });
    // 모집 메시지 #{신청마감일} = 묶음 발송일 + 「마감 관리」 B23일(2026-10-27 결정 · 기본 3일)
    var rd = ss.getSheetByName('마감 관리') ? Number(ss.getSheetByName('마감 관리').getRange('B23').getValue()) : NaN;
    out = { ok: true, cap: cap, sids: Object.keys(cnt).filter(function (k) { return cnt[k] >= cap; }), groups: grp, recruit_days: isNaN(rd) || !rd ? 3 : rd };
  } else if (q.t) {
    var p = target(q.t);
    if (p) out = { ok: true, store: p.store, nick: p.nick, n: p.n, first: p.first, src: p.src };
  } else if (q.store_id || q.grp || q.store) {
    // 모집 랜딩: 가게당 3명 · 정원 마감 여부 (sid · c는 Apps Script 예약어라 조회에는 store_id · code를 쓴다)
    var st = status_(q.store_id || '', q.grp || '', q.store || '', '');
    out = { ok: true, closed: st.closed, reason: st.reason };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var d = JSON.parse(e.postData.contents);
  if (d.type === 'addr_fix') return ContentService.createTextOutput(JSON.stringify(addrFix(d))).setMimeType(ContentService.MimeType.JSON);
  if (d.type === 'print_list' || d.type === 'print_mark' || d.type === 'sent_mark' || d.type === 'letter_ids' || d.type === 'landing_list' || d.type === 'phone_keys_put' || d.type === 'letter_text_put' || d.type === 'inq_slack_test' || d.type === 'closed_list' || d.type === 'store_hist_put' || d.type === 'store_hist_test') return ContentService.createTextOutput(JSON.stringify(printOps(d))).setMimeType(ContentService.MimeType.JSON);
  if (d.type === 'send_list') return ContentService.createTextOutput(JSON.stringify(sendList(d))).setMimeType(ContentService.MimeType.JSON);
  if (d.type === 'apply_slack_test') {   // 신청 알림 시험(비밀번호 = 「설정」 B2). 시트에는 아무것도 적지 않음
    var ok = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    return ContentService.createTextOutput(JSON.stringify(ok ? { ok: true, slack: notifyApply({ store: '테스트매장', nick: '테스트', grp: 's', la: '1', g: '1', src: 'call', w: '1', vid: 'TEST-0001', sid: '', ref: 'utm_content=ltr_rcr_benefit&utm_term=ltr_selftest_b1' }) } : { ok: false, reason: 'token' })).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'msg_test' || d.type === 'msg_run') {   // 알림톡 시험(uid 한 명에게 견본 값으로) · 지금 한 번 돌리기. 비밀번호 = 「설정」 B2
    var okM = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    return ContentService.createTextOutput(JSON.stringify(!okM ? { ok: false, reason: 'token' } : d.type === 'msg_test' ? msgTest(d.kind, d.uid) : dailyLetterJob())).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'slack_check') {   // 봇 토큰(설정 B7) 점검: 권한 목록 · 채널 읽기 되는지(토큰 값은 돌려주지 않음). 비밀번호 = 「설정」 B2
    var okS = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    if (!okS) return ContentService.createTextOutput(JSON.stringify({ ok: false, reason: 'token' })).setMimeType(ContentService.MimeType.JSON);
    var bt = setting('B7'), out = { has_token: !!bt, kind: bt.slice(0, 5) };
    if (bt) {
      var ar = UrlFetchApp.fetch('https://slack.com/api/auth.test', { method: 'post', headers: { Authorization: 'Bearer ' + bt }, muteHttpExceptions: true });
      var aj = JSON.parse(ar.getContentText()), hd = ar.getHeaders();
      out.auth = { ok: aj.ok, error: aj.error, team: aj.team, bot: aj.user };
      out.scopes = hd['x-oauth-scopes'] || hd['X-OAuth-Scopes'] || '';
      var hj = slackApi('conversations.history', { channel: LANDING_CH, limit: 1 });
      out.history = { ok: hj.ok, error: hj.error, needed: hj.needed };
    }
    return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'dm_sync' || d.type === 'dm_run' || d.type === 'dm_preview') {   // 수요 안내 메시지: 노션 읽기만 · 지금 한 번 돌리기 · 보낼 본문 미리 보기(안 보냄). 비밀번호 = 「설정」 B2
    var okC = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    var rc = !okC ? { ok: false, reason: 'token' } : d.type === 'dm_sync' ? dmSync() : d.type === 'dm_preview' ? dmPreview(d.code) : dmJob();
    return ContentService.createTextOutput(JSON.stringify(rc)).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'trigger_list') {   // 걸려 있는 자동 실행(트리거) 목록. 비밀번호 = 「설정」 B2
    var okT2 = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    var tl = okT2 ? ScriptApp.getProjectTriggers().map(function (t) { return t.getHandlerFunction() + ' · ' + t.getEventType(); }) : null;
    return ContentService.createTextOutput(JSON.stringify(okT2 ? { ok: true, triggers: tl, landing_last: PropertiesService.getScriptProperties().getProperty('LANDING_LAST_TS') } : { ok: false })).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'landing_export') {   // 지난 랜딩 문의(매칭률 가늠용): 시각 · 매장 이름 · 지역 · 연락처 해시 앞 16자만(번호 원문은 돌려주지 않음). 비밀번호 = 「설정」 B2
    var okE = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    if (!okE) return ContentService.createTextOutput(JSON.stringify({ ok: false, reason: 'token' })).setMimeType(ContentService.MimeType.JSON);
    var rowsE = [], cur = '', guard = 0;
    do {
      var pg = slackApi('conversations.history', { channel: LANDING_CH, limit: 200, cursor: cur || undefined, oldest: d.oldest || '0' });
      if (!pg.ok) return ContentService.createTextOutput(JSON.stringify({ ok: false, error: pg.error })).setMimeType(ContentService.MimeType.JSON);
      (pg.messages || []).forEach(function (m) {
        var t = String(m.text || ''), q = parseLanding(t);
        if (!q) return;
        var no = q.phone.replace(/\D/g, ''), hx = no.length >= 9 ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, no).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 16) : '';
        rowsE.push([Utilities.formatDate(new Date(Number(m.ts) * 1000), 'Asia/Seoul', 'yyyy-MM-dd HH:mm'), q.name, ((t.match(/\*지역\*\s*([^|\n]+)/) || [])[1] || '').trim(), hx]);
      });
      cur = pg.response_metadata && pg.response_metadata.next_cursor;
    } while (cur && ++guard < (d.pages || 5) && rowsE.length < (d.max || 1000));
    return ContentService.createTextOutput(JSON.stringify({ ok: true, n: rowsE.length, rows: rowsE })).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'apply_delete') {   // 시험 · 잘못 들어간 신청을 신청 · 편지 · 방문에서 지움(되돌릴 수 없음). empty: true면 신청시각이 빈 신청도 함께. 비밀번호 = 「설정」 B2
    var okDel = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    if (!okDel) return ContentService.createTextOutput(JSON.stringify({ ok: false })).setMimeType(ContentService.MimeType.JSON);
    var wantD = {}, gone = {}, ssD = SpreadsheetApp.getActiveSpreadsheet(); (d.codes || []).forEach(function (c) { if (c) wantD[String(c)] = true; });
    var lockD = LockService.getScriptLock(); lockD.waitLock(20000);
    try {
      var AD = ssD.getSheetByName('신청');
      if (d.empty && AD.getLastRow() > 1) AD.getRange(2, 1, AD.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[0] && !r[1]) wantD[String(r[0])] = true; });
      ['신청', '편지', '방문'].forEach(function (nm) {
        var sh = ssD.getSheetByName(nm); gone[nm] = 0;
        if (!sh || sh.getLastRow() < 2) return;
        var col = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
        for (var i = col.length - 1; i >= 0; i--) if (wantD[String(col[i][0])]) { sh.deleteRow(i + 2); gone[nm]++; }
      });
    } finally { lockD.releaseLock(); }
    return ContentService.createTextOutput(JSON.stringify({ ok: true, codes: Object.keys(wantD), deleted: gone })).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'addr_move') {   // 신청번호 목록을 「주소 오류」 탭으로 옮김(신청 · 편지에서 뺌). 비밀번호 = 「설정」 B2
    var okMv = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    return ContentService.createTextOutput(JSON.stringify(okMv ? { ok: true, moved: moveWrongAddr(d.codes, d.reason || '받는 주소 = 매장 주소') } : { ok: false })).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'applicant_addr_keys') {   // 신청 주소가 매장 주소인지 점검용: 신청번호 · 매장ID · 주소키 해시 · 신호만(주소 원문은 돌려주지 않음). 비밀번호 = 「설정」 B2
    var okK = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    if (!okK) return ContentService.createTextOutput(JSON.stringify({ ok: false })).setMimeType(ContentService.MimeType.JSON);
    var wrongTab = d.tab === '주소 오류', AP = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(wrongTab ? '주소 오류' : '신청'), outK = [];   // 「주소 오류」 탭은 앞에 2칸(옮긴 시각 · 사유)이 더 있음
    AP.getRange(2, 1, AP.getLastRow() - 1, wrongTab ? 20 : 18).getValues().forEach(function (r) {
      if (wrongTab) r = r.slice(2);
      if (!r[0]) return;
      var full = String(r[16]) + ' ' + String(r[17]), sn = normName(r[9]), an = normName(full), k = addrKey(r[16]);
      var brand = sn.replace(/(점|본점|직영점)$/, '').slice(0, 4);
      outK.push([String(r[0]), String(r[6]), k ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, k, Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 12) : '', brand.length >= 2 && an.indexOf(brand) >= 0 ? 1 : 0,
        /상가|1층|지하|매장|카페|커피|점\b/.test(full) ? 1 : 0, /아파트|apt|빌라|오피스텔|\d+동\s*\d+호|\d+-\d+호/i.test(full) ? 1 : 0,
        String(r[17]).replace(/\D/g, '') ? sha12(String(r[17]).replace(/\D/g, '')) : '',   // 상세주소의 숫자만(층 · 호수) 해시 → 매장 상세주소와 비교
        String(r[15]).replace(/\D/g, '') ? sha12(String(r[15]).replace(/\D/g, '')) : '',   // 우편번호 해시(2026-10-30: 도로명을 못 읽은 주소도 매장 우편번호와 비교)
        normAddr(r[16]) ? sha12(normAddr(r[16])) : '', normAddr(r[16]) ? sha12(normAddr(r[16]) + normAddr(r[17])) : '']);   // 주소 전체 · 주소 + 상세주소 완전 일치용(괄호 · 띄어쓰기 · 기호 뺀 글자)
    });
    return ContentService.createTextOutput(JSON.stringify({ ok: true, rows: outK })).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'landing_scan') {   // 최근 문의 n건을 읽어 이름 · 연락처를 뽑히는지와 짝 맞춘 결과만 셈(댓글 안 씀 · 연락처 값은 돌려주지 않음). 비밀번호 = 「설정」 B2
    var okC = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    if (!okC) return ContentService.createTextOutput(JSON.stringify({ ok: false, reason: 'token' })).setMimeType(ContentService.MimeType.JSON);
    var hs = slackApi('conversations.history', { channel: LANDING_CH, limit: d.n || 20 }), sto = deliveredStores(), sc = { read: 0, parsed: 0, phone: 0, matched: 0, names: [] };
    (hs.messages || []).forEach(function (m) {
      sc.read++;
      var q = parseLanding(m.text);
      if (!q) return;
      sc.parsed++; if (phoneHash(q.phone)) sc.phone++;
      if (sc.names.length < 5) sc.names.push(q.name);
      var mq = matchDelivered(q.name, q.phone, sto, q.region);
      if (mq && mq.sure) sc.matched++; else if (mq) sc.check = (sc.check || 0) + 1;
    });
    sc.ok = hs.ok; sc.error = hs.error; sc.delivered_stores = Object.keys(sto).length;
    return ContentService.createTextOutput(JSON.stringify(sc)).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'landing_test') {   // 랜딩 문의 댓글 미리 보기(슬랙에 안 씀): 견본 매장 댓글 + 실제 전달 매장과 짝 맞춘 결과. 비밀번호 = 「설정」 B2
    var okL = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    if (!okL) return ContentService.createTextOutput(JSON.stringify({ ok: false, reason: 'token' })).setMimeType(ContentService.MimeType.JSON);
    var st = deliveredStores(), mt = matchDelivered(d.name, d.phone, st, d.region);
    var one = { name: '견본매장', hand: [{ nick: '라떼좋아', day: '2026-11-14', at: '2026-11-14' }], qr: new Date('2026-11-15T10:00:00+09:00') };
    var two = { name: '견본매장', hand: [{ nick: '라떼좋아', day: '2026-11-14', at: '2026-11-14' }, { nick: '아침한잔', day: '2026-11-16', at: '2026-11-16' }], qr: null };
    return ContentService.createTextOutput(JSON.stringify({ ok: true, delivered_stores: Object.keys(st).length, match: mt ? { how: mt.how, store: mt.store.name, score: mt.score, sure: mt.sure } : null,
      sample_one: landingComment(one), sample_two: landingComment(two) })).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'track_test' || d.type === 'track_run') {   // 우체국 배달 조회 시험(rgist 한 건, 시트에 안 씀) · 지금 한 번 돌리기. 비밀번호 = 「설정」 B2
    var okT = d.token && d.token === String(SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정').getRange('B2').getValue());
    return ContentService.createTextOutput(JSON.stringify(!okT ? { ok: false, reason: 'token' } : d.type === 'track_test' ? trackOne(d.rgist) : trackArrivals())).setMimeType(ContentService.MimeType.JSON);
  }
  if (d.type === 'link_put') return ContentService.createTextOutput(JSON.stringify(linkPut(d))).setMimeType(ContentService.MimeType.JSON);
  if (!d.c && d.code) d.c = d.code;   // 10/23 점주 페이지는 code로 보냄
  if (d.store) d.store = String(d.store).replace(/[☎☏✆]|\uD83D[\uDCDE\uDCF1\uDCF2]/g, '').replace(/\s+/g, ' ').trim(); // 매장명의 ☎ 같은 전화 기호 제거
  var lp = d.c && !isDmCode(d.c) ? letter(d.c) : null;
  var cp = d.c && isDmCode(d.c) ? dmStore(d.c) : null;   // 수요 안내 랜딩(2026-11-20)
  if (cp) { d.store = cp.store; d.sid = cp.sid; d.nick = ''; }
  if (lp) { d.t = lp.t; d.nick = lp.nick; d.store = lp.store; d.sid = lp.sid; d.uid = d.uid || lp.uid; } // 점주 기록은 편지코드로 손님 · 매장을 시트 값으로 잇는다
  var p = target(d.t) || targetByUid(d.uid);
  // 링크에 값이 있으면 링크 값을, 없으면 「모집대상」 값을 쓴다
  if (p) { d.t = d.t || p.t; d.uid = d.uid || p.uid; d.sid = d.sid || p.sid; d.g = d.g || p.g; d.src = d.src || p.src; d.store = d.store || p.store; }
  var res = { ok: true }, applied = false;
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (cp && (d.type === 'scan' || d.type === 'inquiry' || d.type === 'contact_click')) dmLanding(d, cp);   // 수요 안내 랜딩은 「수요 안내 랜딩」 탭에만(편지 탭과 섞지 않음)
    else if (d.type === 'scan') { if (lp && letterPosted(lp.row)) { addScan(d); markCol(p, QR_MARK_COL); } else res.test = true; }   // 발송일 전 점주 QR 접속 = 시험(시험 인쇄 확인) → 기록 안 함(2026-11-02)
    else if (d.type === 'inquiry' || d.type === 'contact_click') { addInquiry(d); markCol(p, INQ_MARK_COL); }
    else if (d.type === 'letter_view') { if (letterSent(d.uid, d.store)) { addLetterView(d); markCol(p, VIEW_MARK_COL); if (/utm_content=ltr_guide_qr/.test(String(d.ref || ''))) guideArrival(d); } else res.test = true; }   // 발송일 전 「내 편지」 열람 = 시험(시험 인쇄 · 도착 알림 링크 확인) → 기록 안 함(2026-10-30)
    else if (d.type === 'delivered') { addDelivered(d); markCol(p, DELIV_MARK_COL); }
    else if (d.type === 'visit') { addVisit(d); mark(p, 1); }
    else if (d.type === 'step') { updateVisit(d, '신청화면', FORM_AT_COL); mark(p, 2); }
    else if (d.type || !d.vid || !d.name || !d.addr) res = { ok: false, reason: 'bad_request' };   // 신청은 type 없이 방문ID · 이름 · 주소가 있을 때만(2026-10-29: 모르는 요청이 빈 신청으로 들어간 일)
    else {
      var st = status_(d.sid || '', d.grp || '', d.store || '', d.uid || '');
      // 같은 방문에서 신청을 두 번 누름(편지코드 = 방문ID가 이미 있음): 회원ID가 없는 접속도 줄을 늘리지 않음
      if (d.vid && sheet('신청', APPLY_HEAD).getRange('A:A').createTextFinder(String(d.vid)).matchEntireCell(true).findNext()) st.dup = true;
      if (st.dup) res = { ok: true, dup: true };                 // 같은 손님이 같은 가게에 다시 누름: 줄을 늘리지 않음
      else if (st.closed) res = { ok: false, reason: st.reason }; // 마감
      else {
        if (!d.vid) d.vid = ('L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase();
        addApply(d); addLetter(d); updateVisit(d, '신청완료', APPLY_AT_COL); mark(p, 3);
        applied = true;
      }
    }
  } finally {
    lock.releaseLock();
  }
  if (applied) { try { notifyApply(d); } catch (err) {} }   // 슬랙 알림은 잠금 밖에서. 실패해도 신청은 그대로
  return ContentService.createTextOutput(JSON.stringify(res)).setMimeType(ContentService.MimeType.JSON);
}

// 「신청」 탭을 세어 마감인지 알려 줌. 가게는 매장ID(G), 없으면 매장 이름(J)으로 셈
function status_(sid, grp, store, uid) {
  var o = { closed: false, reason: '', dup: false };
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('신청');
  if (!sh || sh.getLastRow() < 2) return o;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, APPLY_GRP_COL).getValues();
  var key = sid || store, storeN = 0, grpN = 0;
  v.forEach(function (row) {
    var rk = row[6] ? String(row[6]) : String(row[9]);
    if (key && rk === key) { storeN++; if (uid && String(row[4]) === uid) o.dup = true; }
    if (grp && String(row[APPLY_GRP_COL - 1]) === grp) grpN++;
  });
  if (APPLY_CLOSED) { o.closed = true; o.reason = 'end'; }
  else if (grp && QUOTA[grp] && grpN >= QUOTA[grp]) { o.closed = true; o.reason = 'quota'; }
  else if (QUOTA_ALL && v.length >= QUOTA_ALL) { o.closed = true; o.reason = 'quota'; }
  else if (STORE_CAP && key && storeN >= STORE_CAP) { o.closed = true; o.reason = 'store'; }
  return o;
}

// 「모집대상」: 열쇠 · 회원ID · 매장ID · 매장명 · 닉네임 · 요청 수 · 첫 참여 · 소구 · 경로 · 발송시각
function target(t) {
  if (!t) return null;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('모집대상');
  if (!sh) return null;
  var found = sh.getRange('A:A').createTextFinder(String(t)).matchEntireCell(true).matchCase(true).findNext();
  if (!found || found.getRow() === 1) return null;
  var r = sh.getRange(found.getRow(), 1, 1, 9).getValues()[0];
  return {
    row: found.getRow(), t: String(r[0]),
    uid: String(r[1]), sid: String(r[2]), store: String(r[3]), nick: String(r[4]),
    n: r[5] === '' ? null : Number(r[5]), first: String(r[6]).toUpperCase() !== 'N',
    g: String(r[7]), src: String(r[8])
  };
}

// 회원ID(B열)로 「모집대상」 손님 줄을 찾는다 (10/23 링크 값 방식)
function targetByUid(uid) {
  if (!uid) return null;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('모집대상');
  if (!sh) return null;
  var found = sh.getRange('B:B').createTextFinder(String(uid)).matchEntireCell(true).findNext();
  if (!found || found.getRow() === 1) return null;
  return target(String(sh.getRange(found.getRow(), 1).getValue()));
}

// 「모집대상」 K~M(방문 · 신청화면 도달 · 신청 완료)에 Y를 적는다. level 1=방문, 2=신청화면까지, 3=신청까지.
// 1만 줄 넘는 명단에서 수식으로 세면 시트가 느려져서, 기록이 들어올 때 그 손님 줄에 직접 적는다
function mark(p, level) {
  if (!p) return;
  var flags = [['Y', level >= 2 ? 'Y' : '', level >= 3 ? 'Y' : '']];
  var range = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('모집대상').getRange(p.row, 11, 1, 3);
  var cur = range.getValues()[0];
  range.setValues([flags[0].map(function (v, i) { return v || cur[i]; })]); // 이미 Y인 칸은 지우지 않음
}

function markCol(p, col) {
  if (!p) return;
  SpreadsheetApp.getActiveSpreadsheet().getSheetByName('모집대상').getRange(p.row, col).setValue('Y');
}

// 「내 편지」를 열 때마다 한 줄. 도착 알림톡 · 리마인드 뒤 실제로 열어 봤는지(진단 지표) 보는 용도
// 손님이 안내지 QR로 「내 편지」에 처음 들어옴 = 편지가 실제로 도착함(2026-10-29).
// 그 손님 · 매장의 편지 중 도착일(I)이 빈 것에 오늘을 도착일로 적음 → 「도착 알림 대상」에 올라 다음 자동 발송(13시 · 19시)에 도착 알림톡이 나감.
// 안내지 QR · 「내 편지」 열람 여부와 관계없이 도착 알림톡 · 리마인드는 그대로 보냄(2026-11-16 사용자 결정. 전에는 X도 오늘로 적어 도착 알림톡을 건너뜀)
function guideArrival(d) {
  var L = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지');
  if (!L || L.getLastRow() < 2 || !d.uid) return;
  var v = L.getRange(2, 1, L.getLastRow() - 1, 24).getValues(), now = new Date();
  v.forEach(function (r, i) {
    if (String(r[15]) !== String(d.uid) || r[8]) return;               // P 회원ID · I 도착일
    if (d.store && String(r[4]) && String(r[4]) !== String(d.store)) return;   // E 매장(여러 매장 편지면 그 매장만)
    L.getRange(i + 2, 9).setValue(now);
    L.getRange(i + 2, TRACK_COL).setValue('안내지 QR로 도착 확인 · ' + Utilities.formatDate(now, 'Asia/Seoul', 'M/d HH:mm'));
  });
}

// 「편지」 탭 그 줄의 발송일(G)이 적혔는지 = 우체국에 실제로 부친 편지인지
function letterPosted(row) {
  var L = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지');
  return !!(L && row > 1 && L.getRange(row, 7).getValue() !== '');
}

// 이 손님(회원ID) · 매장 편지 중 발송일(G)이 적힌 게 있는지. 없으면 아직 안 보낸 편지라 「내 편지」 열람은 시험으로 봄
function letterSent(uid, store) {
  var L = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지');
  if (!L || L.getLastRow() < 2 || !uid) return false;
  return L.getRange(2, 1, L.getLastRow() - 1, 16).getValues().some(function (r) {
    return String(r[15]) === String(uid) && r[6] !== '' && (!store || !String(r[4]) || String(r[4]) === String(store));
  });
}

function addLetterView(d) {
  var sh = sheet('열람', VIEW_HEAD);
  sh.getRange(sh.getLastRow() + 1, 1, 1, VIEW_HEAD.length).setValues([[
    at(d.ts), txt(d.t), txt(d.uid), txt(d.sid), txt(d.store), txt(d.due),
    d.recorded ? 'Y' : 'N', txt(d.device), txt(d.app), txt(d.ref), msgOf(d.ref), txt(d.bid), txt(d.sig)
  ]]);
}

// 「내 편지」의 「편지 건넸어요」 기록. 14일 안 전달 판정은 기록시각 기준(건넨 날은 손님이 고른 참고값)
function addDelivered(d) {
  var sh = sheet('전달', DELIV_HEAD);
  var applyNo = '';
  // 열쇠(F)로 먼저, 없으면 회원ID(E)로 신청번호를 찾는다 (모집대상 밖 회원ID로 신청한 경우).
  // 같은 회원의 신청이 여러 건이면 매장ID(G) · 매장명(J)이 맞는 신청을 고르고, 없을 때만 마지막 신청(2026-10-27 · 시험에서 다른 매장 번호가 붙던 것)
  var ap = sheet('신청', APPLY_HEAD);
  [['F:F', d.t], ['E:E', d.uid]].forEach(function (k) {
    if (applyNo || !k[1]) return;
    var hits = ap.getRange(k[0]).createTextFinder(String(k[1])).matchEntireCell(true).findAll();
    if (!hits.length) return;
    var pick = hits[hits.length - 1].getRow();
    for (var i = hits.length - 1; i >= 0; i--) {
      var r = ap.getRange(hits[i].getRow(), 1, 1, 10).getValues()[0];
      if ((d.sid && String(r[6]) === String(d.sid)) || (d.store && String(r[9]) === String(d.store))) { pick = hits[i].getRow(); break; }
    }
    applyNo = ap.getRange(pick, 1).getValue();
  });
  sh.getRange(sh.getLastRow() + 1, 1, 1, DELIV_HEAD.length).setValues([[
    at(d.ts), txt(d.t), txt(d.uid), txt(d.sid), txt(d.store), txt(d.nick), txt(d.when), txt(d.whom),
    txt(applyNo), txt(d.device), txt(d.app), txt(d.ref), '', '', d.confirm ? 'Y' : ''
  ]]);
}

// 「편지」 탭에서 편지코드(= 신청번호)로 한 통을 찾는다
function letter(c) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지');
  if (!sh || !c) return null;
  var found = sh.getRange('A:A').createTextFinder(String(c)).matchEntireCell(true).matchCase(true).findNext();
  if (!found || found.getRow() === 1) return null;
  var r = sh.getRange(found.getRow(), 1, 1, 16).getValues()[0];
  var due = r[10] instanceof Date ? Utilities.formatDate(r[10], 'Asia/Seoul', 'yyyy-MM-dd') : '';
  return { row: found.getRow(), t: String(r[2]), sid: String(r[3]), store: String(r[4]), nick: String(r[5]), due: due, uid: String(r[15]) };
}

// 신청 한 건 = 편지 한 통. 전달 기한 · 문의 기한은 신청일로 바로 정해지고(마감 관리 B21 · B22), 도착일(I)을 적으면 알림 대상이 된다
function addLetter(d) {
  var sh = sheet('편지', LETTER_HEAD);
  var r = sh.getLastRow() + 1, J = 'J' + r;
  sh.getRange(r, 1, 1, LETTER_HEAD.length).setValues([[
    txt(d.vid), at(d.ts), txt(d.t), txt(d.sid), txt(d.store), txt(d.nick), '', '', '',
    '=IF(B' + r + '="","",INT(B' + r + ')+N(\'마감 관리\'!$B$21))',   // 손님 전달 기한: 신청일 + 마감 관리 B21일(2026-10-26 21일 → 2026-11-11 3회차부터 14일 = 인쇄 · 발송 2일 + 도착 5일 + 매장 전달 7일. 1 · 2회차 458통은 =INT(B)+21로 고정)
    '=IF(' + J + '="","",' + J + '+N(\'마감 관리\'!$B$22))',        // 사장님 문의 기한: 전달 기한 + 7일(마감 관리 B22)
    '',
    '=IF(P' + r + '="","","' + MYLETTER_URL + '?uid="&ENCODEURL(P' + r + ')&"&store="&ENCODEURL(E' + r + ')&"&nick="&ENCODEURL(F' + r + ')&IF(' + J + '="","","&due="&TEXT(' + J + ',"yyyy-mm-dd"))&IF(G' + r + '="","","&sent="&TEXT(G' + r + ',"yyyy-mm-dd")))',
    '=IF(OR(A' + r + '="",S' + r + '="QR 없음"),"","' + OWNER_URL + '?c="&A' + r + ')',   // QR 없음 가게는 링크 없음
    '', txt(d.uid), txt(d.grp), armLetter(d), armQr(d), '', '',
    myLetterLink(r, 'arr'), myLetterLink(r, 'rmd'), ''
  ]]);
}

// 점주 페이지를 열 때마다 한 줄. 손님이 건넨 날을 알려주기 전에 열린 건지도 같이 남긴다
function addScan(d) {
  var sh = sheet('QR 접속', SCAN_HEAD);
  var dsh = sheet('전달', DELIV_HEAD);
  var hit = function (col, v) { return v && dsh.getRange(col).createTextFinder(String(v)).matchEntireCell(true).findNext(); };
  var delivered = hit('B:B', d.t) || hit('C:C', d.uid) ? 'Y' : 'N'; // 열쇠 또는 회원ID로 찾음
  sh.getRange(sh.getLastRow() + 1, 1, 1, SCAN_HEAD.length).setValues([[
    at(d.ts), txt(d.c), txt(d.t), txt(d.sid), txt(d.store), delivered, txt(d.device), txt(d.app), txt(d.ref), txt(d.bid), txt(d.sig), applicantJudge(d)
  ]]);
}

// 사장님 QR 접속 · 문의가 편지 신청 손님 본인인지(2026-11-10): 「열람」 탭에서 같은 회원ID가 남긴 브라우저 번호 · 기기 특징과 비교
// 브라우저 번호가 같으면 확정. 앱이 달라 번호가 다르면 기기 특징(OS · 화면 · 배율 · 언어 · 시간대 · 코어 수)으로 가능성만 표시
function applicantJudge(d) {
  var uid = String(d.uid || ''), bid = String(d.bid || ''), sig = String(d.sig || '');
  if (!bid && !sig) return '구분 안 됨 (예전 페이지 접속)';
  if (!uid) return '구분 안 됨 (신청 손님 모름)';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('열람');
  if (!sh || sh.getLastRow() < 2) return '구분 안 됨 (신청 손님 「내 편지」 열람 기록 없음)';
  var now = d.ts ? new Date(d.ts) : new Date(), same = false, near = null, cmp = 0;
  sh.getRange('C:C').createTextFinder(uid).matchEntireCell(true).findAll().forEach(function (h) {
    if (h.getRow() === 1) return;
    var v = sh.getRange(h.getRow(), 1, 1, VIEW_HEAD.length).getValues()[0], vb = String(v[11] || ''), vs = String(v[12] || '');
    if (!vb && !vs) return;   // 예전 열람(번호 없음)은 비교 못 함
    cmp++;
    if (bid && vb === bid) same = true;
    else if (sig && vs === sig && v[0] instanceof Date) { var m = Math.abs(now - v[0]) / 60000; if (near === null || m < near) near = m; }
  });
  if (same) return '신청 손님 본인 확정 (같은 브라우저)';
  if (near !== null) return (near <= 30 ? '신청 손님 본인 가능성 높음' : '신청 손님 본인 가능성 있음') + ' (같은 기기 · 「내 편지」 열람과 ' + Math.round(near) + '분 차이)';
  return cmp ? '다른 기기로 보임 (신청 손님이 아닐 가능성 높음)' : '구분 안 됨 (신청 손님 「내 편지」 열람 기록 없음)';
}

// 전화 안내 신청. 같은 매장의 첫 문의면 「매장 첫 문의」 Y (10,000원 쿠폰 귀속 후보)
function addInquiry(d) {
  var sh = sheet('문의', INQ_HEAD);
  var first = d.sid && sh.getRange('D:D').createTextFinder(String(d.sid)).matchEntireCell(true).findNext() ? 'N' : 'Y';
  var who = d.type === 'inquiry' ? whoCalls(d) : '';
  d.judge = applicantJudge(d);
  // 손님 번호(신청 손님 본인 · 다른 신청 손님)로 확인된 문의는 슬랙에 올리지 않고 시트에만 남김(2026-11-12 사용자 결정 · 영업팀 혼선 방지)
  var custOnly = /^(편지 신청 손님 본인|다른 편지 신청 손님)/.test(who);
  var slack = d.type !== 'inquiry' ? '' : custOnly ? '안 보냄(손님 번호)' : notifySlack(d, first, who);
  sh.getRange(sh.getLastRow() + 1, 1, 1, INQ_HEAD.length).setValues([[
    at(d.ts), txt(d.c), txt(d.t), txt(d.sid), txt(d.store), txt(d.nick), txt(d.tel), txt(d.time), first,
    txt(d.device), txt(d.ref), d.type === 'contact_click' ? 'biz 이동' : custOnly ? '손님 문의(제외)' : '접수', '', '', '', who ? '번호 확인: ' + who : '', d.edit ? 'Y' : '', slack, txt(d.bid), txt(d.sig), d.judge
  ]]);
}

// ── 문의 번호 확인(2026-11-10 · 영업팀이 손님 본인 문의를 사장님 문의로 헷갈림) ──────────────
// 숨김 탭 「번호 대조」: 종류(cust = 편지 신청 손님 회원ID · owner = 매장ID의 점주 · 대표 · 매니저 · 직원 번호) · ID · 번호 키(SHA-256 앞 12자, phoneHash와 같음)
// 키는 print_letters 쪽 스크립트가 Snowflake로 만들어 phone_keys_put으로 넣음. 번호 원본은 이 탭에 없음
var KEY_HEAD = ['종류', 'ID', '번호 키'];
// 숨김 탭 「편지 문구」: 인쇄한 편지 본문(인쇄 도구 letter_texts.py가 build.py와 같은 규칙으로 만들어 넣음 · 이름 · 주소 · 전화 없음)
var TEXT_HEAD = ['편지코드', '작업 번호', '편지', 'QR 안내', '본문'];
var QR_CH = 'C0CBDHT27BM';   // #편지_qr_문의 (봇이 글을 올려 스레드 답글을 달 수 있게 · 2026-11-10)
function putLetterTexts(rows) {
  var sh = sheet('편지 문구', TEXT_HEAD);
  if (!sh.isSheetHidden()) sh.hideSheet();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, TEXT_HEAD.length).clearContent();
  var v = (rows || []).filter(function (r) { return r && r.length === 5 && r[0]; }).map(function (r) { return r.map(String); });
  if (v.length) sh.getRange(2, 1, v.length, TEXT_HEAD.length).setNumberFormat('@').setValues(v);
  return v.length;
}
function letterText(code) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지 문구');
  if (!sh || !code) return null;
  var hit = sh.getRange('A:A').createTextFinder(String(code)).matchEntireCell(true).findNext();
  return hit && hit.getRow() > 1 ? sh.getRange(hit.getRow(), 1, 1, TEXT_HEAD.length).getValues()[0] : null;
}
// 스레드 답글: 이 매장에 간 편지(종류 · 발송 · 기한 · 본문 · QR 안내)
function letterThread(d, i) {
  var t = letterText(d.c), L = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지'), sent = '', due = '';
  var hit = L && d.c ? L.getRange('A:A').createTextFinder(String(d.c)).matchEntireCell(true).findNext() : null;
  if (hit && hit.getRow() > 1) { var r = L.getRange(hit.getRow(), 1, 1, 10).getValues()[0]; sent = md(r[6]); due = md(r[9]); }
  if (!t) return '*이 매장에 간 편지*\n편지 문구를 찾지 못함(편지코드 ' + (d.c || '-') + ')';
  return ['*이 매장에 간 편지*',
    '편지: ' + t[2] + ' · ' + (t[3] === 'QR 없음' ? 'QR 없음' : 'QR 있음') + ' · 작업 번호 ' + (t[1] || '-'),
    '우편 발송: ' + (sent || '-') + ' / 손님 전달 기한: ' + (due || '-'),
    '',
    '_편지 본문(손글씨)_',
    String(t[4]).split('\n').map(function (x) { return '> ' + x; }).join('\n'),
    t[3] === 'QR 없음' ? '' : '\n_편지 아래 안내(일반 글씨)_\n> ' + t[3]
  ].join('\n');
}
function putPhoneKeys(rows) {
  var sh = sheet('번호 대조', KEY_HEAD);
  if (!sh.isSheetHidden()) sh.hideSheet();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, KEY_HEAD.length).clearContent();
  var v = (rows || []).filter(function (r) { return r && r.length === 3 && /^[0-9a-f]{12}$/.test(String(r[2])); }).map(function (r) { return [String(r[0]), String(r[1]), String(r[2])]; });
  if (v.length) sh.getRange(2, 1, v.length, KEY_HEAD.length).setNumberFormat('@').setValues(v);
  return v.length;
}
// ── 매장 이력(2026-11-16 · 매머드커피 말바우시장점: 11/2 계약 완료 매장에 11/6 편지가 가서, 사장님 QR 문의에 영업팀이 다시 연락하려 함) ──
// 숨김 탭 「매장 이력」: 매장ID · 이력(선정 뒤 계약 · 거절 · 해지 · 정식 매장 연결, 날짜 포함). 인쇄 도구 phone_keys.py(store_history.py)가 Snowflake로 만들어 store_hist_put으로 넣음
// 랜딩 문의는 여기서 바로 봄: 「랜딩 문의 기록」의 매장 이름이 같거나(기호 빼고 · 짧은 쪽이 6자 이상 「…점」이면 포함도) 연락처 키가 이 매장 점주 쪽 번호 키와 같음
var HIST_HEAD = ['매장ID', '이력'];
function putStoreHist(rows) {
  var sh = sheet('매장 이력', HIST_HEAD);
  if (!sh.isSheetHidden()) sh.hideSheet();
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, HIST_HEAD.length).clearContent();
  var v = (rows || []).filter(function (r) { return r && r.length === 2 && r[0] && r[1]; }).map(function (r) { return [String(r[0]), String(r[1])]; });
  if (v.length) sh.getRange(2, 1, v.length, HIST_HEAD.length).setNumberFormat('@').setValues(v);
  return v.length;
}
function storeHist(sid, store) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), out = [];
  var H = ss.getSheetByName('매장 이력');
  if (H && sid && H.getLastRow() > 1) {
    var hit = H.getRange('A:A').createTextFinder(String(sid)).matchEntireCell(true).findNext();
    if (hit && hit.getRow() > 1) out.push(String(H.getRange(hit.getRow(), 2).getValue()));
  }
  var LL = ss.getSheetByName('랜딩 문의 기록');
  if (LL && LL.getLastRow() > 1 && !/랜딩/.test(out.join(''))) {   // 「매장 이력」에 이미 랜딩 문의가 있으면 다시 안 붙임
    var keys = {}, K = ss.getSheetByName('번호 대조'), n = normName(store), days = [];
    if (K && sid && K.getLastRow() > 1) K.getRange(2, 1, K.getLastRow() - 1, 3).getValues().forEach(function (r) { if (r[0] === 'owner' && String(r[1]) === String(sid)) keys[String(r[2])] = true; });
    LL.getRange(2, 1, LL.getLastRow() - 1, 3).getValues().forEach(function (r) {
      var m = normName(r[1]), s = m.length < n.length ? m : n, l = m.length < n.length ? n : m;
      var byName = !!n && !!m && (m === n || (s.length >= 6 && /점$/.test(s) && l.indexOf(s) >= 0));
      var day = r[0] instanceof Date ? md(r[0]) : String(r[0]).slice(5, 10);
      if ((byName || keys[String(r[2])]) && days.indexOf(day) < 0) days.push(day);
    });
    if (days.length) out.push(days.join(' · ') + ' 랜딩 입점 문의');
  }
  return out.filter(String).join(' / ');
}

function whoCalls(d) {
  var k = phoneHash(d.tel), sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('번호 대조');
  if (!k || !sh || sh.getLastRow() < 2) return '';
  var i = letterInfo(d.c, d.uid), uid = String(i.uid || d.uid || ''), sid = String(i.sid || d.sid || '');
  var hit = { self: false, cust: false, owner: false, otherOwner: false };
  sh.getRange(2, 1, sh.getLastRow() - 1, 3).getValues().forEach(function (r) {
    if (String(r[2]) !== k) return;
    if (r[0] === 'cust') { if (String(r[1]) === uid) hit.self = true; else hit.cust = true; }
    if (r[0] === 'owner') { if (String(r[1]) === sid) hit.owner = true; else hit.otherOwner = true; }
  });
  if (hit.owner) return '이 매장 사장님 · 직원 번호와 같음';
  if (hit.self) return '편지 신청 손님 본인 번호 (사장님 아님)';
  if (hit.cust) return '다른 편지 신청 손님 번호 (사장님 아님)';
  if (hit.otherOwner) return '다른 매장 사장님 · 직원 번호 (이 매장 아님)';
  return '사장님일 가능성 높음 (등록된 번호 없음)';   // 2026-11-10 사용자 결정: 손님 · 다른 매장 번호가 아니면 사장님 쪽으로 봄
}

// 도착 · 리마인드 알림톡 버튼에 넣을 내 편지 링크(M열 + 메시지별 UTM). 어느 알림톡으로 열었는지 「열람」 탭에서 갈림
function myLetterLink(r, kind) {
  return '=IF(M' + r + '="","",M' + r + '&"&utm_source=kakao&utm_medium=alimtalk&utm_campaign=ltr_' + kind +
    '&utm_content=ltr_' + kind + '_myletter&utm_term="&IF(Q' + r + '="q","ltr_qrtest","ltr_appeal"))';
}

// 유입 URL의 utm_content → 들어온 메시지 이름
var MSG_LABEL = { ltr_arr_myletter: '도착 알림톡', ltr_rmd_myletter: '리마인드 알림톡', ltr_rcr_benefit: '모집 · 내 혜택',
  ltr_rcr_invite: '모집 · 특별 대우', ltr_rcr_role: '모집 · 역할의 재미', ltr_rcr_help: '모집 · 사장님 도움' };
function msgOf(ref) {
  var m = String(ref || '').match(/utm_content=([a-z0-9_]+)/);
  return m ? (MSG_LABEL[m[1]] || m[1]) : '직접 · 기타';
}

// 링크 값 → 시트에 적을 글자 (편지 종류 · QR 여부)
function armLetter(d) { return d.la ? '편지 ' + d.la : ''; }
function armQr(d) { return d.qr === '1' ? 'QR 있음' : d.qr === '0' ? 'QR 없음' : ''; }

// 점주 전화 안내 신청 → 슬랙 #편지_qr_문의 알림 (수신 웹후크). 주소는 공개 저장소에 올리지 않도록 코드에 넣지 않고
// 스크립트 속성 「SLACK_WEBHOOK」, 없으면 시트의 숨김 탭 「설정」 B1에서 읽는다. 둘 다 비어 있으면 보내지 않음
// 손님 신청 알림(#편지-신청자-알림)은 속성 「SLACK_WEBHOOK_APPLY」, 없으면 「설정」 B3 (B2는 인쇄 도구 비밀번호 · 2026-10-28)
function slackUrl(prop, cell) {
  var url = PropertiesService.getScriptProperties().getProperty(prop || 'SLACK_WEBHOOK');
  if (url) return url;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정');
  return sh ? String(sh.getRange(cell || 'B1').getValue()).trim() : '';
}
// 담는 정보: 매장 · 연락처 · 통화 희망 · 편지(시험 · 편지 종류/QR) · 모집 소구 · 경로 · 차수 · 편지를 전한 손님과 전달 기록
var G_LABEL = { '1': '내 혜택', '2': '특별 대우', '3': '역할의 재미', '4': '사장님 도움' };
var GRP_LABEL = { s: '소구 실험', q: 'QR 비교' };
var SRC_LABEL = { call: '전화 주문 손님', intro: '앱 주문 요청 손님' };

function ymd(v, withTime) {
  if (v instanceof Date) return Utilities.formatDate(v, 'Asia/Seoul', withTime ? 'M월 d일 HH:mm' : 'M월 d일');
  var m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);   // 「2026-10-26」 꼴 글자도 같은 표기로
  return m ? (+m[2]) + '월 ' + (+m[3]) + '일' : String(v || '');
}

// 편지코드로 편지 · 신청 · 전달 탭에서 알림에 쓸 값을 모은다
function letterInfo(code, uid) {
  var o = {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var find = function (name, col, v, width) {
    var sh = ss.getSheetByName(name);
    if (!sh || !v) return null;
    var hits = sh.getRange(col + ':' + col).createTextFinder(String(v)).matchEntireCell(true).findAll();
    if (!hits.length || hits[hits.length - 1].getRow() === 1) return null;
    return sh.getRange(hits[hits.length - 1].getRow(), 1, 1, width).getValues()[0];
  };
  var L = find('편지', 'A', code, LETTER_HEAD.length);
  if (L) { o.sid = L[3]; o.nick = L[5]; o.arrive = ymd(L[8]); o.uid = uid || L[15]; o.grp = L[16]; o.letter = L[17]; o.qr = L[18]; }
  var A = find('신청', 'A', code, APPLY_HEAD.length);
  if (A) { o.g = String(A[7]); o.src = String(A[8]); o.wave = String(A[34]); }
  // 「건넸어요」 기록: 이 편지코드(전달 I열 신청번호)로 먼저 찾고, 없으면 같은 손님 · 같은 매장 기록만(다른 매장 기록이 붙지 않게 · 2026-10-27)
  var D = find('전달', 'I', code, DELIV_HEAD.length);
  if (!D && (o.uid || uid)) {
    var dsh = ss.getSheetByName('전달'), hits = dsh ? dsh.getRange('C:C').createTextFinder(String(o.uid || uid)).matchEntireCell(true).findAll() : [];
    for (var i = hits.length - 1; i >= 0 && !D; i--) {
      var r = dsh.getRange(hits[i].getRow(), 1, 1, DELIV_HEAD.length).getValues()[0];
      if (hits[i].getRow() > 1 && ((o.sid && String(r[3]) === String(o.sid)) || (L && String(r[4]) === String(L[4])))) D = r;
    }
  }
  if (D) { o.delivAt = ymd(D[0], true); o.when = D[6]; o.whom = D[7]; }
  return o;
}

function notifySlack(d, first, who) {
  var url = slackUrl();
  var i = letterInfo(d.c, d.uid);
  var tel = String(d.tel || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  var exp = [GRP_LABEL[i.grp] || i.grp, i.letter, i.qr].filter(String).join(', ') || '-';
  var store = d.store || '-';
  var hist = '';
  try { hist = storeHist(i.sid || d.sid, d.store); } catch (e) {}
  // 슬랙 알림: 전화하는 사람이 볼 순서(누구에게 · 언제 → 통화 때 말할 내용 → 분석용 참고). 이모지 없이 「항목: 값」 한 줄에 하나,
  // 묶음 사이는 빈 줄, 연락처 · 통화 희망만 굵게. 날짜는 「10월 23일」로 통일
  var lines = [
    '*' + (d.test ? '[시험] ' : '') + '편지 QR 문의 · ' + store + (d.edit ? ' (연락처 수정)' : '') + '*',
    '',
    '*연락처: ' + (tel || '-') + '*',
    '*통화 희망: ' + (d.time || '-') + '*',
    hist ? '*매장 이력: ' + hist + ' → 이미 영업 진행 중일 수 있음. 담당 영업 확인 뒤 연락*' : null,
    who ? '*번호 확인: ' + who + '*' : null,
    d.judge ? '브라우저 확인: ' + d.judge : null,
    '매장: ' + store + ' (' + (i.sid || d.sid || '-') + ')',
    '',
    '편지 전한 손님: ' + (i.nick || d.nick || '-'),
    '전달 기록: ' + (i.delivAt ? i.delivAt + ' 남김' : '아직 없음'),
    i.delivAt ? '건넨 날: ' + (ymd(i.when) || '-') + ' / 받은 분: ' + (i.whom || '-') : null,
    '받은 편지: ' + exp,
    '',
    '_참고_',
    '모집 소구: ' + (i.g ? (G_LABEL[i.g] || i.g) : '-') + ' / 손님 경로: ' + (SRC_LABEL[i.src] || i.src || '-') + ' / 차수: ' + (i.wave ? i.wave + '차' : '-'),
    '편지 도착: ' + (i.arrive || '-') + ' / 편지코드: ' + (d.c || '-') + ' / 회원ID: ' + (i.uid || '-')
  ].filter(function (x) { return x !== null; });
  var text = lines.join('\n'), why = '';
  try {   // 봇으로 올려야 ts가 생겨 스레드 답글(이 매장에 간 편지)을 달 수 있음(2026-11-10). 안 되면 예전처럼 웹후크
    if (setting('B7')) {
      var m = slackApi('chat.postMessage', { channel: QR_CH, text: text, unfurl_links: false });
      if (m.ok) {
        var th = slackApi('chat.postMessage', { channel: QR_CH, thread_ts: m.ts, text: letterThread(d, i), unfurl_links: false });
        return th.ok ? 'Y · 스레드 Y' : 'Y · 스레드 실패 ' + th.error;
      }
      why = ' (봇 ' + m.error + ' → 웹후크)';
    }
  } catch (e) { why = ' (봇 오류 → 웹후크)'; }
  if (!url) return '실패' + why;
  try {
    var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: text }), muteHttpExceptions: true });
    return (r.getResponseCode() === 200 ? 'Y' : '실패 ' + r.getResponseCode()) + why;
  } catch (err) { return '실패' + why; }
}

// 손님 신청 → 슬랙 #편지-신청자-알림. 받는 분 · 주소 · 우편번호는 넣지 않음. 담당자 확인 링크(utm_term ltr_selftest)로 온 신청은 제목에 표시
function notifyApply(d) {
  var url = slackUrl('SLACK_WEBHOOK_APPLY', 'B3');
  if (!url) return '';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('신청');
  var total = sh ? sh.getLastRow() - 1 : 0;
  var storeN = sh && d.sid ? sh.getRange('G:G').createTextFinder(String(d.sid)).matchEntireCell(true).findAll().length : 0;
  var self = /utm_term=ltr_selftest/.test(String(d.ref || ''));
  var store = d.store || '-';
  var lines = [
    '*편지 신청 · ' + store + (self ? ' (담당자 확인용)' : '') + '*',
    '',
    '손님: ' + (d.nick || '-') + ' / 들어온 메시지: ' + msgOf(d.ref),
    '받을 편지: ' + ([GRP_LABEL[d.grp] || d.grp, armLetter(d), armQr(d)].filter(String).join(', ') || '-'),
    '모집 소구: ' + (G_LABEL[d.g] || d.g || '-') + ' / 손님 경로: ' + (SRC_LABEL[d.src] || d.src || '-') + ' / 차수: ' + (d.w ? d.w + '차' : '-'),
    '',
    '이 매장 신청: ' + (storeN || 1) + '건째 / 전체 신청: ' + total + '건',
    '신청번호: ' + (d.vid || '-') + ' / 매장: ' + store
  ];
  var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: lines.join('\n') }), muteHttpExceptions: true });
  return r.getResponseCode() === 200 ? 'Y' : '실패 ' + r.getResponseCode();
}

// 편집기에서 한 번 실행: 신청 알림 웹후크 시험 메시지(시트에는 아무것도 적지 않음)
function testApplySlack() {
  Logger.log(notifyApply({ store: '테스트매장', nick: '테스트', grp: 's', la: '1', g: '1', src: 'call', w: '1', vid: 'TEST-0001', sid: '', ref: 'utm_content=ltr_rcr_benefit&utm_term=ltr_selftest_b1' }));
}

// 편집기에서 한 번 실행: 외부 요청 권한 승인 + 웹후크 시험 메시지
function testSlack() {
  Logger.log(notifySlack({ store: '테스트매장', tel: '01000000000', time: '오전', c: 'TEST-0001', nick: '테스트', uid: 'TEST' }, 'Y'));
}

// 짧은 주소 「링크」 탭: A 코드 · B 원래 주소 · C 무엇(모집 1일차 · 도착 알림 등) · D 만든 시각. 수식 없이 값만 씀
var LINK_HEAD = ['코드', '원래 주소', '무엇', '만든 시각'];
function linkOf(k) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('링크');
  if (!sh || !/^[A-Za-z0-9]{6,16}$/.test(String(k))) return '';
  var f = sh.getRange('A:A').createTextFinder(String(k)).matchCase(true).matchEntireCell(true).findNext();
  return f ? String(sh.getRange(f.getRow(), 2).getValue()) : '';
}
// 발송 도구(fill_list.py · make_send_files.py)가 코드 · 원래 주소를 올림. 비밀번호는 인쇄 도구와 같은 「설정」 B2
function linkPut(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var token = String(ss.getSheetByName('설정').getRange('B2').getValue());
  if (!token || d.token !== token) return { ok: false, reason: 'token' };
  var rows = (d.rows || []).filter(function (r) { return r && /^[A-Za-z0-9]{6,16}$/.test(String(r[0])) && /^https:\/\/paytalab-m\.github\.io\//.test(String(r[1])); });
  if (!rows.length) return { ok: true, added: 0 };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = sheet('링크', LINK_HEAD);
    var now = new Date();
    sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows.map(function (r) { return [String(r[0]), String(r[1]), String(r[2] || ''), now]; }));
  } finally { lock.releaseLock(); }
  return { ok: true, added: rows.length };
}

// 메시지 일괄 발송 파일 도구(make_send_files.py) 전용. 「도착 알림 대상」 · 「리마인드 대상」 탭을 보이는 그대로(날짜는 「11월 6일」 꼴) 돌려줌
//   send_list : kind = 'arrive' | 'remind'. 비밀번호는 인쇄 도구와 같은 「설정」 B2
function sendList(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var token = String(ss.getSheetByName('설정').getRange('B2').getValue());
  if (!token || d.token !== token) return { ok: false, reason: 'token' };
  var name = { arrive: '도착 알림 대상', remind: '리마인드 대상' }[d.kind];
  var sh = name && ss.getSheetByName(name);
  if (!sh) return { ok: false, reason: 'kind' };
  // 자동 발송(B6=Y)이 켜져 있으면 손 발송 파일은 안 줌 — 두 길로 같은 사람에게 두 번 가지 않게(2026-10-30)
  if (setting('B6').toUpperCase() === 'Y') return { ok: false, reason: '자동 발송이 켜져 있어(설정 B6=Y) 손 발송 명단은 안 줌' };
  var v = sh.getDataRange().getDisplayValues();
  var head = v.shift();
  return { ok: true, head: head, rows: eligible(d.kind, v.filter(function (r) { return r[0] && r[1]; })) };   // 「지금은 대상 없음」 줄은 뺌 · 1인 1회 거름
}

// 편지 인쇄 도구(print_letters.py) 전용. 주소가 오가므로 시트 숨김 탭 「설정」 B2 비밀번호가 맞을 때만 응답
//   print_list : 아직 인쇄하지 않은(인쇄일 빈칸) 편지 + 신청 탭의 받는 분 · 주소
//   print_mark : 편지코드 목록에 인쇄 회차 · 인쇄일을 적음
// ── 받는 주소 = 매장 주소인 신청 분리(2026-10-29) ───────────────────────────
// 손님이 받는 주소에 편지를 보낼 그 매장 주소를 적으면 편지가 사장님께 바로 가서 실험이 깨짐 → 「신청」 · 「편지」에서 빼서 「주소 오류」 탭으로 옮긴다.
// 판정: 신청 주소의 도로명 + 건물번호 키(addrKey) = 숨김 탭 「편지 매장 주소」의 그 매장 키. 매장 키는 인쇄 묶음 만들 때 Snowflake(sql/05)로 채운다.
var WRONG_HEAD = ['옮긴 시각', '사유'].concat(APPLY_HEAD);

function moveWrongAddr(codes, reason) {
  var want = {}; (codes || []).forEach(function (c) { if (c) want[String(c)] = true; });
  if (!Object.keys(want).length) return 0;
  var ss = SpreadsheetApp.getActiveSpreadsheet(), A = ss.getSheetByName('신청'), L = ss.getSheetByName('편지'), W = sheet('주소 오류', WRONG_HEAD), moved = 0;
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var av = A.getRange(2, 1, A.getLastRow() - 1, APPLY_HEAD.length).getValues(), now = new Date();
    for (var i = av.length - 1; i >= 0; i--) {   // 아래에서부터 지워야 줄 번호가 안 밀림
      if (!want[String(av[i][0])]) continue;
      W.appendRow([now, reason].concat(av[i]));
      A.deleteRow(i + 2); moved++;
    }
    if (L && L.getLastRow() > 1) {
      var lc = L.getRange(2, 1, L.getLastRow() - 1, 1).getValues();
      for (var j = lc.length - 1; j >= 0; j--) if (want[String(lc[j][0])]) L.deleteRow(j + 2);
    }
  } finally { lock.releaseLock(); }
  return moved;
}

// 아직 인쇄하지 않은 신청 중 받는 주소 = 매장 주소인 것을 찾아 옮김. 옮긴 수를 돌려줌
// ── 주소 다시 적기(2026-11-02) ──────────────────────────────────────────
// 「주소 오류」 탭 손님(받는 주소가 매장 주소이거나 그렇게 보임)에게 알림 메시지 → letter/fix/?code=신청번호 화면.
//   new  : 집 주소를 새로 적음 → 그 줄을 「신청」 · 「편지」로 되돌림(다음 회차 인쇄 대상)
//   keep : 「이 주소가 맞아요」 → 주소 그대로 되돌리고, 다음 인쇄 때 주소 오류로 다시 빼지 않음
// 기록은 「주소 다시 적기」 탭. 이미 되돌린 뒤 다시 고치면(인쇄 전에만) 「신청」 줄의 주소를 바꿈
var FIX_HEAD = ['시각', '신청번호', '선택', '매장', '받는 주소가 매장 주소와 같음'];
var FIX_DUE_CELL = 'B27';   // 「마감 관리」 B27 = 주소 다시 적기 마감일(비면 안내에 날짜를 안 씀)
var A_OFF = 2;              // 「주소 오류」 탭은 앞에 「옮긴 시각 · 사유」 두 칸이 더 있음

function maskName(s) { s = String(s || ''); return s.length <= 1 ? s : s.charAt(0) + '○'.repeat(Math.min(3, s.length - 1)); }
function maskAddr(s) { var p = String(s || '').trim().split(/\s+/); return p.length <= 2 ? p.join(' ') : p.slice(0, p.length - 1).join(' ') + ' ○○'; }

function findFix(code) {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), W = ss.getSheetByName('주소 오류'), A = ss.getSheetByName('신청');
  if (W && W.getLastRow() > 1) {
    var f = W.getRange('C:C').createTextFinder(code).matchEntireCell(true).matchCase(true).findNext();
    if (f && f.getRow() > 1) return { where: 'wrong', sh: W, row: f.getRow(), v: W.getRange(f.getRow(), A_OFF + 1, 1, APPLY_HEAD.length).getValues()[0] };
  }
  if (A && A.getLastRow() > 1) {
    var g = A.getRange('A:A').createTextFinder(code).matchEntireCell(true).matchCase(true).findNext();
    if (g && g.getRow() > 1) return { where: 'apply', sh: A, row: g.getRow(), v: A.getRange(g.getRow(), 1, 1, APPLY_HEAD.length).getValues()[0] };
  }
  return null;
}

function fixDue() {
  var MG = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('마감 관리'), v = MG ? MG.getRange(FIX_DUE_CELL).getValue() : '';
  return v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', 'yyyy-MM-dd') : (/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim()) ? String(v).trim() : '');
}

function fixInfo(code) {
  var f = code && findFix(code);
  if (!f) return { ok: false, reason: 'none' };
  var L = letter(code), printed = L && L.row && SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지').getRange(L.row, PRINT_DATE_COL).getValue();
  return { ok: true, state: f.where === 'wrong' ? 'pending' : (printed ? 'printed' : 'fixed'), nick: String(f.v[12] || ''), store: String(f.v[9] || ''),
           name: maskName(f.v[14]), addr: maskAddr(f.v[16]), due: fixDue() };
}

// 「편지 매장 주소」 키와 같은지(받는 주소 = 그 매장 주소)
function sameAsStore(sid, addr) {
  var K = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지 매장 주소'), k = addrKey(addr);
  if (!K || K.getLastRow() < 2 || !k) return false;
  return K.getRange(2, 1, K.getLastRow() - 1, 2).getValues().some(function (r) { return String(r[0]) === String(sid) && String(r[1]) === k; });
}

function addrFix(d) {
  var code = String(d.c || ''), kind = d.kind === 'keep' ? 'keep' : 'new';
  var lock = LockService.getScriptLock(); lock.waitLock(20000);
  try {
    var f = code && findFix(code);
    if (!f) return { ok: false, reason: 'none' };
    var ss = SpreadsheetApp.getActiveSpreadsheet(), v = f.v.slice(), sid = String(v[6]);
    if (kind === 'new') {
      if (!String(d.name || '').trim() || !String(d.addr || '').trim()) return { ok: false, reason: 'empty' };
      if (!d.force && sameAsStore(sid, d.addr)) return { ok: false, reason: 'store_addr', store: String(v[9]) };
      v[14] = "'" + String(d.name).trim(); v[15] = "'" + String(d.zip || '').trim(); v[16] = "'" + String(d.addr).trim(); v[17] = "'" + String(d.addr2 || '').trim();
    }
    var same = sameAsStore(sid, kind === 'new' ? d.addr : v[16]) ? 'Y' : 'N';
    if (f.where === 'wrong') {
      v[30] = (v[30] ? v[30] + ' · ' : '') + (kind === 'keep' ? '주소 확인함(이 주소가 맞아요) ' : '주소 다시 적음 ') + Utilities.formatDate(new Date(), 'Asia/Seoul', 'M/d');
      sheet('신청', APPLY_HEAD).appendRow(v);
      addLetterFromApply(v);
      f.sh.deleteRow(f.row);
    } else {
      var L = letter(code);
      if (L && ss.getSheetByName('편지').getRange(L.row, PRINT_DATE_COL).getValue()) return { ok: false, reason: 'printed' };
      if (kind === 'new') f.sh.getRange(f.row, 15, 1, 4).setValues([[v[14], v[15], v[16], v[17]]]);
    }
    sheet('주소 다시 적기', FIX_HEAD).appendRow([new Date(), code, kind === 'keep' ? '이 주소가 맞아요' : '새 주소', String(v[9]), same]);
    return { ok: true, kind: kind };
  } finally { lock.releaseLock(); }
}

// 「주소 오류」에서 되돌린 신청 한 줄로 「편지」 줄을 다시 만듦(addLetter와 같은 꼴 · 편지 종류 · QR 여부는 신청 줄 값 그대로)
function addLetterFromApply(v) {
  addLetter({ vid: String(v[0]).replace(/^'/, ''), ts: v[1] instanceof Date ? v[1].toISOString() : '', t: String(v[5]).replace(/^'/, ''), sid: String(v[6]).replace(/^'/, ''),
              store: String(v[9]).replace(/^'/, ''), nick: String(v[12]).replace(/^'/, ''), uid: String(v[4]).replace(/^'/, ''), grp: String(v[31]),
              la: String(v[32]).replace('편지 ', ''), qr: v[33] === 'QR 있음' ? '1' : v[33] === 'QR 없음' ? '0' : '' });
}

// 「이 주소가 맞아요」로 확인한 신청번호 → 다음 인쇄 때 주소 오류로 다시 빼지 않음
function addrConfirmed() {
  var F = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('주소 다시 적기'), ok = {};
  if (F && F.getLastRow() > 1) F.getRange(2, 2, F.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[1] === '이 주소가 맞아요') ok[String(r[0])] = true; });
  return ok;
}

function screenWrongAddr() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), K = ss.getSheetByName('편지 매장 주소'), A = ss.getSheetByName('신청'), L = ss.getSheetByName('편지');
  if (!K || K.getLastRow() < 2 || !A || A.getLastRow() < 2) return 0;
  var key = {}, printed = addrConfirmed(), codes = [];   // 「이 주소가 맞아요」 확인한 신청도 건너뜀(2026-11-02)
  K.getRange(2, 1, K.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[0] && r[1]) key[String(r[0])] = String(r[1]); });
  if (L && L.getLastRow() > 1) L.getRange(2, 1, L.getLastRow() - 1, PRINT_DATE_COL).getValues().forEach(function (r) { if (r[PRINT_DATE_COL - 1]) printed[String(r[0])] = true; });
  A.getRange(2, 1, A.getLastRow() - 1, 18).getValues().forEach(function (r) {
    var k = addrKey(r[16]), sk = key[String(r[6])];
    if (r[0] && !printed[String(r[0])] && k && sk && k === sk) codes.push(String(r[0]));
  });
  return moveWrongAddr(codes, '받는 주소 = 매장 주소(도로명 · 건물번호 같음)');
}

function printOps(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var token = String(ss.getSheetByName('설정').getRange('B2').getValue());
  if (!token || d.token !== token) return { ok: false, reason: 'token' };
  var L = ss.getSheetByName('편지');
  var n = L.getLastRow() - 1;
  if (d.type === 'phone_keys_put') return { ok: true, written: putPhoneKeys(d.rows) };
  if (d.type === 'store_hist_put') return { ok: true, written: putStoreHist(d.rows) };   // 매장 이력(phone_keys.py · 2026-11-16)
  if (d.type === 'store_hist_test') return { ok: true, hist: storeHist(d.sid, d.store) };   // 슬랙 「매장 이력」 줄 미리 보기(시트 · 슬랙에 안 씀)
  if (d.type === 'landing_list') { var LL = ss.getSheetByName('랜딩 문의 기록');   // 모집 명단에서 뺄 랜딩 문의 매장(fill_list.py · 2026-11-11)
    return { ok: true, rows: LL && LL.getLastRow() > 1 ? LL.getRange(2, 1, LL.getLastRow() - 1, 3).getValues().map(function (r) { return [r[0] instanceof Date ? r[0].toISOString() : String(r[0]), String(r[1]), String(r[2])]; }) : [] }; }
  if (d.type === 'closed_list') return { ok: true, rows: closedDb() };
  if (d.type === 'letter_text_put') return { ok: true, written: putLetterTexts(d.rows) };
  if (d.type === 'inq_slack_test') return { ok: true, slack: notifySlack({ type: 'inquiry', test: true, c: d.c, store: '테스트 매장', tel: '01000000000', time: '시험 발송', nick: '' }, 'Y', '시험 · 번호 확인 줄이 여기에 나옴') };   // 시트에 적지 않음
  if (n < 1) return { ok: true, rows: [], round: 1 };
  var lv = L.getRange(2, 1, n, LETTER_HEAD.length).getValues();
  if (d.type === 'letter_ids') return { ok: true, rows: lv.filter(function (r) { return r[0]; }).map(function (r) { return [String(r[0]), String(r[15]), String(r[3])]; }) };   // 편지코드 · 회원ID · 매장ID(번호 대조 키 만들기용 · 2026-11-10)
  if (d.type === 'print_mark') {
    var want = {}; (d.codes || []).forEach(function (c) { want[c] = true; });
    var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'), cnt = 0;
    lv.forEach(function (r, i) {
      if (want[String(r[0])]) { L.getRange(i + 2, PRINT_ROUND_COL, 1, 2).setValues([[d.round, today]]); cnt++; }
    });
    return { ok: true, marked: cnt };
  }
  if (d.type === 'sent_mark') {   // 우체국에 접수한 편지코드들의 발송일(G) 기록 → 발송일 + 「마감 관리」 B25 영업일에 도착 알림톡(2026-10-29)
    var wantS = {}; (d.codes || []).forEach(function (c) { wantS[c] = true; });
    var sd = d.date ? new Date(d.date + 'T00:00:00+09:00') : new Date(), cs = 0, st = staffIds(), skipS = 0;
    lv.forEach(function (r, i) {
      if (!wantS[String(r[0])]) return;
      if (st[String(r[15])]) { skipS++; return; }   // 점주 의심 회원 편지는 발송일을 적지 않음(2026-10-30)
      L.getRange(i + 2, 7).setValue(sd); cs++;
    });
    return { ok: true, marked: cs, skipped_staff: skipS, date: Utilities.formatDate(sd, 'Asia/Seoul', 'yyyy-MM-dd') };
  }
  var moved = screenWrongAddr();   // 받는 주소가 그 매장 주소인 신청은 인쇄 전에 「주소 오류」 탭으로 옮김(2026-10-29 결정)
  if (moved) { L = ss.getSheetByName('편지'); n = L.getLastRow() - 1; lv = n > 0 ? L.getRange(2, 1, n, LETTER_HEAD.length).getValues() : []; }
  var addr = {};
  var A = ss.getSheetByName('신청');
  if (A.getLastRow() > 1) A.getRange(2, 1, A.getLastRow() - 1, 18).getValues().forEach(function (r) {
    addr[String(r[0])] = { name: String(r[14]), zip: String(r[15]), addr: String(r[16]), addr2: String(r[17]) };
  });
  // 편지 종류별 본문(「편지 문안」 탭 A: 편지 종류, B: 본문)과 가게별 신청 수(QR 안내 「손님 등 N명」)
  var texts = {}, M = ss.getSheetByName('편지 문안');
  if (M && M.getLastRow() > 1) M.getRange(2, 1, M.getLastRow() - 1, 2).getValues().forEach(function (r) { if (r[0]) texts[String(r[0])] = String(r[1]); });
  var per = {};
  if (A.getLastRow() > 1) A.getRange(2, 7, A.getLastRow() - 1, 1).getValues().forEach(function (r) { var k = String(r[0]); if (k) per[k] = (per[k] || 0) + 1; });
  // 점주 · 직원 의심 회원(숨김 탭 「점주 의심」 A열)의 편지는 인쇄 · 발송하지 않음(2026-10-29 결정)
  var staff = {}, skipped = 0, SU = ss.getSheetByName('점주 의심');
  if (SU && SU.getLastRow() > 1) SU.getRange(2, 1, SU.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) staff[String(r[0])] = true; });
  // 손님 안내지 QR = 그 손님의 「내 편지」(M열) + 안내지 표시(utm_content=ltr_guide_qr)를 짧은 주소로. 한 번 만든 주소는 Z열에 두고 다시 씀(2026-10-29)
  if (!L.getRange(1, GUIDE_COL).getValue()) L.getRange(1, GUIDE_COL).setValue('안내지 QR 주소');
  var gz = L.getRange(2, GUIDE_COL, n, 1).getValues(), need = [];
  lv.forEach(function (r, i) { if (r[0] && !r[PRINT_DATE_COL - 1] && !staff[String(r[15])] && r[12] && !gz[i][0]) need.push(i); });
  if (need.length) {
    var sl = shortLinks(need.map(function (i) { return String(lv[i][12]) + '&utm_source=letter&utm_medium=guide_qr&utm_content=ltr_guide_qr'; }), '안내지 QR');
    need.forEach(function (i, k) { gz[i][0] = 'https://' + sl[k]; L.getRange(i + 2, GUIDE_COL).setValue(gz[i][0]); });
  }
  var round = 0, rows = [];
  lv.forEach(function (r, i) {
    round = Math.max(round, Number(r[PRINT_ROUND_COL - 1]) || 0);
    if (!r[0] || r[PRINT_DATE_COL - 1]) return;
    if (staff[String(r[15])]) { skipped++; return; }
    var a = addr[String(r[0])] || {};
    rows.push({ code: String(r[0]), store: String(r[4]), nick: String(r[5]), grp: String(r[16]), letter: String(r[17]), qr: String(r[18]),
      url: String(r[13]), guide: String(gz[i][0] || ''), name: a.name || '', zip: a.zip || '', addr: a.addr || '', addr2: a.addr2 || '',
      sid: String(r[3]), n: per[String(r[3])] || 1,
      due: r[9] instanceof Date ? Utilities.formatDate(r[9], 'Asia/Seoul', 'yyyy-MM-dd') : '' });   // 손님 안내지 「○월 ○일까지 건네 주세요」 = 전달 기한(신청일 + 21일)
  });
  return { ok: true, rows: rows, round: round + 1, texts: texts, skipped_staff: skipped };
}

// 손님이 입력한 값은 글자로 고정한다 (우편번호 앞자리 0 유지, '='로 시작하는 값이 수식으로 바뀌지 않게)
function txt(v) { return v === undefined || v === null || v === '' ? '' : "'" + v; }
function at(iso) { return iso ? new Date(iso) : ''; }

function sheet(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
  else if (sh.getLastColumn() < head.length) sh.getRange(1, sh.getLastColumn() + 1, 1, head.length - sh.getLastColumn()).setValues([head.slice(sh.getLastColumn())]);   // 새로 붙인 칸 머리글(2026-11-10)
  return sh;
}

function addApply(d) {
  var sh = sheet('신청', APPLY_HEAD);
  var r = sh.getLastRow() + 1;
  var B = 'B' + r, E = 'E' + r;
  sh.getRange(r, 1, 1, APPLY_HEAD.length).setValues([[
    txt(d.vid), at(d.ts), at(d.t0),
    '=IF(C' + r + '="","",ROUND((' + B + '-C' + r + ')*86400))',
    txt(d.uid), txt(d.t), txt(d.sid), txt(d.g), txt(d.src), txt(d.store),
    d.n === undefined || d.n === null ? '' : d.n,
    d.first === undefined ? '' : (d.first ? 'Y' : 'N'),
    txt(d.nick),
    d.nickChanged === undefined ? '' : (d.nickChanged ? 'Y' : 'N'),
    txt(d.name), txt(d.zip), txt(d.addr), txt(d.addr2),
    txt(d.device), txt(d.app), txt(d.ref),
    '=TEXT(' + B + ',"ddd")',
    '=TEXT(' + B + ',"hh")&"시"',
    '=IF(' + E + '="","",IF(COUNTIF(E$2:' + E + ',' + E + ')>1,"중복",""))',
    '접수', '', '', '', '', '', '',
    txt(d.grp), armLetter(d), armQr(d), txt(d.w)
  ]]);
}

function addVisit(d) {
  var sh = sheet('방문', VISIT_HEAD);
  sh.getRange(sh.getLastRow() + 1, 1, 1, VISIT_HEAD.length).setValues([[
    txt(d.vid), at(d.ts), txt(d.uid), txt(d.t), txt(d.sid), txt(d.g), txt(d.src), txt(d.store),
    txt(d.device), txt(d.app), '랜딩', '', '', txt(d.ref), txt(d.grp), txt(d.w), msgOf(d.ref)
  ]]);
}

// 방문 행의 도달 단계를 올리고(내리지는 않음) 해당 시각을 적는다. 방문 기록이 없으면 새로 만든다.
function updateVisit(d, step, timeCol) {
  if (!d.vid) return;
  var sh = sheet('방문', VISIT_HEAD);
  var found = sh.getRange('A:A').createTextFinder(d.vid).matchEntireCell(true).findNext();
  if (!found) { addVisit(d); found = sh.getRange('A:A').createTextFinder(d.vid).matchEntireCell(true).findNext(); }
  var r = found.getRow();
  var cur = sh.getRange(r, STEP_COL).getValue();
  if (STEPS.indexOf(step) > STEPS.indexOf(cur)) sh.getRange(r, STEP_COL).setValue(step);
  sh.getRange(r, timeCol).setValue(at(d.ts));
}

// 테스트용: Apps Script 편집기에서 이 함수를 실행하면 「방문」과 「신청」에 한 줄씩 들어갑니다.
function test() {
  var now = new Date().toISOString();
  var base = { vid: 'TEST' + Date.now(), uid: 'test', g: '1', src: 'call', store: '패스카페', device: 'PC', app: '일반 브라우저', ref: 'test' };
  doPost({ postData: { contents: JSON.stringify(Object.assign({ type: 'visit', ts: now }, base)) } });
  doPost({ postData: { contents: JSON.stringify(Object.assign({ type: 'apply', ts: now, t0: now, n: 9, first: true, nick: '라떼좋아', nickChanged: false, name: '홍길동', zip: '06236', addr: '서울 강남구 테헤란로 1', addr2: '101호' }, base)) } });
}

// ── 우체국 배달 조회(2026-10-29) ─────────────────────────────────────────────
// 「편지」 탭에서 운송장번호(H)가 있고 도착일(I)이 빈 편지를 우체국 국내등기 종적조회 API로 물어,
// 「배달완료」면 도착일(I)에 배달일자를 적는다 → 「도착 알림 대상」에 자동으로 오른다.
// 마지막 조회 결과는 Y열 「배송 상태」에 남긴다. 인증키는 「설정」 B4(공공데이터포털 일반 인증키 · 인코딩 안 된 값).
// 매일 자동: 편집기에서 installTrackTrigger를 한 번 실행(매일 13시 · 19시 dailyLetterJob = 배달 조회 → 도착 · 리마인드 알림톡).
var TRACK_URL = 'http://openapi.epost.go.kr/trace/retrieveLongitudinalService/retrieveLongitudinalService/getLongitudinalDomesticList';
var TRACK_COL = 25;   // 「편지」 Y열

function epostKey() {
  var k = PropertiesService.getScriptProperties().getProperty('EPOST_KEY');
  if (k) return k;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정');
  k = sh ? String(sh.getRange('B4').getValue()).trim() : '';
  try { if (/%[0-9A-F]{2}/i.test(k)) k = decodeURIComponent(k); } catch (e) {}   // Encoding 키를 넣어도 되게
  return k;
}

function tag(xml, name) {   // 마지막으로 나온 <name>값</name>
  var m = xml.match(new RegExp('<' + name + '>([^<]*)</' + name + '>', 'g'));
  return m ? m[m.length - 1].replace(/<[^>]+>/g, '').trim() : '';
}

// 등기번호 한 건 조회 → { ok, done(배달완료), day(yyyy-MM-dd), status, last, err }
function trackOne(rgist) {
  var no = String(rgist || '').replace(/\D/g, '');
  if (no.length !== 13) return { ok: false, err: '등기번호 13자리 아님' };
  var key = epostKey();
  if (!key) return { ok: false, err: '인증키 없음(설정 B4)' };
  var res = UrlFetchApp.fetch(TRACK_URL + '?ServiceKey=' + encodeURIComponent(key) + '&rgist=' + no, { muteHttpExceptions: true });
  var x = res.getContentText();
  var err = tag(x, 'returnAuthMsg') || tag(x, 'errMsg') || (res.getResponseCode() !== 200 ? 'HTTP ' + res.getResponseCode() : '');
  if (/조회결과가 없/.test(err)) return { ok: true, done: false, day: '', status: '', last: '아직 우체국 조회 안 됨(접수 직후일 수 있음)' };
  if (err && !/NORMAL/.test(err)) return { ok: false, err: err + (tag(x, 'returnReasonCode') ? ' (' + tag(x, 'returnReasonCode') + ')' : '') };
  var status = tag(x, 'dlvySttus'), dlvyDe = tag(x, 'dlvyDe');
  var last = [tag(x, 'dlvyDate'), tag(x, 'dlvyTime'), tag(x, 'nowLc'), tag(x, 'processSttus')].filter(String).join(' ');
  var done = /배달완료/.test(status) || /배달완료/.test(tag(x, 'processSttus'));
  var day = (dlvyDe || (done ? tag(x, 'dlvyDate') : '')).replace(/\./g, '-');
  if (!status && !last) return { ok: false, err: '조회 결과 없음', raw: x.slice(0, 300) };
  return { ok: true, done: done, day: day, status: status, last: last };
}

function trackArrivals() {
  var L = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지');
  if (!L || L.getLastRow() < 2) return { ok: true, checked: 0, arrived: 0, fail: 0 };
  if (!L.getRange(1, TRACK_COL).getValue()) L.getRange(1, TRACK_COL).setValue('배송 상태');
  var n = L.getLastRow() - 1, v = L.getRange(2, 8, n, 2).getValues();   // H 운송장번호 · I 도착일
  var now = Utilities.formatDate(new Date(), 'Asia/Seoul', 'M/d HH:mm'), checked = 0, arrived = 0, fail = 0;
  for (var i = 0; i < n; i++) {
    if (!v[i][0] || v[i][1]) continue;
    var r = trackOne(v[i][0]); checked++;
    if (!r.ok) { fail++; L.getRange(i + 2, TRACK_COL).setValue('조회 실패: ' + r.err + ' · ' + now); continue; }
    if (r.done && r.day) { L.getRange(i + 2, 9).setValue(new Date(r.day + 'T00:00:00+09:00')); arrived++; }
    L.getRange(i + 2, TRACK_COL).setValue((r.done ? '배달완료 ' + r.day : r.last || r.status) + ' · 조회 ' + now);
    Utilities.sleep(150);   // 초당 호출 제한
  }
  return { ok: true, checked: checked, arrived: arrived, fail: fail };
}

function installTrackTrigger() {   // 편집기에서 한 번만 실행
  ScriptApp.getProjectTriggers().forEach(function (t) { if (/^(trackArrivals|dailyLetterJob|landingWatch)$/.test(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });
  [13, 19].forEach(function (h) { ScriptApp.newTrigger('dailyLetterJob').timeBased().everyDays(1).atHour(h).inTimezone('Asia/Seoul').create(); });
  ScriptApp.newTrigger('landingWatch').timeBased().everyMinutes(1).create();   // #00랜딩문의알림 새 문의 확인(2026-10-29 · 2026-11-19 5분 → 1분)
}

// ── #00랜딩문의알림 → 편지 건넨 매장이면 댓글(2026-10-29) ─────────────────────
// 5분마다 채널의 새 랜딩 문의를 읽고, 문의 매장이 「손님이 편지를 건넸다고 기록한 매장」(전달 탭)일 때만 그 알림에 스레드 댓글을 단다.
// 매장 짝 맞추기: 매장 이름(띄어쓰기 · 기호 빼고 같거나, 한쪽이 다른 쪽을 품음) + 숨김 탭 「편지 매장 번호」(매장ID · 번호 해시 앞 12자)가 있으면 연락처 해시도.
// 봇 토큰(chat:write · channels:history) = 「설정」 B7, 실제로 댓글 달기 = B8이 Y일 때만(아니면 「랜딩문의 매칭」 탭에만 적음).
var LANDING_CH = 'CQVFJRHM4';
var LANDING_TAG = '<@U03UESU9QCV> <@UC4QUTTR7> <@U01BY0S45SN>';   // 정중호 · 강기성 · 황봄이(서울영업팀)
var MATCH_HEAD = ['확인 시각', '문의 시각', '문의 매장', '짝 맞춘 방법', '우리 매장', '댓글', '보냄'];
// 숨김 탭 「랜딩 문의 기록」: 모든 랜딩 문의(문의 시각 · 매장명 · 연락처 키 = SHA-256 앞 12자). 모집 명단을 만들 때 이 매장들은 뺌(사용자 결정 2026-11-11). 번호 원본은 적지 않음
var LANDING_LOG_HEAD = ['문의 시각', '문의 매장', '연락처 키', '슬랙 ts'];

function normName(s) { return String(s || '').replace(/[^0-9A-Za-z가-힣]/g, '').toLowerCase(); }
function normAddr(s) { return String(s || '').replace(/\([^)]*\)/g, '').toLowerCase().replace(/[^0-9a-z가-힣]/g, ''); }   // 주소 완전 일치 비교용(Snowflake 쪽과 같은 규칙)
function sha12(s) { return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(s), Utilities.Charset.UTF_8).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 12); }
function sameTail(a, b) { var k = 0; while (k < a.length && k < b.length && a[a.length - 1 - k] === b[b.length - 1 - k]) k++; return k; }   // 끝에서부터 같은 글자 수
function dice(a, b) {   // 두 글자씩 묶은 조각이 얼마나 겹치는지(0~1). 오타 · 한 글자 빠짐에도 높게 나옴
  var g = function (s) { var o = {}; for (var i = 0; i < s.length - 1; i++) { var k = s.substr(i, 2); o[k] = (o[k] || 0) + 1; } return o; };
  var A = g(a), B = g(b), hit = 0;
  Object.keys(A).forEach(function (k) { if (B[k]) hit += Math.min(A[k], B[k]); });
  return 2 * hit / Math.max(1, a.length - 1 + b.length - 1);
}
function md(v) {   // 「11월 14일」
  var d = v instanceof Date ? v : (/^\d{4}-\d{1,2}-\d{1,2}/.test(String(v)) ? new Date(String(v).slice(0, 10) + 'T00:00:00+09:00') : null);
  return d && !isNaN(d) ? Utilities.formatDate(d, 'Asia/Seoul', 'M월 d일') : String(v || '');
}
function phoneHash(p) {
  var no = String(p || '').replace(/\D/g, '');
  if (no.length < 9) return '';
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, no).map(function (b) { return ('0' + (b & 255).toString(16)).slice(-2); }).join('').slice(0, 12);
}

// 편지를 건넨 매장 목록: 매장 키(매장ID 또는 이름) → { name, sid, hand: [{nick, day}], qr }
function deliveredStores() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), out = {};
  var D = ss.getSheetByName('전달');
  if (!D || D.getLastRow() < 2) return out;
  D.getRange(2, 1, D.getLastRow() - 1, 7).getValues().forEach(function (r) {
    var sid = String(r[3] || ''), name = String(r[4] || ''), key = sid || normName(name);
    if (!key) return;
    var o = out[key] = out[key] || { sid: sid, name: name, hand: [], qr: null, uids: {} };
    var uid = String(r[2] || '');
    if (uid && o.uids[uid]) return;   // 같은 손님이 버튼을 두 번 누른 기록은 한 번만(2026-11-11 · 랜딩 문의 댓글에 같은 닉네임이 두 번 나오던 것)
    if (uid) o.uids[uid] = true;
    o.hand.push({ nick: String(r[5] || '') || '패써', day: r[6] || r[0], at: r[0] });
  });
  var Q = ss.getSheetByName('QR 접속');
  if (Q && Q.getLastRow() > 1) Q.getRange(2, 1, Q.getLastRow() - 1, 5).getValues().forEach(function (r) {
    var o = out[String(r[3] || '')] || out[normName(r[4])];
    if (o && r[0] instanceof Date && (!o.qr || r[0] < o.qr)) o.qr = r[0];
  });
  // 매장 주소 키(숨김 탭 「편지 매장 주소」 A 매장ID · B 도로명+건물번호 키, 인쇄 묶음 만들 때 Snowflake에서 채움)
  var A = ss.getSheetByName('편지 매장 주소');
  if (A && A.getLastRow() > 1) A.getRange(2, 1, A.getLastRow() - 1, 2).getValues().forEach(function (r) { if (out[String(r[0])]) out[String(r[0])].ak = String(r[1]); });
  // 우리 점주 페이지에서 사장님이 남긴 번호(「문의」 탭 G) → 해시로만 들고 있음
  var I = ss.getSheetByName('문의');
  if (I && I.getLastRow() > 1) I.getRange(2, 1, I.getLastRow() - 1, 7).getValues().forEach(function (r) {
    var o = out[String(r[3] || '')], h = phoneHash(r[6]);
    if (o && h) (o.tels = o.tels || {})[h] = true;
  });
  return out;
}

// 도로명 + 건물번호 키: 「월곶중앙로 70번길 3」 → 「중앙로70번길3」(도로명 끝 3글자 + 번호). Snowflake 쪽과 같은 규칙
function addrKey(s) {
  var m = String(s || '').match(/([가-힣]+(?:로|길))\s*([0-9]+(?:\s*번길\s*[0-9]+)?)/);
  return m ? m[1].slice(-3) + m[2].replace(/\s/g, '') : '';
}

// 문의 매장 이름 · 연락처 · 지역 → 편지 건넨 매장 { store, how } 또는 null
// 지난 문의 250건으로 잰 결과(2026-10-29): 연락처가 문의 전에 DB에 있던 건 22%, 이름은 맞는 매장을 80% 찾음, 주소는 도로명이 적힌 47%에서 보조
// 2026-11-19 점수제로 바꿈: 매장마다 점수를 매겨 가장 높은 매장을 고름. 70점 이상이고 같은 점수 다른 매장이 없을 때만 sure(댓글),
// 60~69점이거나 동점 매장이 있으면 sure=false(「랜딩문의 매칭」 탭에만 「확인 필요」로 적고 댓글 안 함)
// 브랜드 사전: 표기가 달라도 같은 브랜드로 묶고, 둘 다 브랜드가 잡혔는데 서로 다르면 이름으로는 짝 맞추지 않음
var BRANDS = [
  ['메가', ['메가mgc커피', 'mgc메가커피', '메가엠지씨커피', '메가커피', '메가mgc']], ['컴포즈', ['컴포즈커피', '컴포즈']],
  ['빽다방', ['빽다방', '백다방']], ['이디야', ['이디야커피', 'ediyacoffee', 'ediya', '이디야']], ['스타벅스', ['스타벅스', 'starbucks']],
  ['투썸', ['투썸플레이스', 'atwosomeplace', 'twosomeplace', '투썸']], ['할리스', ['할리스커피', 'hollys', '할리스']],
  ['매머드', ['매머드익스프레스', '매머드커피', '매머드']], ['더벤티', ['더벤티', 'theventi', '벤티']], ['커피에반하다', ['커피에반하다']],
  ['감성커피', ['감성커피']], ['하삼동', ['하삼동커피', '하삼동']], ['텐퍼센트', ['텐퍼센트커피', '10퍼센트커피', '텐퍼센트']],
  ['우지커피', ['우지커피']], ['공차', ['공차', 'gongcha']], ['엔제리너스', ['엔제리너스', 'angelinus']], ['카페봄봄', ['카페봄봄']],
  ['요거프레소', ['요거프레소']], ['해쉬커피', ['해쉬커피']], ['하이오커피', ['하이오커피']], ['백억커피', ['백억커피']],
  ['커피빈', ['커피빈', 'coffeebean']], ['폴바셋', ['폴바셋', 'paulbassett']], ['탐앤탐스', ['탐앤탐스', 'tomntoms']], ['파스쿠찌', ['파스쿠찌', 'pascucci']],
  ['바나프레소', ['바나프레소']], ['더리터', ['더리터']], ['쥬씨', ['쥬씨']], ['카페일리터', ['카페일리터']], ['천씨씨커피', ['천씨씨커피']],
  ['슈퍼사이즈커피', ['슈퍼사이즈커피']], ['팔공티', ['팔공티']], ['와플대학', ['와플대학']], ['커피나무', ['커피나무']], ['달콤커피', ['달콤커피']]
];
function nameParts(s) {   // 「메가 MGC 커피 부평점」 → { brand: '메가', br: '부평' } · 브랜드 못 잡으면 brand '' · br = 커피 · 카페 낱말과 끝 「점」 뺀 나머지
  var n = normName(s), brand = '', rest = n;
  for (var i = 0; i < BRANDS.length && !brand; i++) for (var j = 0; j < BRANDS[i][1].length; j++) {
    var v = BRANDS[i][1][j], at = n.indexOf(v);
    if (at >= 0 && at <= 2) { brand = BRANDS[i][0]; rest = n.slice(0, at) + n.slice(at + v.length); break; }
  }
  var br = rest.replace(/(커피|카페|cafe|coffee)/g, '').replace(/점$/, '');
  return { n: n, brand: brand, br: br };
}
function matchDelivered(name, phone, stores, region) {
  var h = phoneHash(phone), byHash = {}, ak = addrKey(region), rn = normName(region);
  var P = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지 매장 번호');
  if (h && P && P.getLastRow() > 1) P.getRange(2, 1, P.getLastRow() - 1, 2).getValues().forEach(function (r) { if (String(r[1]) === h) byHash[String(r[0])] = true; });
  var q = nameParts(name), n = q.n, cands = [];
  Object.keys(stores).forEach(function (k) {
    var s = stores[k], p = nameParts(s.name), m = p.n, sc = 0, how = '';
    var put = function (v, w) { if (v > sc) { sc = v; how = w; } };
    if (byHash[s.sid] || (h && s.tels && s.tels[h])) put(100, '연락처');
    if (ak && s.ak && ak === s.ak) put(80, '주소');
    var brandClash = q.brand && p.brand && q.brand !== p.brand;   // 다른 브랜드끼리는 이름 비교 안 함
    if (!brandClash && n && m) {
      var sh = n.length <= m.length ? n : m, lo = sh === n ? m : n;
      if (n === m) put(95, '매장 이름');
      if (q.brand && q.brand === p.brand && q.br && q.br === p.br && q.br.length >= 2) put(90, '매장 이름(브랜드 표기 다름)');
      if (sh.length >= 6 && /점$/.test(sh) && lo.indexOf(sh) >= 0) put(85, '매장 이름');
      if (q.brand && q.brand === p.brand && q.br && p.br) {
        var bs = q.br.length <= p.br.length ? q.br : p.br, bl = bs === q.br ? p.br : q.br;
        if (bs.length >= 4 && bl.indexOf(bs) >= 0) put(80, '지점명');   // 부평동아2단지 ⊂ 인천부평동아2단지
        else if (bs.length >= 3 && bl.indexOf(bs) >= 0) put(65, '지점명(확인 필요)');
        if (bs.length >= 3 && dice(q.br, p.br) >= 0.8) put(75, '비슷한 지점명');
        else if (bs.length >= 3 && dice(q.br, p.br) >= 0.6) put(60, '비슷한 지점명(확인 필요)');
      }
      if (n.length >= 6 && m.length >= 6 && n.slice(0, 2) === m.slice(0, 2) && dice(n, m) >= 0.8) put(75, '비슷한 매장 이름');
      if (n.slice(0, 2) === m.slice(0, 2) && /점$/.test(n) && sameTail(n, m) >= 5) put(75, '지점명');
      if (!q.brand && !p.brand && q.br.length >= 3 && p.br.length >= 3 && dice(q.br, p.br) >= 0.7) put(60, '비슷한 매장 이름(확인 필요)');
    }
    // 문의 「지역」에 매장 도로명이 들어 있으면 이름 점수에 +5(주소 · 연락처로 잡힌 건 그대로)
    var road = s.ak ? String(s.ak).replace(/[0-9].*$/, '') : '';
    if (sc >= 60 && sc < 100 && road.length >= 2 && rn.indexOf(road) >= 0) sc += 5;
    if (sc >= 60) cands.push({ store: s, how: how, score: sc });
  });
  if (!cands.length) return null;
  cands.sort(function (a, b) { return b.score - a.score; });
  var best = cands[0], tie = cands.length > 1 && cands[1].score === best.score && cands[1].store !== best.store && best.score < 100;
  best.sure = best.score >= 70 && !tie;
  if (tie) best.how += ' · 같은 점수 매장 ' + cands.filter(function (c) { return c.score === best.score; }).length + '곳';
  return best;
}

function landingComment(s) {
  var hand = s.hand.slice().sort(function (a, b) { return new Date(a.at) - new Date(b.at); });
  var who = hand.length === 1
    ? '패써 「' + hand[0].nick + '」님이 ' + md(hand[0].day) + '에 편지를 건넨 매장이에요.'
    : '패써 ' + hand.map(function (x) { return '「' + x.nick + '」님(' + md(x.day) + ')'; }).join(', ') + ', ' + hand.length + '분이 편지를 건넨 매장이에요.';
  var lines = ['💌 이 매장은 ' + who];
  if (s.qr) lines.push('사장님은 ' + md(s.qr) + '에 편지 속 QR로 손님 요청 페이지를 열어 보셨어요.');
  lines.push('통화하실 때 "손님이 전해 드린 편지 보셨죠?"로 시작하시면 이야기가 쉬워요. 히스토리 참고 부탁드려요.');
  lines.push(LANDING_TAG);
  return lines.join('\n');
}

function slackApi(method, payload) {
  var res = UrlFetchApp.fetch('https://slack.com/api/' + method, { method: 'post', contentType: 'application/json; charset=utf-8', muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + setting('B7') }, payload: JSON.stringify(payload) });
  return JSON.parse(res.getContentText());
}

// 문의 알림 글 하나 → 이름 · 연락처
function parseLanding(text) {
  var t = String(text || '');
  if (!/랜딩페이지/.test(t)) return null;
  var name = (t.match(/\*이름\*\s*([^|\n]+)/) || [])[1], phone = (t.match(/\*연락처\*\s*([0-9\- ]+)/) || [])[1];
  var region = (t.match(/\*지역\*\s*([^|\n]+)/) || [])[1];
  return name ? { name: name.trim(), phone: (phone || '').trim(), region: (region || '').trim() } : null;
}

function landingWatch() {
  if (!setting('B7')) return { ok: false, err: '봇 토큰 없음(설정 B7)' };
  // 1분마다 돌므로 앞 실행이 안 끝났으면 건너뜀(같은 문의에 댓글 두 번 방지). 스크립트 잠금은 신청 저장이 쓰므로 문서 잠금을 따로 씀
  var lk = LockService.getDocumentLock();
  if (lk && !lk.tryLock(1000)) return { ok: true, skipped: 'running' };
  try {
    // 2026-11-19 5분 → 1분: 편집기에서 installTrackTrigger를 다시 돌리지 않아도, 처음 한 번 스스로 1분 트리거로 바꿔 끼움
    var pp = PropertiesService.getScriptProperties();
    if (pp.getProperty('LW_EVERY') !== '1') {
      ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'landingWatch') ScriptApp.deleteTrigger(t); });
      ScriptApp.newTrigger('landingWatch').timeBased().everyMinutes(1).create();
      pp.setProperty('LW_EVERY', '1');
    }
    return landingWatchRun();
  } finally { if (lk) lk.releaseLock(); }
}
function landingWatchRun() {
  var props = PropertiesService.getScriptProperties();
  var oldest = props.getProperty('LANDING_LAST_TS') || String(Date.now() / 1000 - 3600);
  var res = slackApi('conversations.history', { channel: LANDING_CH, oldest: oldest, limit: 50 });
  if (!res.ok) return { ok: false, err: res.error };
  var msgs = (res.messages || []).filter(function (m) { return !m.thread_ts || m.thread_ts === m.ts; }).sort(function (a, b) { return Number(a.ts) - Number(b.ts); });
  if (!msgs.length) return { ok: true, seen: 0 };
  var stores = deliveredStores(), live = setting('B8').toUpperCase() === 'Y', log = sheet('랜딩문의 매칭', MATCH_HEAD), hit = 0;
  msgs.forEach(function (m) {
    var q = parseLanding(m.text);
    if (!q) return;
    var LL = sheet('랜딩 문의 기록', LANDING_LOG_HEAD);
    if (!LL.isSheetHidden()) LL.hideSheet();
    LL.appendRow([new Date(Number(m.ts) * 1000), q.name, "'" + phoneHash(q.phone), "'" + m.ts]);
    var mt = matchDelivered(q.name, q.phone, stores, q.region);
    if (mt && !mt.sure) log.appendRow([new Date(), new Date(Number(m.ts) * 1000), q.name, mt.how + ' (' + mt.score + '점)', mt.store.name, '', '확인 필요(댓글 안 함)']);
    if (mt && mt.sure) {
      var text = landingComment(mt.store), sent = '';
      if (live) { var r = slackApi('chat.postMessage', { channel: LANDING_CH, thread_ts: m.ts, text: text }); sent = r.ok ? 'Y' : '실패: ' + r.error; }
      log.appendRow([new Date(), new Date(Number(m.ts) * 1000), q.name, mt.how + ' (' + mt.score + '점)', mt.store.name, text, sent || '안 보냄(설정 B8)']);
      hit++;
    }
    props.setProperty('LANDING_LAST_TS', m.ts);   // 한 건 끝날 때마다 적어 둠(중간에 멈춰도 다음 실행에서 같은 댓글을 다시 안 닮)
  });
  props.setProperty('LANDING_LAST_TS', msgs[msgs.length - 1].ts);
  return { ok: true, seen: msgs.length, matched: hit, live: live };
}

// ── 도착 · 리마인드 알림톡 자동 발송(2026-10-29) ───────────────────────────────
// 백오피스 메시지 발송 API(POST /messages/send · 마케팅팀 키 「설정」 B5)로 「도착 알림 대상」 · 「리마인드 대상」 탭의 회원에게 보낸다.
// 보낸 편지는 「편지」 X열(도착 알림 발송일) · L열(리마인드 발송일)에 날짜를 적어 대상에서 빠지게 한다.
// 「설정」 B6이 Y일 때만 실제로 보냄(아니면 몇 명인지만 슬랙에 알림). 200 응답은 접수일 뿐이라 실제 성공은 백오피스 「발송 내역」에서 확인.
var MSG_API = 'https://release.passorder.me/messages/send';
var MSG = {   // 변수 순서 = 백오피스 템플릿 #{} 순서(templates/arrive.xlsx · remind.xlsx)
  arrive: { code: 'ltr_arr_myletter', tab: '도착 알림 대상', mark: 24, name: '도착 알림톡', vars: function (r) { return [r[1], r[2], r[3], r[4]]; } },   // 닉네임 · 신청일 · 매장명 · 전달기한
  remind: { code: 'ltr_rmd_myletter', tab: '리마인드 대상', mark: 12, name: '리마인드 알림톡', vars: function (r) { return [r[1], r[3], r[3], r[4]]; } }  // 닉네임 · 매장명 · 매장명 · 전달기한
};

function setting(cell) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정');
  return sh ? String(sh.getRange(cell).getValue()).trim() : '';
}

// 긴 링크 → 짧은 주소(go/?k=코드, https:// 뺀 꼴 · 템플릿이 https://를 붙임). 「링크」 탭에 적음
function shortLinks(urls, label) {
  var abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', rows = [], out = [];
  urls.forEach(function (u) {
    var k = ''; for (var i = 0; i < 8; i++) k += abc.charAt(Math.floor(Math.random() * abc.length));
    rows.push([k, u, label, new Date()]); out.push('paytalab-m.github.io/letter/go/?k=' + k);
  });
  if (rows.length) { var sh = sheet('링크', LINK_HEAD); sh.getRange(sh.getLastRow() + 1, 1, rows.length, 4).setValues(rows); }
  return out;
}

function msgRequest(uid, vars, link) {
  return { user_identifier: String(uid), variables: { title: [], content: vars, deep_link: [], replacement_title: [], replacement_content: [],
    message_addon_element: { pc_link: [link], mobile_link: [link] } } };
}

function msgPost(code, reqs) {
  var key = setting('B5');
  if (!key) return { ok: false, err: 'API 키 없음(설정 B5)' };
  var res = UrlFetchApp.fetch(MSG_API, { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: 'PaytalabAK ' + Utilities.base64Encode(key) },
    payload: JSON.stringify({ message_code: code, message_requests: reqs }) });
  var body = res.getContentText();
  return { ok: res.getResponseCode() === 200, http: res.getResponseCode(), body: body.slice(0, 300) };
}

// 한 회원에게 견본 값으로 한 통(시트에 날짜를 적지 않음)
function msgTest(kind, uid) {
  var m = MSG[kind];
  if (!m || !uid) return { ok: false, err: 'kind · uid 필요' };
  // 시험 발송은 「설정」 B9에 적힌 우리 쪽 시험 회원ID(쉼표로 여러 개)에게만. 비어 있으면 아무에게도 안 감
  var ok = setting('B9').split(/[,\s]+/).filter(String).some(function (x) { return x === String(uid); });
  if (!ok) return { ok: false, err: '설정 B9 시험 회원ID 목록에 없는 회원이라 안 보냄' };
  var link = shortLinks(['https://paytalab-m.github.io/letter/my-letter/?uid=' + encodeURIComponent(uid) + '&store=' + encodeURIComponent('테스트매장') + '&nick=' + encodeURIComponent('호야')], m.name + ' 시험')[0];
  return msgPost(m.code, [msgRequest(uid, m.vars(['', '호야', '10월 29일', '테스트매장', '11월 19일']), link)]);
}

// 1인 1회 · 관련 없는 사람 금지(2026-10-30 사용자 지시) — 대상 탭 수식과 따로, 보내기 직전에 코드가 한 번 더 거른다.
//   ① 그 회원ID의 편지 중 발송일(G)이 적힌 게 있어야 함(우리가 실제로 편지를 부친 손님만)
//   ② 회원 단위로 한 번: 그 회원의 편지 어느 줄이든 이미 표시(X · L)가 있으면 뺌 + 한 번 돌 때도 같은 회원ID는 한 줄만
//   ③ 실제로 보낸 회원ID는 스크립트 속성(SENT_종류_회원ID)에 영구 기록 → 누가 시트 칸을 지워도 다시 안 감
//   ④ 점주 의심(숨김 탭 「점주 의심」 A열) 회원은 뺌 — 인쇄 뒤에 의심 명단에 오른 경우까지(2026-10-30)
function staffIds() {
  var SU = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('점주 의심'), staff = {};
  if (SU && SU.getLastRow() > 1) SU.getRange(2, 1, SU.getLastRow() - 1, 1).getValues().forEach(function (r) { if (r[0]) staff[String(r[0])] = true; });
  return staff;
}

// 알림톡(도착 · 리마인드)을 보내지 않을 편지코드: 반송 · 폐업 등 손님이 편지를 전할 수 없는 편지(2026-11-18 사용자 결정 · @99)
// 새로 생기면 여기에 더하거나, 배포 없이 「설정」 B27에 쉼표로 적음
var NO_MSG_CODES = {
  LMVRWB4WU8XK: '반송 1-11-10 빽다방 춘천강북점',
  LMVRV99DBAMA: '반송 1-02-08 메가MGC커피 세종해밀점',
  LMVRWAFI7YK3: '반송 1-22-10 볕내',
  LMVRUYK6WVXT: '폐업 제보 1-11-14 요거프레소 평택팽성점'
};
function noMsgCodes() {
  var s = {};
  Object.keys(NO_MSG_CODES).forEach(function (c) { s[c] = true; });
  setting('B27').split(/[\s,]+/).forEach(function (c) { if (c) s[c] = true; });
  return s;
}

function eligible(kind, rows) {
  var m = MSG[kind], L = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('편지');
  if (!L || L.getLastRow() < 2) return [];
  var block = noMsgCodes();
  rows = rows.filter(function (r) { return !block[String(r[6])]; });
  var sent = {}, done = {}, props = PropertiesService.getScriptProperties().getProperties(), seen = {}, staff = staffIds();
  L.getRange(2, 1, L.getLastRow() - 1, 24).getValues().forEach(function (r) {
    var u = String(r[15]);
    if (!u) return;
    if (r[6] !== '') sent[u] = true;
    if (r[m.mark - 1] !== '') done[u] = true;
  });
  return rows.filter(function (r) {
    var u = String(r[0]);
    if (!u || staff[u] || !sent[u] || done[u] || props['SENT_' + kind + '_' + u] || seen[u]) return false;
    return (seen[u] = true);
  });
}

function sendKind(kind, live) {
  var m = MSG[kind], ss = SpreadsheetApp.getActiveSpreadsheet();
  var T = ss.getSheetByName(m.tab);
  if (!T || T.getLastRow() < 2) return { n: 0, sent: 0 };
  var rows = eligible(kind, T.getRange(2, 1, T.getLastRow() - 1, 7).getDisplayValues().filter(function (r) { return r[0] && r[5] && r[6]; }));   // 회원ID · 링크 · 편지코드
  if (!rows.length || !live) return { n: rows.length, sent: 0 };
  // 보내기 전에 먼저 표시: 그 회원의 편지 모든 줄에 날짜 + 영구 기록. 발송이 실패해도 지우지 않음(두 번 가는 것보다 안 가는 게 나음 · 슬랙으로 알림)
  var L = ss.getSheetByName('편지'), uids = L.getRange(2, 16, L.getLastRow() - 1, 1).getValues(), who = {}, today = new Date(), rec = {};
  rows.forEach(function (r) { who[String(r[0])] = true; rec['SENT_' + kind + '_' + r[0]] = Utilities.formatDate(today, 'Asia/Seoul', 'yyyy-MM-dd HH:mm'); });
  uids.forEach(function (u, i) { if (who[String(u[0])]) L.getRange(i + 2, m.mark).setValue(today); });
  PropertiesService.getScriptProperties().setProperties(rec);
  SpreadsheetApp.flush();
  var links = shortLinks(rows.map(function (r) { return r[5]; }), m.name + ' 자동');
  var res = msgPost(m.code, rows.map(function (r, i) { return msgRequest(r[0], m.vars(r), links[i]); }));
  if (!res.ok) return { n: rows.length, sent: 0, err: 'HTTP ' + res.http + ' ' + res.body + ' · 다시 안 보내도록 표시는 남겨 둠(백오피스 발송 내역 확인 뒤 사람이 판단)' };
  return { n: rows.length, sent: rows.length };
}

// ── 예상 도착일(2026-10-29: 준등기는 비용 때문에 안 씀 → 일반 우편) ─────────────────
// 「편지」 G열 발송일(우체국 접수일)이 있고 도착일(I)이 빈 편지는, 발송일 + 「마감 관리」 B25 영업일(기본 4 = 일반 우편 D+3 + 여유 1일)이
// 지나면 도착일에 그 날짜를 적는다 → 「도착 알림 대상」에 올라 도착 알림톡이 나감. Y열에 「예상 도착」으로 남김.
// 영업일은 토 · 일 · 공휴일을 뺌. 공휴일은 「마감 관리」 B26(쉼표로 YYYY-MM-DD) + 아래 기본 목록
var HOLIDAYS = ['2026-12-25', '2027-01-01', '2027-02-08', '2027-02-09', '2027-03-01'];
function addBizDays(d, n, hol) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate()), off = {};
  HOLIDAYS.concat(hol || []).forEach(function (h) { off[String(h).trim()] = true; });
  while (n > 0) {
    x.setDate(x.getDate() + 1);
    if (x.getDay() !== 0 && x.getDay() !== 6 && !off[Utilities.formatDate(x, 'Asia/Seoul', 'yyyy-MM-dd')]) n--;
  }
  return x;
}

function predictArrivals() {
  var ss = SpreadsheetApp.getActiveSpreadsheet(), L = ss.getSheetByName('편지');
  if (!L || L.getLastRow() < 2) return { predicted: 0 };
  var MG = ss.getSheetByName('마감 관리'), days = Number(MG.getRange('B25').getValue()) || 4;
  var hol = String(MG.getRange('B26').getDisplayValue() || '').split(/[,\s]+/).filter(String);
  if (!L.getRange(1, TRACK_COL).getValue()) L.getRange(1, TRACK_COL).setValue('배송 상태');
  var n = L.getLastRow() - 1, v = L.getRange(2, 7, n, 3).getValues(), today = new Date(), cnt = 0;   // G 발송일 · H 운송장 · I 도착일
  for (var i = 0; i < n; i++) {
    if (!(v[i][0] instanceof Date) || v[i][2]) continue;
    var due = addBizDays(v[i][0], days, hol);
    if (today < due) continue;
    L.getRange(i + 2, 9).setValue(due);
    L.getRange(i + 2, TRACK_COL).setValue('예상 도착 ' + Utilities.formatDate(due, 'Asia/Seoul', 'M/d') + ' (발송일 + ' + days + '영업일)');
    cnt++;
  }
  return { predicted: cnt };
}

function dailyLetterJob() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: false, reason: '이미 도는 중' };   // 13 · 19시 트리거와 손으로 돌리기가 겹쳐 두 번 보내지 않게
  try { return dailyLetterJobRun(); } finally { lock.releaseLock(); }
}

function dailyLetterJobRun() {
  var tr = trackArrivals(), pr = predictArrivals();
  var live = setting('B6').toUpperCase() === 'Y', out = { track: tr, predict: pr, live: live };
  ['arrive', 'remind'].forEach(function (k) { try { out[k] = sendKind(k, live); } catch (e) { out[k] = { n: 0, sent: 0, err: String(e) }; } });
  var line = function (k) { var o = out[k]; return MSG[k].name + ' ' + (live ? o.sent + '명 보냄' : o.n + '명 대상(자동 발송 꺼짐 · 설정 B6)') + (o.err ? ' · 실패: ' + o.err : ''); };
  var text = '*편지 도착 · 알림톡*\n오늘 도착으로 본 편지 ' + (pr.predicted + tr.arrived) + '통(예상 도착일 기준 ' + pr.predicted + '통' + (tr.checked ? ' · 배달 조회 ' + tr.arrived + '통' : '') + ')' +
    '\n' + line('arrive') + '\n' + line('remind') + (live ? '\n실제 성공 여부는 백오피스 「발송 내역」에서 확인' : '');
  try { var url = slackUrl('SLACK_WEBHOOK_APPLY', 'B3'); if (url && (pr.predicted || tr.checked || out.arrive.n || out.remind.n)) UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: text }), muteHttpExceptions: true }); } catch (e) {}
  return out;
}

// 「네이버 플레이스 기반 신규 매장 데이터」 폐업 매장 DB(다른 시트)를 읽기 전용으로 읽음 → 모집 · 인쇄 전 폐업 매장 제외(2026-11-12)
// 권한: 고급 서비스 Sheets + spreadsheets.readonly(다른 시트는 읽기만 · 고치기 불가). 처음 한 번 편집기에서 authClosedDb 실행 → 허용
function closedDb() {
  var v = Sheets.Spreadsheets.Values.get(CLOSED_DB_ID, "'폐업 매장 DB'!A2:R", { valueRenderOption: 'FORMATTED_VALUE' }).values || [];
  return v.filter(function (r) { return r[0]; }).map(function (r) {
    return [String(r[0]), String(r[1] || ''), String(r[5] || r[4] || ''), String(r[3] || ''), String(r[16] || ''), String(r[17] || '')];   // 플레이스ID · 매장명 · 주소 · 전화 · 폐업확인일 · 고객구분
  });
}
function authClosedDb() { Logger.log('폐업 매장 DB ' + closedDb().length + '줄 읽음'); }

// ── 사장님 수요 안내 메시지 (2026-11-20) ─────────────────────────────────────────────
// 노션 표(설정 B35)에서 조건에 맞는 매장을 「수요 안내 대상」 탭에 쌓고(dmSync), 기준 일시 다음 영업일 14:30에 비즈톡 브랜드 메시지(dmSend)
//   → #편지-신청자-알림(설정 B3)에 [수요 안내 · 브랜드 메시지] 머리말로 기록 → 랜딩(letter/req/?c=P…) 접속 · 문의는 「수요 안내 랜딩」 탭
// 브랜드 메시지는 광고성: 마케팅 수신 동의 칸이 「동의」인 매장만 보냄. 그 외는 「보류」로만 남김. 한 매장에 한 번만(DMSENT_코드).
// 설정 탭: B30 노션 통합 토큰 · B31 비즈톡 발송 API 주소 · B32 인증 헤더 값 · B33 요청 본문 틀(JSON, {{phone}} {{store}} {{n}} {{link}}) ·
//   B34 자동 발송(Y일 때만 실제 발송) · B35 노션 연결 설정(JSON: db · filter[속성, 값] · store · phone · n · at · agree · note[속성들])
var DM_HEAD = ['코드', '노션 페이지', '매장ID', '매장', '사장님 번호', '손님 수요', '기준 일시', '메모 1', '메모 2', '메시지 수신 동의',
  '발송 예정', '발송 시각', '발송 결과', '랜딩 링크', '랜딩 접속 수', '첫 접속', '사장님 문의', '메모'];
var DM_LAND_HEAD = ['시각', '종류', '코드', '매장', '연락처', '통화 희망', '기기', '열린 앱', '유입 URL', '브라우저 번호', '기기 특징', '슬랙'];
var DM_TAB = '수요 안내 대상', DM_LAND_TAB = '수요 안내 랜딩';
var DM_URL = 'https://paytalab-m.github.io/letter/req/';
var DM_HOUR = 14, DM_MIN = 30;

function isDmCode(c) { return /^P[A-Z0-9]{9}$/.test(String(c || '')); }

function dmStore(code) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DM_TAB);
  if (!sh || !code) return null;
  var f = sh.getRange('A:A').createTextFinder(String(code)).matchEntireCell(true).matchCase(true).findNext();
  if (!f || f.getRow() === 1) return null;
  var r = sh.getRange(f.getRow(), 1, 1, DM_HEAD.length).getValues()[0];
  var due = r[10] instanceof Date ? Utilities.formatDate(new Date(r[10].getTime() + 7 * 864e5), 'Asia/Seoul', 'yyyy-MM-dd') : '';
  return { row: f.getRow(), code: String(r[0]), sid: String(r[2]), store: String(r[3]), n: r[5], due: due };
}

// 기준 일시 다음 영업일(토 · 일 · 공휴일 뺌) 14:30. 이미 지났으면 지금 다음의 14:30
function dmSlot(from) {
  var MG = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('마감 관리');
  var hol = MG ? String(MG.getRange('B26').getDisplayValue() || '').split(/[,\s]+/).filter(String) : [];
  var d = addBizDays(from, 1, hol); d.setHours(DM_HOUR, DM_MIN, 0, 0);
  var now = new Date();
  while (d < now) { d = addBizDays(d, 1, hol); d.setHours(DM_HOUR, DM_MIN, 0, 0); }
  return d;
}

function dmNotion(token, cfg) {
  var out = [], cursor = null;
  do {
    var body = { page_size: 100 };
    if (cfg.filter) body.filter = { property: cfg.filter[0], select: { equals: cfg.filter[1] } };
    if (cursor) body.start_cursor = cursor;
    var res = UrlFetchApp.fetch('https://api.notion.com/v1/databases/' + cfg.db + '/query', { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
      headers: { Authorization: 'Bearer ' + token, 'Notion-Version': '2022-06-28' }, payload: JSON.stringify(body) });
    if (res.getResponseCode() !== 200) throw new Error('노션 ' + res.getResponseCode() + ' ' + res.getContentText().slice(0, 200));
    var j = JSON.parse(res.getContentText());
    out = out.concat(j.results || []); cursor = j.has_more ? j.next_cursor : null;
  } while (cursor);
  var val = function (p) {
    if (!p) return '';
    if (p.type === 'title' || p.type === 'rich_text') return (p[p.type] || []).map(function (x) { return x.plain_text; }).join('');
    if (p.type === 'select') return p.select ? p.select.name : '';
    if (p.type === 'date') return p.date ? p.date.start : '';
    if (p.type === 'phone_number' || p.type === 'number') return p[p.type] == null ? '' : p[p.type];
    return '';
  };
  return out.map(function (pg) {
    var P = pg.properties || {};
    return { id: pg.id, store: val(P[cfg.store]), phone: val(P[cfg.phone]), n: val(P[cfg.n]), at: val(P[cfg.at]), agree: val(P[cfg.agree]),
      note: (cfg.note || []).map(function (k) { return val(P[k]); }) };
  });
}

// 노션 → 「수요 안내 대상」. 새 매장은 코드 · 발송 예정을 만들고, 이미 있는 매장은 메모 · 동의만 새로 씀(발송 예정은 안 바꿈)
function dmSync() {
  var token = setting('B30'), cfg;
  try { cfg = JSON.parse(setting('B35') || 'null'); } catch (e) { cfg = null; }
  if (!token || !cfg || !cfg.db) return { ok: false, err: '노션 설정 없음(설정 B30 · B35)' };
  var pages = dmNotion(token, cfg), sh = sheet(DM_TAB, DM_HEAD), have = {}, added = [];
  if (sh.getLastRow() > 1) sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().forEach(function (r, i) { have[String(r[0])] = i + 2; });
  var abc = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  pages.forEach(function (p) {
    var row = have[p.id];
    if (row) { sh.getRange(row, 8, 1, 3).setValues([[p.note[0] || '', p.note[1] || '', p.agree]]); return; }
    var code = 'P'; for (var i = 0; i < 9; i++) code += abc.charAt(Math.floor(Math.random() * abc.length));
    var when = p.at ? new Date(p.at) : new Date(), due = dmSlot(when);
    var link = DM_URL + '?c=' + code + (p.n ? '&r=' + p.n : '') + '&utm_source=kakao&utm_medium=brandmsg&utm_campaign=owner_demand&utm_content=' + code;
    sh.appendRow([code, p.id, '', p.store, "'" + String(p.phone).replace(/\D/g, ''), p.n, when, p.note[0] || '', p.note[1] || '', p.agree, due, '', '', link, 0, '', '', '']);
    added.push({ store: p.store, due: due, agree: p.agree });
  });
  return { ok: true, notion: pages.length, added: added };
}

// 비즈톡 발송 한 건. 요청 모양은 비즈톡 문서대로 설정 B33에 JSON 틀로 적음(코드에 추측해서 넣지 않음)
function bizSend(v) {
  var url = setting('B31'), auth = setting('B32'), tpl = setting('B33');
  if (!url || !tpl) return { ok: false, err: '비즈톡 설정 없음(설정 B31 · B33)' };
  var body = tpl.replace(/\{\{(\w+)\}\}/g, function (m, k) { return JSON.stringify(String(v[k] == null ? '' : v[k])).slice(1, -1); });
  var opt = { method: 'post', contentType: 'application/json; charset=utf-8', payload: body, muteHttpExceptions: true };
  if (auth) opt.headers = { Authorization: auth };
  var res = UrlFetchApp.fetch(url, opt), code = res.getResponseCode();
  return { ok: code >= 200 && code < 300, http: code, body: res.getContentText().slice(0, 200) };
}

function dmPreview(code) {
  var c = dmStore(code);
  if (!c) return { ok: false, err: '코드 없음' };
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DM_TAB), r = sh.getRange(c.row, 1, 1, DM_HEAD.length).getValues()[0];
  var tpl = setting('B33'), v = { phone: String(r[4]).replace(/\D/g, ''), store: r[3], n: r[5], link: r[13] };
  return { ok: true, values: v, body: tpl ? tpl.replace(/\{\{(\w+)\}\}/g, function (m, k) { return String(v[k] == null ? '' : v[k]); }) : '(설정 B33 비어 있음)' };
}

// 발송 예정이 지난 매장: 동의 = 「동의」면 보냄, 아니면 「보류」로 한 번만 남김. 보내기 전에 먼저 표시(두 번 가는 것보다 안 가는 게 나음)
function dmSend(live) {
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DM_TAB), out = { sent: [], failed: [], held: [], due: [] };
  if (!sh || sh.getLastRow() < 2) return out;
  var v = sh.getRange(2, 1, sh.getLastRow() - 1, DM_HEAD.length).getValues(), now = new Date(), props = PropertiesService.getScriptProperties();
  v.forEach(function (r, i) {
    var row = i + 2, code = String(r[0]);
    if (!code || r[11] || !(r[10] instanceof Date) || r[10] > now || props.getProperty('DMSENT_' + code)) return;
    if (String(r[9]) !== '동의') { if (!r[12]) { sh.getRange(row, 13).setValue('보류: 메시지 수신 동의 없음'); out.held.push(r[3]); } return; }
    if (!live) { out.due.push(r[3]); return; }
    sh.getRange(row, 12).setValue(now); props.setProperty('DMSENT_' + code, Utilities.formatDate(now, 'Asia/Seoul', 'yyyy-MM-dd HH:mm')); SpreadsheetApp.flush();
    var link = shortLinks([r[13]], '수요 안내 브랜드 메시지')[0];
    var res;
    try { res = bizSend({ phone: String(r[4]).replace(/\D/g, ''), store: r[3], n: r[5], link: link }); } catch (e) { res = { ok: false, err: String(e) }; }
    sh.getRange(row, 13).setValue(res.ok ? '성공 ' + res.http : '실패 ' + (res.http || '') + ' ' + (res.err || res.body || ''));
    (res.ok ? out.sent : out.failed).push(r[3] + (res.ok ? '' : ' (' + (res.err || 'HTTP ' + res.http) + ')'));
  });
  return out;
}

function dmSlack(text) {
  var url = slackUrl('SLACK_WEBHOOK_APPLY', 'B3');
  if (!url) return '웹후크 없음';
  try { var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: text }), muteHttpExceptions: true }); return r.getResponseCode() === 200 ? 'Y' : '실패 ' + r.getResponseCode(); }
  catch (e) { return '실패'; }
}

function md2(d) { return d instanceof Date ? Utilities.formatDate(d, 'Asia/Seoul', 'M/d') + '(' + '일월화수목금토'.charAt(d.getDay()) + ') ' + Utilities.formatDate(d, 'Asia/Seoul', 'HH:mm') : ''; }

// 15분마다(installDmTrigger). 노션 읽기 → 보낼 때 된 것 보내기 → 바뀐 게 있을 때만 슬랙 한 번
function dmJob() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return { ok: false, reason: '이미 도는 중' };
  try {
    var sy; try { sy = dmSync(); } catch (e) { sy = { ok: false, err: String(e) }; }
    var live = setting('B34').toUpperCase() === 'Y', se = dmSend(live), L = ['*[수요 안내 · 브랜드 메시지]*'];
    if (sy.added && sy.added.length) L.push('발송 예약 ' + sy.added.length + '곳: ' + sy.added.map(function (a) { return a.store + ' ' + md2(a.due) + (a.agree === '동의' ? '' : ' (수신 동의 없음 → 보내지 않음)'); }).join(' / '));
    if (se.sent.length) L.push('발송 성공 ' + se.sent.length + '곳: ' + se.sent.join(', '));
    if (se.failed.length) L.push('발송 실패 ' + se.failed.length + '곳: ' + se.failed.join(', ') + ' → 다시 안 보냄, 비즈톡 발송 내역 확인');
    if (se.held.length) L.push('보류 ' + se.held.length + '곳(메시지 수신 동의 없음): ' + se.held.join(', '));
    if (se.due.length) L.push('발송 시각 지남 ' + se.due.length + '곳: ' + se.due.join(', ') + ' (자동 발송 꺼짐 · 설정 B34)');
    if (!sy.ok) L.push('노션 읽기 실패: ' + sy.err);
    if (L.length > 1) dmSlack(L.join('\n'));
    return { ok: true, sync: sy, send: se, live: live };
  } finally { lock.releaseLock(); }
}

function installDmTrigger() {   // 편집기에서 한 번만 실행
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'dmJob') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('dmJob').timeBased().everyMinutes(15).create();
}

// 랜딩 접속 · 문의 → 「수요 안내 랜딩」 + 대상 탭 접속 수 · 첫 접속 · 사장님 문의. 문의만 슬랙(B3)에 알림
function dmLanding(d, cp) {
  var kind = d.type === 'scan' ? '접속' : d.type === 'inquiry' ? '문의' : '비즈 이동', slack = '';
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(DM_TAB), r = cp.row;
  if (kind === '접속') { sh.getRange(r, 15).setValue((Number(sh.getRange(r, 15).getValue()) || 0) + 1); if (!sh.getRange(r, 16).getValue()) sh.getRange(r, 16).setValue(new Date()); }
  if (kind === '문의') {
    sh.getRange(r, 17).setValue(new Date());
    var tel = String(d.tel || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
    slack = dmSlack(['*[수요 안내 · 브랜드 메시지] 사장님 문의 · ' + cp.store + (d.edit ? ' (연락처 수정)' : '') + '*', '', '*연락처: ' + (tel || '-') + '*', '*통화 희망: ' + (d.time || '-') + '*',
      '매장: ' + cp.store + ' / 손님 수요: ' + (cp.n || '-') + '명 / 코드: ' + cp.code].join('\n'));
  }
  sheet(DM_LAND_TAB, DM_LAND_HEAD).appendRow([at(d.ts) || new Date(), kind, cp.code, cp.store, kind === '문의' ? txt(d.tel) : '', txt(d.time), txt(d.device), txt(d.app), txt(d.ref), txt(d.bid), txt(d.sig), slack]);
}
