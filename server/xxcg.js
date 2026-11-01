const API_ORIGIN = 'https://api.xxcg.com';

function dateText(date) {
  const parts = new Intl.DateTimeFormat('zh-CN', { timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const get = type => parts.find(p => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export class XxcgClient {
  constructor(listUrl) {
    const url = new URL(listUrl);
    this.token = url.searchParams.get('token');
    this.apiOrigin = url.hostname === 'toujiao.hlquant.com' ? 'https://tjapi.hlquant.com' : API_ORIGIN;
    this.channelId = url.searchParams.get('pd_id') || '150';
    if (!this.token) throw new Error('LIVE_LIST_URL 中缺少 token');
  }

  async request(path, params = {}, attempt = 1) {
    const url = new URL(`${this.apiOrigin}${path}`);
    Object.entries({ ...params, token: this.token }).forEach(([key, value]) => url.searchParams.set(key, value ?? ''));
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          accept: 'application/json, text/plain, */*', token: this.token, client: 'pc', app_from: 'cn',
          'content-type': 'application/x-www-form-urlencoded',
        },
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new Error(`接口 HTTP ${response.status}`);
      const result = await response.json();
      if (result.code !== 200) throw new Error(result.msg || `接口返回 ${result.code}`);
      return result.data;
    } catch (error) {
      if (attempt >= 3) throw error;
      await new Promise(resolve => setTimeout(resolve, attempt * 800));
      return this.request(path, params, attempt + 1);
    }
  }

  async paginate(path, params = {}, pageSize = 200) {
    const output = [];
    let page = 1, total = Infinity;
    while (output.length < total && page <= 500) {
      const data = await this.request(path, { ...params, page, pageSize, page_size: pageSize });
      const rows = Array.isArray(data) ? data : data?.list || data?.data || [];
      total = Array.isArray(data) ? rows.length : Number(data?.total ?? rows.length);
      output.push(...rows);
      if (!rows.length || rows.length < pageSize && output.length >= total) break;
      page += 1;
      await new Promise(resolve => setTimeout(resolve, 80));
    }
    if (page > 500) throw new Error(`${path} 超过安全分页上限`);
    return output;
  }

  async listLives(days = 2) {
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000);
    const data = await this.paginate('/livego/admin/pindao/live/list', {
      channel_id: this.channelId, startTime: `${dateText(start)} 00:00:00`, endTime: `${dateText(new Date(now.getTime() + 86400000))} 23:59:59`,
      live_type: '', duration: '', viewer_count: '', people_num: '', zan_num: '', club_type: 0,
    }, 100);
    const threshold = dateText(start);
    return data.filter(item => item.state === 2 && item.start_time?.slice(0, 10) >= threshold);
  }

  async listClasses() {
    const data = await this.paginate('/im/admin/group/list', { name: '', teacher: '', creator: '', label: '', class_label: '', study_state: '', wy: '', type: '', activity: '' }, 20);
    return data.map(item => ({ id: String(item.id), name: item.name, department: item.deptName || '', shop: item.shopName || '', manager: item.manager_name || item.manager || '', members: Number(item.count || item.all_count || item.member_count || 0), state: item.state, createdAt: item.created_at }));
  }

  async listClassLives(classId, days = 7) {
    const now = new Date();
    const start = new Date(now.getTime() - days * 86400000);
    const data = await this.paginate('/live/api/admin/pindao/classLive/list', { class_id: classId, live_type: '' }, 100);
    const threshold = dateText(start);
    return data.filter(item => item.state === 2 && item.start_time?.slice(0, 10) >= threshold).map(item => ({ ...item, class_id: Number(classId) }));
  }

  getWatchRecords(liveId) {
    return this.paginate('/livego/admin/watch/records', { live_id: liveId, dept_id: '', shop_id: '', product: '', client: '', order: '', user: '', order_field: '', order_sort: '', user_role: '' });
  }

  getGifts(liveId) {
    return this.paginate('/livego/admin/giveGift/records', { live_id: liveId, dept_id: '', shop_id: '', user: '', gift_name: '领航卡', user_type: '', gold_type: '' });
  }

  getComments(roomId) {
    return this.paginate('/im/api/data/chat/history', { room_id: roomId, block_status: 0 });
  }
}
