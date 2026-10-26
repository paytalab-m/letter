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
var VISIT_HEAD = ['방문ID', '진입시각', '회원ID', '열쇠', '매장ID', '소구', '경로', '매장', '기기', '열린 앱', '도달 단계', '신청화면 진입시각', '신청시각', '유입 URL', '시험', '차수'];
var DELIV_HEAD = ['기록시각', '열쇠', '회원ID', '매장ID', '매장', '닉네임', '건넨 날', '누구에게', '신청번호', '기기', '열린 앱', '유입 URL', '참여쿠폰 지급일', '메모', '건넨 뒤 체크'];
var STEP_COL = 11, FORM_AT_COL = 12, APPLY_AT_COL = 13; // 「방문」의 도달 단계 · 신청화면 진입시각 · 신청시각 열
var DELIV_MARK_COL = 14; // 「모집대상」 N열 「전달 기록」
var VIEW_HEAD = ['열람시각', '열쇠', '회원ID', '매장ID', '매장', '전달 기한', '이미 기록함', '기기', '열린 앱', '유입 URL'];
var VIEW_MARK_COL = 15; // 「모집대상」 O열 「내 편지 열람」
var STEPS = ['랜딩', '신청화면', '신청완료'];
// 마감 규칙: 랜딩에서 신청 마감을 막지 않음 (2026-10-23 사용자 결정). 다시 켜려면 숫자를 넣고 새 버전 배포
var STORE_CAP = 0;                    // 가게당 인원 마감 (예: 3). 0이면 안 씀
var QUOTA = {};                       // 시험별 우편 정원 (예: { s: 1505, q: 801 }). 비우면 안 씀
var QUOTA_ALL = 0;                    // 전체 정원. 0이면 안 씀
var APPLY_GRP_COL = 32;               // 「신청」 AF열 「시험」
var LETTER_HEAD = ['신청번호', '신청시각', '열쇠', '매장ID', '매장', '닉네임', '발송일', '운송장번호', '도착일', '전달 기한', '문의 기한', '리마인드 발송일', '내 편지 링크', '점주 QR 링크', '메모', '회원ID', '시험', '편지 종류', 'QR 여부', '인쇄 회차', '인쇄일'];
var PRINT_ROUND_COL = 20, PRINT_DATE_COL = 21; // 「편지」 T · U열
var SCAN_HEAD = ['접속시각', '편지코드', '열쇠', '매장ID', '매장', '손님 전달 기록 있음', '기기', '열린 앱', '유입 URL'];
var INQ_HEAD = ['접수시각', '편지코드', '열쇠', '매장ID', '매장', '손님 닉네임', '전화번호', '통화 시간대', '매장 첫 문의', '기기', '유입 URL', '처리상태', '첫 통화일', '결과', '성공쿠폰 지급일', '메모', '다시 보냄', '슬랙 알림'];
var QR_MARK_COL = 16, INQ_MARK_COL = 17; // 「모집대상」 P열 「QR 접속」 · Q열 「사장님 문의」
// 링크 주소 (정식 계정으로 옮기면 여기 두 줄만 바꾼다)
var MYLETTER_URL = 'https://paytalab-m.github.io/letter/my-letter/';
var OWNER_URL = 'https://paytalab-m.github.io/letter/owner-qr/';

function doGet(e) {
  var q = e.parameter || {};
  var out = { ok: false };
  if (q.code) { // c는 Apps Script 웹 앱이 예약한 이름이라 조회에는 code를 쓴다
    // 점주 페이지: 편지코드로 매장명 · 편지 전한 손님 닉네임 · 문의 기한만 돌려준다
    var lp = letter(q.code);
    if (lp) out = { ok: true, store: lp.store, nick: lp.nick, due: lp.due };
  } else if (q.closed) {
    // 모집 명단 채우기(fill_list.py): 신청이 가게당 마감 인원(「마감 관리」 B3) 이상인 가게ID만 돌려준다
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var cap = Number(ss.getSheetByName('마감 관리') ? ss.getSheetByName('마감 관리').getRange('B3').getValue() : 3) || 3;
    var ap = ss.getSheetByName('신청'), cnt = {};
    if (ap && ap.getLastRow() > 1) ap.getRange(2, 7, ap.getLastRow() - 1, 1).getValues().forEach(function (r) { var k = String(r[0]); if (k) cnt[k] = (cnt[k] || 0) + 1; });
    out = { ok: true, cap: cap, sids: Object.keys(cnt).filter(function (k) { return cnt[k] >= cap; }) };
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
  if (d.type === 'print_list' || d.type === 'print_mark') return ContentService.createTextOutput(JSON.stringify(printOps(d))).setMimeType(ContentService.MimeType.JSON);
  if (!d.c && d.code) d.c = d.code;   // 10/23 점주 페이지는 code로 보냄
  if (d.store) d.store = String(d.store).replace(/[☎☏✆]|\uD83D[\uDCDE\uDCF1\uDCF2]/g, '').replace(/\s+/g, ' ').trim(); // 매장명의 ☎ 같은 전화 기호 제거
  var lp = d.c ? letter(d.c) : null;
  if (lp) { d.t = lp.t; d.nick = lp.nick; d.store = lp.store; d.sid = lp.sid; d.uid = d.uid || lp.uid; } // 점주 기록은 편지코드로 손님 · 매장을 시트 값으로 잇는다
  var p = target(d.t) || targetByUid(d.uid);
  // 링크에 값이 있으면 링크 값을, 없으면 「모집대상」 값을 쓴다
  if (p) { d.t = d.t || p.t; d.uid = d.uid || p.uid; d.sid = d.sid || p.sid; d.g = d.g || p.g; d.src = d.src || p.src; d.store = d.store || p.store; }
  var res = { ok: true };
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    if (d.type === 'scan') { addScan(d); markCol(p, QR_MARK_COL); }
    else if (d.type === 'inquiry' || d.type === 'contact_click') { addInquiry(d); markCol(p, INQ_MARK_COL); }
    else if (d.type === 'letter_view') { addLetterView(d); markCol(p, VIEW_MARK_COL); }
    else if (d.type === 'delivered') { addDelivered(d); markCol(p, DELIV_MARK_COL); }
    else if (d.type === 'visit') { addVisit(d); mark(p, 1); }
    else if (d.type === 'step') { updateVisit(d, '신청화면', FORM_AT_COL); mark(p, 2); }
    else {
      var st = status_(d.sid || '', d.grp || '', d.store || '', d.uid || '');
      // 같은 방문에서 신청을 두 번 누름(편지코드 = 방문ID가 이미 있음): 회원ID가 없는 접속도 줄을 늘리지 않음
      if (d.vid && sheet('신청', APPLY_HEAD).getRange('A:A').createTextFinder(String(d.vid)).matchEntireCell(true).findNext()) st.dup = true;
      if (st.dup) res = { ok: true, dup: true };                 // 같은 손님이 같은 가게에 다시 누름: 줄을 늘리지 않음
      else if (st.closed) res = { ok: false, reason: st.reason }; // 마감
      else {
        if (!d.vid) d.vid = ('L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).toUpperCase();
        addApply(d); addLetter(d); updateVisit(d, '신청완료', APPLY_AT_COL); mark(p, 3);
      }
    }
  } finally {
    lock.releaseLock();
  }
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
  if (grp && QUOTA[grp] && grpN >= QUOTA[grp]) { o.closed = true; o.reason = 'quota'; }
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
function addLetterView(d) {
  var sh = sheet('열람', VIEW_HEAD);
  sh.getRange(sh.getLastRow() + 1, 1, 1, VIEW_HEAD.length).setValues([[
    at(d.ts), txt(d.t), txt(d.uid), txt(d.sid), txt(d.store), txt(d.due),
    d.recorded ? 'Y' : 'N', txt(d.device), txt(d.app), txt(d.ref)
  ]]);
}

// 「내 편지」의 「편지 건넸어요」 기록. 14일 안 전달 판정은 기록시각 기준(건넨 날은 손님이 고른 참고값)
function addDelivered(d) {
  var sh = sheet('전달', DELIV_HEAD);
  var applyNo = '';
  // 열쇠(F)로 먼저, 없으면 회원ID(E)로 신청번호를 찾는다 (모집대상 밖 회원ID로 신청한 경우)
  [['F:F', d.t], ['E:E', d.uid]].forEach(function (k) {
    if (applyNo || !k[1]) return;
    var hits = sheet('신청', APPLY_HEAD).getRange(k[0]).createTextFinder(String(k[1])).matchEntireCell(true).findAll();
    if (hits.length) applyNo = sheet('신청', APPLY_HEAD).getRange(hits[hits.length - 1].getRow(), 1).getValue();
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

// 신청 한 건 = 편지 한 통. 도착일(I)을 적으면 기한과 링크가 수식으로 채워진다
function addLetter(d) {
  var sh = sheet('편지', LETTER_HEAD);
  var r = sh.getLastRow() + 1, I = 'I' + r, J = 'J' + r;
  sh.getRange(r, 1, 1, LETTER_HEAD.length).setValues([[
    txt(d.vid), at(d.ts), txt(d.t), txt(d.sid), txt(d.store), txt(d.nick), '', '', '',
    '=IF(' + I + '="","",' + I + '+14)',   // 손님 전달 기한: 도착 + 14일
    '=IF(' + I + '="","",' + I + '+21)',   // 사장님 문의 기한: 도착 + 21일 (미정 · 바뀌면 이 숫자만)
    '',
    '=IF(P' + r + '="","","' + MYLETTER_URL + '?uid="&ENCODEURL(P' + r + ')&"&store="&ENCODEURL(E' + r + ')&"&nick="&ENCODEURL(F' + r + ')&IF(' + J + '="","","&due="&TEXT(' + J + ',"yyyy-mm-dd"))&IF(G' + r + '="","","&sent="&TEXT(G' + r + ',"yyyy-mm-dd")))',
    '=IF(OR(A' + r + '="",S' + r + '="QR 없음"),"","' + OWNER_URL + '?c="&A' + r + ')',   // QR 없음 가게는 링크 없음
    '', txt(d.uid), txt(d.grp), armLetter(d), armQr(d)
  ]]);
}

// 점주 페이지를 열 때마다 한 줄. 손님이 건넨 날을 알려주기 전에 열린 건지도 같이 남긴다
function addScan(d) {
  var sh = sheet('QR 접속', SCAN_HEAD);
  var dsh = sheet('전달', DELIV_HEAD);
  var hit = function (col, v) { return v && dsh.getRange(col).createTextFinder(String(v)).matchEntireCell(true).findNext(); };
  var delivered = hit('B:B', d.t) || hit('C:C', d.uid) ? 'Y' : 'N'; // 열쇠 또는 회원ID로 찾음
  sh.getRange(sh.getLastRow() + 1, 1, 1, SCAN_HEAD.length).setValues([[
    at(d.ts), txt(d.c), txt(d.t), txt(d.sid), txt(d.store), delivered, txt(d.device), txt(d.app), txt(d.ref)
  ]]);
}

// 전화 안내 신청. 같은 매장의 첫 문의면 「매장 첫 문의」 Y (10,000원 쿠폰 귀속 후보)
function addInquiry(d) {
  var sh = sheet('문의', INQ_HEAD);
  var first = d.sid && sh.getRange('D:D').createTextFinder(String(d.sid)).matchEntireCell(true).findNext() ? 'N' : 'Y';
  var slack = d.type === 'inquiry' ? notifySlack(d, first) : '';
  sh.getRange(sh.getLastRow() + 1, 1, 1, INQ_HEAD.length).setValues([[
    at(d.ts), txt(d.c), txt(d.t), txt(d.sid), txt(d.store), txt(d.nick), txt(d.tel), txt(d.time), first,
    txt(d.device), txt(d.ref), d.type === 'contact_click' ? 'biz 이동' : '접수', '', '', '', '', d.edit ? 'Y' : '', slack
  ]]);
}

// 링크 값 → 시트에 적을 글자 (편지 종류 · QR 여부)
function armLetter(d) { return d.la ? '편지 ' + d.la : ''; }
function armQr(d) { return d.qr === '1' ? 'QR 있음' : d.qr === '0' ? 'QR 없음' : ''; }

// 점주 전화 안내 신청 → 슬랙 #편지_qr_문의 알림 (수신 웹후크). 주소는 공개 저장소에 올리지 않도록 코드에 넣지 않고
// 스크립트 속성 「SLACK_WEBHOOK」, 없으면 시트의 숨김 탭 「설정」 B1에서 읽는다. 둘 다 비어 있으면 보내지 않음
function slackUrl() {
  var url = PropertiesService.getScriptProperties().getProperty('SLACK_WEBHOOK');
  if (url) return url;
  var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('설정');
  return sh ? String(sh.getRange('B1').getValue()).trim() : '';
}
// 담는 정보: 매장 · 연락처 · 통화 희망 · 편지(시험 · 편지 종류/QR) · 모집 소구 · 경로 · 차수 · 편지를 전한 손님과 전달 기록
var G_LABEL = { '1': '내 혜택', '2': '특별 대우', '3': '역할의 재미', '4': '사장님 도움' };
var GRP_LABEL = { s: '소구 실험', q: 'QR 비교' };
var SRC_LABEL = { call: '전화 주문 손님', intro: '앱 주문 요청 손님' };

function ymd(v, withTime) {
  return v instanceof Date ? Utilities.formatDate(v, 'Asia/Seoul', withTime ? 'M/d HH:mm' : 'M/d') : String(v || '');
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
  var D = find('전달', 'C', o.uid || uid, DELIV_HEAD.length);
  if (D) { o.delivAt = ymd(D[0], true); o.when = D[6]; o.whom = D[7]; }
  return o;
}

function notifySlack(d, first) {
  var url = slackUrl();
  if (!url) return '';
  var i = letterInfo(d.c, d.uid);
  var tel = String(d.tel || '').replace(/\D/g, '').replace(/^(\d{3})(\d{3,4})(\d{4})$/, '$1-$2-$3');
  var exp = (GRP_LABEL[i.grp] || i.grp || '-') + (i.letter ? ' · ' + i.letter : '') + (i.qr ? ' · ' + i.qr : '');
  var store = d.store || '-';
  var f = function (label, value) { return { type: 'mrkdwn', text: '*' + label + '*\n' + (value || '-') }; };
  var deliv = i.delivAt ? '✅ ' + i.delivAt + ' 기록\n건넨 날 ' + (i.when || '-') + ' · 받은 분 ' + (i.whom || '-') : '⚠️ 아직 기록 없음';
  // 슬랙 카드: 제목 → 연락할 정보 → 편지 · 모집 정보 → 편지 전한 손님 → 코드. 한 칸에 한 값씩 두 칸 배치
  var blocks = [
    { type: 'header', text: { type: 'plain_text', text: '📮 편지 QR 문의' + (d.edit ? ' (연락처 수정)' : '') + ' · ' + store } },
    { type: 'section', fields: [f('📞 연락처', tel), f('🕑 통화 희망', d.time), f('🏪 매장', store + '\n' + (i.sid || d.sid || '-')), f('🆕 매장 첫 문의', first === 'Y' ? '예' : '아니요 (같은 매장 문의 있음)')] },
    { type: 'divider' },
    { type: 'section', fields: [f('✉️ 받은 편지', exp), f('📣 모집 소구', i.g ? i.g + ' · ' + (G_LABEL[i.g] || '') : '-'), f('🧭 손님 경로', SRC_LABEL[i.src] || i.src), f('🔢 차수', i.wave ? i.wave + '차' : '-')] },
    { type: 'divider' },
    { type: 'section', fields: [f('🙋 편지 전한 손님', (i.nick || d.nick || '-') + '\n회원ID ' + (i.uid || '-')), f('🤝 전달 기록', deliv)] },
    { type: 'context', elements: [{ type: 'mrkdwn', text: '편지코드 `' + (d.c || '-') + '` · 도착 ' + (i.arrive || '-') + ' · utm letter / owner_qr / ' + (d.c || '-') }] }
  ];
  var fallback = '📮 편지 QR 문의 · ' + store + ' · ' + (tel || '-') + ' · ' + (d.time || '-');   // 알림 미리보기 문구
  try {
    var r = UrlFetchApp.fetch(url, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ text: fallback, blocks: blocks }), muteHttpExceptions: true });
    return r.getResponseCode() === 200 ? 'Y' : '실패 ' + r.getResponseCode();
  } catch (err) { return '실패'; }
}

// 편집기에서 한 번 실행: 외부 요청 권한 승인 + 웹후크 시험 메시지
function testSlack() {
  Logger.log(notifySlack({ store: '테스트매장', tel: '01000000000', time: '오전', c: 'TEST-0001', nick: '테스트', uid: 'TEST' }, 'Y'));
}

// 편지 인쇄 도구(print_letters.py) 전용. 주소가 오가므로 시트 숨김 탭 「설정」 B2 비밀번호가 맞을 때만 응답
//   print_list : 아직 인쇄하지 않은(인쇄일 빈칸) 편지 + 신청 탭의 받는 분 · 주소
//   print_mark : 편지코드 목록에 인쇄 회차 · 인쇄일을 적음
function printOps(d) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var token = String(ss.getSheetByName('설정').getRange('B2').getValue());
  if (!token || d.token !== token) return { ok: false, reason: 'token' };
  var L = ss.getSheetByName('편지');
  var n = L.getLastRow() - 1;
  if (n < 1) return { ok: true, rows: [], round: 1 };
  var lv = L.getRange(2, 1, n, LETTER_HEAD.length).getValues();
  if (d.type === 'print_mark') {
    var want = {}; (d.codes || []).forEach(function (c) { want[c] = true; });
    var today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'), cnt = 0;
    lv.forEach(function (r, i) {
      if (want[String(r[0])]) { L.getRange(i + 2, PRINT_ROUND_COL, 1, 2).setValues([[d.round, today]]); cnt++; }
    });
    return { ok: true, marked: cnt };
  }
  var addr = {};
  var A = ss.getSheetByName('신청');
  if (A.getLastRow() > 1) A.getRange(2, 1, A.getLastRow() - 1, 18).getValues().forEach(function (r) {
    addr[String(r[0])] = { name: String(r[14]), zip: String(r[15]), addr: String(r[16]), addr2: String(r[17]) };
  });
  var round = 0, rows = [];
  lv.forEach(function (r) {
    round = Math.max(round, Number(r[PRINT_ROUND_COL - 1]) || 0);
    if (!r[0] || r[PRINT_DATE_COL - 1]) return;
    var a = addr[String(r[0])] || {};
    rows.push({ code: String(r[0]), store: String(r[4]), nick: String(r[5]), grp: String(r[16]), letter: String(r[17]), qr: String(r[18]),
      url: String(r[13]), name: a.name || '', zip: a.zip || '', addr: a.addr || '', addr2: a.addr2 || '' });
  });
  return { ok: true, rows: rows, round: round + 1 };
}

// 손님이 입력한 값은 글자로 고정한다 (우편번호 앞자리 0 유지, '='로 시작하는 값이 수식으로 바뀌지 않게)
function txt(v) { return v === undefined || v === null || v === '' ? '' : "'" + v; }
function at(iso) { return iso ? new Date(iso) : ''; }

function sheet(name, head) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName(name);
  if (!sh) { sh = ss.insertSheet(name); sh.appendRow(head); sh.setFrozenRows(1); }
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
    txt(d.device), txt(d.app), '랜딩', '', '', txt(d.ref), txt(d.grp), txt(d.w)
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
