// BreakMetric consolidated player index helpers.
// The generated player-index JSON is built from base, main autographs,
// Hobby-relevant inserts and Hobby-relevant special autographs.

export function addPlayerEntry(index, { team, player, entry, baseCardNumber = null, designation = null }) {
  if (!team || !player) return index;
  const key = team + "|||" + player;

  if (!index[key]) {
    index[key] = {
      team,
      player,
      base_card_number: null,
      designation: null,
      checklist_entries: []
    };
  }

  if (baseCardNumber !== null) index[key].base_card_number = baseCardNumber;
  if (designation) index[key].designation = designation;
  index[key].checklist_entries.push(entry);
  return index;
}

export function finalizePlayerIndex(index) {
  return Object.values(index).map(player => {
    const sections = [...new Set(player.checklist_entries.map(item => item.section))];
    return {
      ...player,
      checklist_sections: sections,
      total_checklist_entries: player.checklist_entries.length
    };
  });
}
