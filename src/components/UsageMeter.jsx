/* Compact pill showing AI-word usage for the current period. */
export default function UsageMeter({ user }) {
  if (!user) {
    return (
      <div className="usage-bar">
        <span>Free trial · sign in for AI rewrites</span>
      </div>
    );
  }
  const { used = 0, limit = 0 } = user.usage || {};
  if (user.plan === "premium") {
    const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
    return (
      <div className={"usage-bar" + (pct >= 90 ? " warn" : "")}>
        <span>Premium · {used.toLocaleString()} / {limit.toLocaleString()} words this month</span>
        <span className="bar"><span className="fill" style={{ width: pct + "%" }}/></span>
      </div>
    );
  }
  // free
  const pct = limit ? Math.min(100, (used / limit) * 100) : 0;
  const over = used >= limit && limit > 0;
  return (
    <div className={"usage-bar" + (over ? " over" : pct >= 75 ? " warn" : "")}>
      <span>Free · {used} / {limit} AI words today</span>
      <span className="bar"><span className="fill" style={{ width: pct + "%" }}/></span>
    </div>
  );
}
