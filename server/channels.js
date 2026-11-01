export const defaultBaseChannels = [
  { name: '财经壹眼', time: '09:30', start: '09:00', end: '12:00' },
  { name: '易学久会', time: '20:00', start: '19:00', end: '24:00' },
];

const minutes = value => {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return Number.NaN;
  return Number(match[1]) * 60 + Number(match[2]);
};

export function normalizeBaseChannels(channels = defaultBaseChannels) {
  return channels.map(channel => ({
    ...defaultBaseChannels.find(item => item.name === channel.name),
    ...channel,
  }));
}

export function channelFor(startTime, channels = defaultBaseChannels) {
  const value = minutes(String(startTime).slice(11, 16));
  if (!Number.isFinite(value)) return '未分配栏目';
  const baseChannel = normalizeBaseChannels(channels).find(channel => {
    const start = minutes(channel.start);
    const end = minutes(channel.end);
    return Number.isFinite(start) && Number.isFinite(end) && value >= start && value < end;
  });
  if (baseChannel) return baseChannel.name;
  if (value >= 720 && value < 1020) return '三点启航';
  return '未分配栏目';
}
