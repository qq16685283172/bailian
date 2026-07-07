import csv, json, os, re
from collections import defaultdict

# ===== 数据源（同 calc_honors.py） =====
BASE = r"C:\Users\松元涛\Desktop\总文件夹\数据统计\视频数据"
SOURCES = {
    ("财经易眼", "cjyy"): os.path.join(BASE, "财经易眼"),
    ("易学久会_投教", "yxjh"): os.path.join(BASE, "易学久会", "投教"),
    ("易学久会_精网", "yxjh"): os.path.join(BASE, "易学久会", "精网"),
}

MIN_DATE = "2026-06-24"
IS_BONUS_DATE = "2026-06-24"
DAILY_CAP_NORMAL = 3
DAILY_CAP_BONUS = 9
ENCODINGS = ['utf-8-sig', 'gbk']


def parse_watch_minutes(s):
    """Parse '30m', '1h', '1h1m', '2h30m' etc. to integer minutes."""
    if not s:
        return 0
    s = str(s).strip().lower().replace(' ', '')
    total = 0
    h_match = re.search(r'(\d+)h', s)
    m_match = re.search(r'(\d+)m', s)
    if h_match:
        total += int(h_match.group(1)) * 60
    if m_match:
        total += int(m_match.group(1))
    return total


# ===== 第一步：读取 CSV，生成 records =====
# user_records[精网号] = {name, records: [{date, source, points}]}
user_records = defaultdict(lambda: {"name": "", "records": []})

for (source_label, _), source_dir in SOURCES.items():
    # 确定 source 名称映射
    if "财经" in source_label:
        source_tag = "财经壹眼"
    elif "投教" in source_label:
        source_tag = "易学久会投教"
    else:
        source_tag = "易学久会精网"

    # 第一遍：收集用户姓名
    for root, dirs, files in os.walk(source_dir):
        for fname in files:
            if not fname.endswith(".csv"):
                continue
            fpath = os.path.join(root, fname)
            date_match = re.match(r'(\d+)观看记录\.csv', fname)
            if not date_match:
                continue
            day = int(date_match.group(1))
            month = 7 if "7月" in fpath else 6
            date_str = f"2026-{month:02d}-{day:02d}"
            if date_str < MIN_DATE:
                continue

            reader = None
            for enc in ENCODINGS:
                try:
                    f = open(fpath, 'r', encoding=enc)
                    reader = csv.DictReader(f)
                    next(reader)
                    break
                except (UnicodeDecodeError, StopIteration):
                    if 'f' in locals():
                        f.close()
                    reader = None
            if reader is None:
                continue

            f.close()
            f = open(fpath, 'r', encoding=enc)
            reader = csv.DictReader(f)
            for row in reader:
                jwh = row.get("精网号", "").strip()
                if not jwh:
                    continue
                ur = user_records[jwh]
                if not ur["name"]:
                    ur["name"] = row.get("姓名", "").strip()
            f.close()

    # 第二遍：聚合用户级别的 daily stats
    # daily_data[精网号][date_str] = {watch_minutes, comments, has_signin}
    daily_data = defaultdict(
        lambda: defaultdict(
            lambda: {"watch_minutes": 0, "comments": 0, "has_signin": False}
        )
    )
    for root, dirs, files in os.walk(source_dir):
        for fname in files:
            if not fname.endswith(".csv"):
                continue
            date_match = re.match(r'(\d+)观看记录\.csv', fname)
            if not date_match:
                continue
            day = int(date_match.group(1))
            month = 7 if "7月" in root else 6
            date_str = f"2026-{month:02d}-{day:02d}"
            if date_str < MIN_DATE:
                continue
            fpath = os.path.join(root, fname)

            reader = None
            for enc in ENCODINGS:
                try:
                    f = open(fpath, 'r', encoding=enc)
                    reader = csv.DictReader(f)
                    next(reader)
                    break
                except (UnicodeDecodeError, StopIteration):
                    if 'f' in locals():
                        f.close()
                    reader = None
            if reader is None:
                continue
            f.close()

            f = open(fpath, 'r', encoding=enc)
            reader = csv.DictReader(f)
            for row in reader:
                jwh = row.get("精网号", "").strip()
                if not jwh:
                    continue
                dd = daily_data[jwh][date_str]
                entry_time = row.get("进入时间", "").strip()
                if entry_time:
                    dd["has_signin"] = True
                dd["watch_minutes"] += parse_watch_minutes(
                    row.get("累计观看时长", "")
                )
                try:
                    dd["comments"] += int(row.get("评论数", 0))
                except Exception:
                    pass
            f.close()

    # 生成 records（按 6:00 签到, 6:30 观看, 7:00 互动）
    for jwh, dates in daily_data.items():
        ur = user_records[jwh]
        for date_str, dd in sorted(dates.items()):
            signin = 1 if dd["has_signin"] else 0
            watch = 1 if dd["watch_minutes"] >= 20 else 0
            interact = 1 if dd["comments"] >= 1 else 0
            if date_str == IS_BONUS_DATE:
                signin *= 3
                watch *= 3
                interact *= 3

            if signin:
                ur["records"].append(
                    {"date": date_str, "source": f"{source_tag}签到", "points": signin}
                )
            if watch:
                ur["records"].append(
                    {
                        "date": date_str,
                        "source": f"{source_tag}观看≥20分钟",
                        "points": watch,
                    }
                )
            if interact:
                ur["records"].append(
                    {
                        "date": date_str,
                        "source": f"{source_tag}课堂互动",
                        "points": interact,
                    }
                )

print(f"Users with records: {len(user_records)}")

# ===== 第二步：读取 honor_data.json 获取成长值 =====
with open(
    r"C:\Users\松元涛\Documents\Codex\bailian\honor_data.json", 'r', encoding='utf-8'
) as f:
    honor_data = json.load(f)

# ===== 第三步：组装 data.json =====
users_list = []
for jwh, hd in honor_data.items():
    ur = user_records.get(jwh, {"name": hd.get("name", ""), "records": []})
    total_growth = hd.get("growth_points", 0)
    # 使用 honor_data 的成长值（已由 calc_honors.py 正确计算）
    # 不再用 records 总和覆盖
    users_list.append({
        "id": jwh,
        "nickname": hd.get("name", ur.get("name", "")),
        "growthPoints": total_growth,
        "records": ur["records"],
        "claimedRewards": [],
    })

# 按 growthPoints 降序排列
users_list.sort(key=lambda u: u["growthPoints"], reverse=True)


# 生成排名（含 id 字段，供前端使用）
def to_rank(users, limit=100):
    return [
        {"nickname": u["nickname"], "id": u["id"], "points": u["growthPoints"]}
        for u in users
        if u["id"] != "30017755"
    ][:limit]


data_json = {
    "lastUpdated": "2026-07-07",
    "users": users_list,
    "weeklyRanking": to_rank(users_list),
    "monthlyRanking": to_rank(users_list),
    "cumulativeRanking": to_rank(users_list),
    "announcements": [
        "2026年6月24日：精网新秀成长活动正式启动！6月24日积分翻3倍！"
    ],
}

output_path = r"C:\Users\松元涛\Documents\Codex\bailian\data.json"
with open(output_path, 'w', encoding='utf-8') as f:
    json.dump(data_json, f, ensure_ascii=False)

file_size = os.path.getsize(output_path)
print(f"\n===== 数据摘要 =====")
print(f"总用户: {len(users_list)}")
print(f"活跃用户(>=1分): {sum(1 for u in users_list if u['growthPoints'] > 0)}")
print(f"最高分: {users_list[0]['growthPoints'] if users_list else 0}")
top5 = users_list[:5]
print(f"Top 5:")
for u in top5:
    print(f"  {u['nickname']} ({u['id']}): {u['growthPoints']}分, {len(u['records'])}条记录")
print(f"\n文件: {output_path}")
print(f"大小: {file_size:,} bytes ({file_size/1024/1024:.2f} MB)")
