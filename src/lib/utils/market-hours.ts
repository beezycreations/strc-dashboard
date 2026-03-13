// Market hours utility — US equity market (NYSE/Nasdaq)
// Market open: Mon-Fri 9:30 AM - 4:00 PM ET
// Excludes major US holidays

export function isMarketOpen(): boolean {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const day = et.getDay();
  if (day === 0 || day === 6) return false;
  const hour = et.getHours();
  const minute = et.getMinutes();
  const timeMinutes = hour * 60 + minute;
  return timeMinutes >= 570 && timeMinutes < 960; // 9:30=570, 16:00=960
}

export function isMarketClose(): boolean {
  const et = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  return et.getDay() >= 1 && et.getDay() <= 5 && et.getHours() === 16 && et.getMinutes() === 0;
}

export function daysToMonthEnd(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  return Math.max(0, Math.ceil((lastDay.getTime() - now.getTime()) / 86400000));
}
