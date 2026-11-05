import ExcelJS from 'exceljs';

const COLUMNS = [
  { header: '精网号', key: 'id', width: 14 },
  { header: '姓名', key: 'name', width: 14 },
  { header: '分部', key: 'dept', width: 20 },
  { header: '门店', key: 'shop', width: 20 },
  { header: '等级', key: 'level', width: 12 },
  { header: '累计积分', key: 'score', width: 11, numeric: true },
  { header: '今日积分', key: 'today', width: 11, numeric: true },
  { header: '状态', key: 'statusText', width: 12 },
  { header: '最近学习得分', key: 'lastLearning', width: 15 },
];

const HEADER_FILL = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F1E8' } };
const HEADER_FONT = { bold: true, color: { argb: 'FF6B5B4B' } };
const THIN_BORDER = { bottom: { style: 'thin', color: { argb: 'FFE6DED3' } } };
const NUMBER_FORMAT = '#,##0.##';

const statusText = (status) => (status === 'active' ? '近7天活跃' : '待跟进');

function styleHeaderRow(row) {
  row.height = 24;
  row.eachCell((cell) => {
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.border = THIN_BORDER;
    cell.alignment = { vertical: 'middle', horizontal: 'left' };
  });
}

function summarize(rows) {
  const byDept = new Map();
  for (const row of rows) {
    const dept = row.dept || '未同步分部';
    const item = byDept.get(dept) || { dept, total: 0, active: 0, risk: 0, score: 0 };
    item.total += 1;
    item.score += Number(row.score) || 0;
    if (row.status === 'active') item.active += 1;
    else item.risk += 1;
    byDept.set(dept, item);
  }
  const departments = [...byDept.values()].sort((a, b) => b.total - a.total || a.dept.localeCompare(b.dept, 'zh-CN'));
  const total = rows.length;
  const active = rows.filter((row) => row.status === 'active').length;
  const scoreSum = rows.reduce((sum, row) => sum + (Number(row.score) || 0), 0);
  return {
    departments,
    total,
    active,
    risk: total - active,
    scoreSum,
    average: total ? Math.round((scoreSum / total) * 100) / 100 : 0,
    maxScore: rows.reduce((max, row) => Math.max(max, Number(row.score) || 0), 0),
  };
}

/**
 * 生成面向报告的学员工作簿：明细 + 分部汇总。
 * @param {Array} rows 学员行（getStudents 返回的 all）
 * @param {{ filters?: string, generatedAt?: string }} meta
 * @returns {Promise<Buffer>}
 */
export async function buildStudentWorkbook(rows = [], meta = {}) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '百炼计划';
  workbook.created = new Date();

  // ---------------- 明细 ----------------
  const sheet = workbook.addWorksheet('学员名单', {
    views: [{ state: 'frozen', ySplit: 1 }],
    properties: { defaultRowHeight: 18 },
  });
  sheet.columns = COLUMNS;
  styleHeaderRow(sheet.getRow(1));

  for (const row of rows) {
    const added = sheet.addRow({
      id: row.id,
      name: row.name,
      dept: row.dept,
      shop: row.shop || '',
      level: row.level,
      score: Number(row.score) || 0,
      today: Number(row.today) || 0,
      statusText: statusText(row.status),
      lastLearning: row.lastLearning || '无记录',
    });
    added.getCell('score').numFmt = NUMBER_FORMAT;
    added.getCell('today').numFmt = NUMBER_FORMAT;
    if (row.status !== 'active') added.getCell('statusText').font = { color: { argb: 'FFA9701F' } };
  }

  if (rows.length) {
    sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: COLUMNS.length } };
  }

  // ---------------- 汇总 ----------------
  const stats = summarize(rows);
  const summary = workbook.addWorksheet('分部汇总', { properties: { defaultRowHeight: 18 } });

  summary.mergeCells('A1:G1');
  const title = summary.getCell('A1');
  title.value = '百炼计划 · 学员分部汇总';
  title.font = { size: 15, bold: true, color: { argb: 'FF8E252A' } };
  summary.getRow(1).height = 30;

  summary.mergeCells('A2:G2');
  const metaLine = summary.getCell('A2');
  metaLine.value = [
    `导出时间：${meta.generatedAt || new Date().toLocaleString('zh-CN', { hour12: false })}`,
    `范围：${meta.filters || '全部学员'}`,
  ].join('    ');
  metaLine.font = { size: 10, color: { argb: 'FF7A7167' } };

  summary.mergeCells('A3:G3');
  const overview = summary.getCell('A3');
  overview.value = `共 ${stats.total} 人 · 近7天活跃 ${stats.active} 人 · 待跟进 ${stats.risk} 人 · 人均累计 ${stats.average} 分 · 最高 ${stats.maxScore} 分`;
  overview.font = { size: 10, bold: true, color: { argb: 'FF5F5449' } };

  const header = summary.getRow(5);
  header.values = ['分部', '学员数', '近7天活跃', '待跟进', '活跃率', '人均累计积分', '累计积分合计'];
  styleHeaderRow(header);

  const monthWidths = [24, 10, 12, 10, 10, 14, 15];
  monthWidths.forEach((width, index) => { summary.getColumn(index + 1).width = width; });

  stats.departments.forEach((item, index) => {
    const row = summary.addRow([
      item.dept,
      item.total,
      item.active,
      item.risk,
      item.total ? Math.round((item.active / item.total) * 1000) / 10 : 0,
      item.total ? Math.round((item.score / item.total) * 100) / 100 : 0,
      item.score,
    ]);
    row.getCell(5).numFmt = '0.0"%"';
    row.getCell(6).numFmt = NUMBER_FORMAT;
    row.getCell(7).numFmt = NUMBER_FORMAT;
    if (index % 2 === 1) row.eachCell((cell) => { cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFBFAF7' } }; });
  });

  const totalRow = summary.addRow([
    '合计',
    stats.total,
    stats.active,
    stats.risk,
    stats.total ? Math.round((stats.active / stats.total) * 1000) / 10 : 0,
    stats.average,
    stats.scoreSum,
  ]);
  totalRow.font = { bold: true };
  totalRow.getCell(5).numFmt = '0.0"%"';
  totalRow.getCell(6).numFmt = NUMBER_FORMAT;
  totalRow.getCell(7).numFmt = NUMBER_FORMAT;
  totalRow.eachCell((cell) => { cell.border = { top: { style: 'thin', color: { argb: 'FFD8CBB8' } } }; });

  return Buffer.from(await workbook.xlsx.writeBuffer());
}
