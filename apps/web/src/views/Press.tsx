import { answerPressQuestion, autoAnswerPress, formatGameDate, managerName, t, tm, type JournalistPersonality } from '@pitchside/core';
import { Meter, Panel, ViewHead } from '../components/ui';
import { useGame, useGameState } from '../store/game';

const PERS_TAG: Record<JournalistPersonality, string> = { SENSATIONALIST: 'warn', ANALYTICAL: 'acc', HOSTILE: 'bad', OPTIMISTIC: 'good' };

export function Press() {
  const g = useGameState();
  const { mutate, notify, setView } = useGame();
  const club = g.clubs[g.userClubId as string];
  const manager = g.managers[club.managerId as string];
  const conf = g.pendingPress;
  const journalists = g.countries[club.countryCode].journalistIds.map((id) => g.journalists[id]).filter(Boolean);
  const pressNews = g.news.filter((n) => (n.category === 'press' || n.category === 'leak') && n.clubIds.includes(club.id)).slice(0, 25);
  const allAnswered = conf && conf.questions.every((q) => conf.answered[q.id]);

  return (
    <>
      <ViewHead
        title={t('ui.press.title')}
        meta={t('ui.press.meta', { name: managerName(manager), rel: Math.round(manager.pressRelation), media: manager.mediaHandling })}
        tools={
          <>
            {conf && !allAnswered && (
              <button className="btn" onClick={() => mutate((s) => s.pendingPress && autoAnswerPress(s, s.pendingPress))}>
                {t('ui.press.autoAll')}
              </button>
            )}
            {conf && allAnswered && (
              <button
                className="btn-go"
                onClick={() => {
                  mutate((s) => (s.pendingPress = null));
                  setView('hub');
                }}
              >
                {t('ui.press.leave')}
              </button>
            )}
            <label className="toggle" title={t('ui.press.autoHint')}>
              <input type="checkbox" checked={g.settings.autoPress} onChange={(e) => mutate((s) => (s.settings.autoPress = e.target.checked))} />
              <span>{t('ui.press.autoSetting')}</span>
            </label>
          </>
        }
      />
      <div className="grid c-main">
        <div className="grid" style={{ alignContent: 'start' }}>
          {!conf && (
            <Panel title={t('ui.press.none')}>
              <p className="dim" style={{ margin: 0 }}>
                {t('ui.press.help')}
              </p>
            </Panel>
          )}
          {conf?.questions.map((q) => {
            const j = g.journalists[q.journalistId];
            const answered = conf.answered[q.id];
            return (
              <Panel key={q.id}>
                <div className="row">
                  <span className="b">
                    {j.firstName} {j.lastName}
                  </span>
                  <span className="faint">{j.outlet}</span>
                  <span className={`tag ${PERS_TAG[j.personality]}`}>{t(`ui.press.pers.${j.personality}`)}</span>
                  <span className="spacer" />
                  <span className="faint" style={{ fontSize: 12 }}>
                    {t('ui.press.influence', { n: j.influence })}
                  </span>
                </div>
                <p className="disp" style={{ fontSize: 22, fontStyle: 'italic', textTransform: 'none', fontWeight: 700, margin: '10px 0' }}>
                  “{tm(q.text)}”
                </p>
                {answered ? (
                  <span className="tag good">{t('ui.press.answered', { tone: t(`ui.press.tone.${answered}`) })}</span>
                ) : (
                  <div className="answers">
                    {q.options.map((o) => (
                      <button
                        key={o.tone}
                        className="answer"
                        onClick={() => {
                          const headline = mutate((s) => (s.pendingPress ? answerPressQuestion(s, s.pendingPress, q.id, o.tone) : null));
                          if (headline) notify(t('ui.press.headline', { text: tm(headline) }));
                        }}
                      >
                        <span className="tag">{t(`ui.press.tone.${o.tone}`)}</span>
                        <span>{tm(o.text)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </Panel>
            );
          })}
        </div>
        <div className="grid" style={{ alignContent: 'start' }}>
          <Panel title={t('ui.press.journalists')}>
            {journalists.map((j) => (
              <div key={j.id} style={{ marginBottom: 8 }}>
                <div className="row nw" style={{ fontSize: 13 }}>
                  <span className="ellipsis">
                    {j.firstName} {j.lastName}
                  </span>
                  <span className={`tag ${PERS_TAG[j.personality]}`}>{t(`ui.press.pers.${j.personality}`)}</span>
                  <span className="spacer" />
                  <span className="faint">{j.outlet}</span>
                </div>
                <Meter value={j.relation} color={j.relation < 35 ? 'var(--bad)' : undefined} />
              </div>
            ))}
          </Panel>
          <Panel title={t('ui.press.headlines')} flush>
            {pressNews.length === 0 && <p className="dim" style={{ padding: 12, margin: 0 }}>{t('ui.press.nothing')}</p>}
            {pressNews.map((n) => (
              <div key={n.id} className="mail">
                <div className="bar" style={{ background: n.category === 'leak' ? 'var(--bad)' : 'var(--accent)' }} />
                <div>
                  <div className="t">{tm(n.title)}</div>
                  <div className="b">{tm(n.body)}</div>
                </div>
                <div className="when">{formatGameDate(n.season, n.day)}</div>
              </div>
            ))}
          </Panel>
        </div>
      </div>
    </>
  );
}
