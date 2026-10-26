import React from "react";

// Three small charts built from plain divs: level spread, daily activity, topic trends.
const ClassInsights = ({ data }) => {
  const dist = data.levelDistribution || [];
  const maxDist = Math.max(1, ...dist);
  const days = data.activityByDay || [];
  const maxDay = Math.max(1, ...days.map((d) => d.answers));
  const trends = data.topicTrends || [];

  return (
    <>
      <div className="t-two">
        <div className="t-card">
          <h3>Students by level</h3>
          {dist.every((n) => n === 0) ? (
            <p className="t-sub">Levels appear once students have practised or taken the placement test.</p>
          ) : (
            <div className="t-bars">
              {dist.map((n, i) => (
                <div className="t-bar-col" key={i} title={`${n} student(s) at level ${i + 1}`}>
                  <span className="t-bar-num">{n || ""}</span>
                  <div className="t-bar" style={{ height: `${(n / maxDist) * 100}%` }} />
                  <span className="t-bar-lbl">{i + 1}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="t-card">
          <h3>Answers per day (14 days)</h3>
          <div className="t-bars">
            {days.map((d) => (
              <div className="t-bar-col" key={d.date} title={`${d.date}: ${d.answers} answers, ${d.activeStudents} students${d.successRate === null ? "" : `, ${Math.round(d.successRate * 100)}% success`}`}>
                <span className="t-bar-num">{d.answers || ""}</span>
                <div className="t-bar t-bar-alt" style={{ height: `${(d.answers / maxDay) * 100}%` }} />
                <span className="t-bar-lbl">{d.date.slice(8)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="t-card">
        <h3>Topics that are struggling (last 14 days)</h3>
        {!trends.length && <p className="t-sub">Needs at least 5 answers in a topic.</p>}
        {!!trends.length && (
          <div className="t-scroll">
            <table className="t-table t-plain">
              <thead><tr><th>Topic</th><th>Answers</th><th>Success</th><th>vs. previous 14 days</th></tr></thead>
              <tbody>
                {trends.map((t) => (
                  <tr key={t.subject + t.topic}>
                    <td>{t.subject} / {t.topic}</td>
                    <td>{t.answers}</td>
                    <td>{Math.round(t.successRate * 100)}%</td>
                    <td>
                      {t.change === null ? "–" : (
                        <span className={t.change >= 0 ? "t-up" : "t-down"}>
                          {t.change >= 0 ? "▲" : "▼"} {Math.abs(Math.round(t.change * 100))} pts
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};

export default ClassInsights;
