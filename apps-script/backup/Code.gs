// 편지 린테스트 결과 시트 백업 (2026-10-28)
// 1시간마다 결과 시트의 기록 탭을 값 그대로 이 파일의 같은 이름 탭에 옮겨 적는다(수식 없이 값만).
// 기록 탭은 줄이 늘기만 하므로, 원본 줄 수가 지난 백업보다 줄었으면 덮어쓰지 않고 이전 백업을 지킨다(실수로 지운 경우 대비).
// 처음 한 번: 메뉴 「백업」 → 「자동 백업 켜기」(권한 승인 + 1시간마다 실행 + 바로 한 번 백업)
var SOURCE_ID = '1A1V5nJ1wbsjSIQ8kHF0Gji_mL6tSaCFQgtFskOtVAms';   // 패스오더 편지 신청 (선테스트)
var TABS = ['요약', '신청', '편지', '방문', '전달', '열람', 'QR 접속', '문의', '마감 관리'];
var GROW_ONLY = { '신청': 1, '편지': 1, '방문': 1, '전달': 1, '열람': 1, 'QR 접속': 1, '문의': 1 };   // 줄이 줄면 덮어쓰지 않는 탭
var LOG = '백업 기록', LOG_HEAD = ['백업 시각', '탭', '원본 줄 수', '백업 줄 수', '결과'];

function onOpen() {
  SpreadsheetApp.getUi().createMenu('백업').addItem('지금 백업', 'backupNow').addItem('자동 백업 켜기 (1시간마다)', 'installBackup').addToUi();
}

function installBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'backupNow') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('backupNow').timeBased().everyHours(1).create();
  backupNow();
}

function backupNow() {
  var src = SpreadsheetApp.openById(SOURCE_ID), dst = SpreadsheetApp.getActiveSpreadsheet();
  var now = new Date(), log = [];
  TABS.forEach(function (name) {
    var s = src.getSheetByName(name);
    if (!s) { log.push([now, name, '', '', '원본에 탭 없음']); return; }
    var v = s.getDataRange().getValues();
    var d = dst.getSheetByName(name) || dst.insertSheet(name);
    var before = d.getLastRow();
    if (GROW_ONLY[name] && v.length < before) { log.push([now, name, v.length, before, '원본 줄이 줄어 덮어쓰지 않음(이전 백업 유지)']); return; }
    d.clearContents();
    if (d.getMaxColumns() < v[0].length) d.insertColumnsAfter(d.getMaxColumns(), v[0].length - d.getMaxColumns());
    if (d.getMaxRows() < v.length) d.insertRowsAfter(d.getMaxRows(), v.length - d.getMaxRows());
    d.getRange(1, 1, v.length, v[0].length).setValues(v);
    d.setFrozenRows(1);
    log.push([now, name, v.length, v.length, '완료']);
  });
  var lg = dst.getSheetByName(LOG) || dst.insertSheet(LOG, 0);
  if (lg.getLastRow() === 0) { lg.appendRow(LOG_HEAD); lg.setFrozenRows(1); }
  lg.getRange(lg.getLastRow() + 1, 1, log.length, LOG_HEAD.length).setValues(log);
  var first = dst.getSheetByName('시트1') || dst.getSheetByName('Sheet1');
  if (first && dst.getSheets().length > 1) dst.deleteSheet(first);
}
