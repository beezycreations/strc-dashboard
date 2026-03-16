export default function AsOf({ ts }: { ts?: string }) {
  if (!ts) return null;
  const d = new Date(ts);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  let label: string;
  if (diffMins < 1) label = "just now";
  else if (diffMins < 60) label = `${diffMins}m ago`;
  else if (diffMins < 1440) label = `${Math.floor(diffMins / 60)}h ago`;
  else label = d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  const timeStr = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short" });
  return (
    <span style={{ fontSize: 10, color: "var(--t3)", fontWeight: 400 }} title={timeStr}>
      as of {label}
    </span>
  );
}
