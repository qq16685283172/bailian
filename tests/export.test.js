import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { buildStudentWorkbook } from '../server/export.js';

const rows = [
  { id: '1001', name: '张三', dept: '一部', shop: '店A', level: '青铜', score: 30, today: 2, status: 'active', lastLearning: '2026-11-01' },
  { id: '1002', name: '李四', dept: '二部', shop: '店B', level: '白银', score: 10, today: 0, status: 'risk', lastLearning: null },
  { id: '1003', name: '王五', dept: '一部', shop: '', level: '青铜', score: 20, today: 1, status: 'active', lastLearning: '2026-10-30' },
];

async function load(rowsData = rows, meta = {}) {
  const buffer = await buildStudentWorkbook(rowsData, meta);
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  return { buffer, workbook };
}

describe('学员报告工作簿', () => {
  it('生成两个工作表：明细 + 汇总', async () => {
    const { workbook, buffer } = await load();
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual(['学员名单', '分部汇总']);
    expect(buffer.length).toBeGreaterThan(4000);
  });

  it('明细表包含表头与全部数据行', async () => {
    const { workbook } = await load();
    const sheet = workbook.getWorksheet('学员名单');
    expect(sheet.rowCount).toBe(4);
    expect(['精网号', '姓名', '分部', '门店', '等级', '累计积分', '今日积分', '状态', '最近学习得分'])
      .toEqual(sheet.getRow(1).values.slice(1));
    expect(sheet.getRow(2).getCell(1).value).toBe('1001');
    expect(sheet.getRow(2).getCell(6).value).toBe(30);
  });

  it('状态与空字段转成可读文本', async () => {
    const { workbook } = await load();
    const sheet = workbook.getWorksheet('学员名单');
    expect(sheet.getRow(2).getCell(8).value).toBe('近7天活跃');
    expect(sheet.getRow(3).getCell(8).value).toBe('待跟进');
    expect(sheet.getRow(3).getCell(9).value).toBe('无记录');
    expect(sheet.getRow(3).getCell(4).value).toBe('店B');
  });

  it('开启自动筛选并冻结首行', async () => {
    const { workbook } = await load();
    const sheet = workbook.getWorksheet('学员名单');
    expect(sheet.autoFilter).toBeTruthy();
    expect(sheet.views[0].state).toBe('frozen');
    expect(sheet.views[0].ySplit).toBe(1);
  });

  it('汇总表按分部聚合，并带合计行', async () => {
    const { workbook } = await load();
    const sheet = workbook.getWorksheet('分部汇总');
    expect(sheet.getCell('A1').value).toBe('百炼计划 · 学员分部汇总');
    expect(sheet.getRow(5).values.slice(1)).toEqual(['分部', '学员数', '近7天活跃', '待跟进', '活跃率', '人均累计积分', '累计积分合计']);

    const one = sheet.getRow(6);
    const two = sheet.getRow(7);
    expect(one.getCell(1).value).toBe('一部');
    expect(one.getCell(2).value).toBe(2);
    expect(one.getCell(3).value).toBe(2);
    expect(one.getCell(5).value).toBe(100);
    expect(one.getCell(6).value).toBe(25);
    expect(two.getCell(1).value).toBe('二部');
    expect(two.getCell(5).value).toBe(0);
  });

  it('合计行与整体统计一致', async () => {
    const { workbook } = await load();
    const sheet = workbook.getWorksheet('分部汇总');
    const last = sheet.getRow(sheet.rowCount);
    expect(last.getCell(1).value).toBe('合计');
    expect(last.getCell(2).value).toBe(3);
    expect(last.getCell(3).value).toBe(2);
    expect(last.getCell(4).value).toBe(1);
    expect(last.getCell(7).value).toBe(60);
    expect(String(sheet.getCell('A3').value)).toContain('共 3 人');
  });

  it('空名单也能生成文件，不抛错', async () => {
    const { workbook } = await load([], { filters: '分部=空' });
    expect(workbook.getWorksheet('学员名单').rowCount).toBe(1);
    expect(workbook.getWorksheet('分部汇总').getRow(6).getCell(1).value).toBe('合计');
  });

  it('筛选说明写入汇总表标题下方', async () => {
    const { workbook } = await load(rows, { filters: '分部=一部；状态=近7天活跃', generatedAt: '2026-11-05 15:00:00' });
    const text = String(workbook.getWorksheet('分部汇总').getCell('A2').value);
    expect(text).toContain('2026-11-05 15:00:00');
    expect(text).toContain('分部=一部');
  });
});
