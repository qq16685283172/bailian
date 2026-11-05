import { describe, expect, it } from 'vitest';
import { getStudents } from '../server/admin.js';

function makeStore() {
  return {
    students: {
      1001: { jwcode: '1001', name: '张三', dept: '一部', shop: '店A', totalPoints: 30 },
      1002: { jwcode: '1002', name: '李四', dept: '二部', shop: '店B', totalPoints: 10 },
      1003: { jwcode: '1003', name: '王五', dept: '一部', shop: '', totalPoints: 20 },
      1004: { jwcode: '1004', name: '赵六', dept: '二部', shop: '店A', totalPoints: 40 },
    },
    dailyPoints: {},
    lives: {},
    attendance: {},
  };
}

const ids = (result) => result.list.map((row) => row.id);

describe('getStudents 排序', () => {
  it('默认按累计积分降序', () => {
    const result = getStudents(makeStore(), {});
    expect(ids(result)).toEqual(['1004', '1001', '1003', '1002']);
  });

  it('按积分升序', () => {
    const result = getStudents(makeStore(), { sort: 'score', dir: 'asc' });
    expect(ids(result)).toEqual(['1002', '1003', '1001', '1004']);
  });

  it('姓名升序与降序互为逆序', () => {
    const asc = getStudents(makeStore(), { sort: 'name', dir: 'asc' });
    const desc = getStudents(makeStore(), { sort: 'name', dir: 'desc' });
    expect(ids(asc)).toEqual([...ids(desc)].reverse());
  });

  it('积分并列时按精网号稳定排序', () => {
    const store = makeStore();
    store.students[1005] = { jwcode: '1005', name: '并列', dept: '一部', totalPoints: 20 };
    const result = getStudents(store, { sort: 'score', dir: 'asc' });
    expect(result.list.filter((row) => row.score === 20).map((row) => row.id)).toEqual(['1003', '1005']);
  });

  it('非法排序字段回落到积分降序', () => {
    const result = getStudents(makeStore(), { sort: 'dropTable' });
    expect(ids(result)).toEqual(['1004', '1001', '1003', '1002']);
  });

  it('非法排序字段时方向参数仍然生效', () => {
    const result = getStudents(makeStore(), { sort: 'dropTable', dir: 'asc' });
    expect(ids(result)).toEqual(['1002', '1003', '1001', '1004']);
  });

  it('未知方向按降序处理', () => {
    const result = getStudents(makeStore(), { sort: 'score', dir: 'sideways' });
    expect(ids(result)).toEqual(['1004', '1001', '1003', '1002']);
  });
});

describe('getStudents 分页与筛选', () => {
  it('pageSize 上限 100、下限 10', () => {
    expect(getStudents(makeStore(), { pageSize: 1000 }).pageSize).toBe(100);
    expect(getStudents(makeStore(), { pageSize: 1 }).pageSize).toBe(10);
  });

  it('分页切片正确且返回总数', () => {
    const store = { students: {}, dailyPoints: {}, lives: {}, attendance: {} };
    for (let i = 1; i <= 12; i += 1) store.students[1000 + i] = { jwcode: String(1000 + i), name: `学员${i}`, dept: '一部', totalPoints: i };

    const first = getStudents(store, { page: 1, pageSize: 10 });
    expect(first.total).toBe(12);
    expect(first.totalPages).toBe(2);
    expect(first.list.length).toBe(10);

    const second = getStudents(store, { page: 2, pageSize: 10 });
    expect(second.list.length).toBe(2);
    expect(ids(second)).toEqual(['1002', '1001']); // 积分升序…此处为降序末两位
  });

  it('只返回当前页数据，all 保留全量', () => {
    const result = getStudents(makeStore(), { page: 1, pageSize: 10 });
    expect(result.list.length).toBe(4);
    expect(result.all.length).toBe(4);
  });

  it('按分部筛选', () => {
    const result = getStudents(makeStore(), { dept: '二部' });
    expect(result.total).toBe(2);
    expect(ids(result)).toEqual(['1004', '1002']);
  });

  it('按关键词搜索姓名、精网号与门店', () => {
    expect(getStudents(makeStore(), { query: '王五' }).total).toBe(1);
    expect(getStudents(makeStore(), { query: '1003' }).total).toBe(1);
    expect(getStudents(makeStore(), { query: '店a' }).total).toBe(2);
  });

  it('筛选后排序仍然生效', () => {
    const result = getStudents(makeStore(), { dept: '一部', sort: 'score', dir: 'asc' });
    expect(ids(result)).toEqual(['1003', '1001']);
  });
});
