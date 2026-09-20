// BreakMetric team EV aggregation helpers

export function aggregateTeamEV(cardContributions) {
  const teams = {};

  for (const card of cardContributions) {
    if (!card || !card.team) continue;

    const ev = Number(card.ev_contribution_usd);
    if (!Number.isFinite(ev) || ev < 0) continue;

    if (!teams[card.team]) {
      teams[card.team] = {
        partial_ev_usd: 0,
        valued_card_count: 0,
        contributions: []
      };
    }

    teams[card.team].partial_ev_usd += ev;
    teams[card.team].valued_card_count += 1;
    teams[card.team].contributions.push({
      card_id: card.card_id ?? null,
      player: card.player ?? null,
      set: card.set ?? null,
      parallel: card.parallel ?? null,
      ev_contribution_usd: ev
    });
  }

  for (const team of Object.values(teams)) {
    team.partial_ev_usd = Number(team.partial_ev_usd.toFixed(2));
    team.coverage_complete = false;
  }

  return teams;
}
