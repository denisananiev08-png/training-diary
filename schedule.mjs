// Calendar dates are interpreted without UTC shifts (including DST boundaries).
export function weekday(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d, 12).getDay();
}
export function scheduledDate(date, plan, inclusive = false) {
  const [y, m, d] = date.split('-').map(Number);
  const result = new Date(y, m - 1, d, 12);
  const target = plan === 'B' ? 4 : 2;
  let offset = (target - result.getDay() + 7) % 7;
  if (!inclusive && offset === 0) offset = 7;
  result.setDate(result.getDate() + offset);
  return `${result.getFullYear()}-${String(result.getMonth() + 1).padStart(2, '0')}-${String(result.getDate()).padStart(2, '0')}`;
}
export function nextPlan(plan) { return plan === 'A' ? 'B' : 'A'; }
export function cycleFromHistory(history, today) {
  const latest = history.filter(day => day.status === 'completed' && !day.activity && ['A', 'B', 'C'].includes(day.plan))
    .sort((a, b) => b.date.localeCompare(a.date))[0];
  const plan = latest ? nextPlan(latest.plan) : 'A';
  return {next_plan: plan, planned_date: latest ? scheduledDate(latest.date, plan) : scheduledDate(today, plan, true)};
}
export function isBoxingDate(date) { return [0, 6].includes(weekday(date)); }
