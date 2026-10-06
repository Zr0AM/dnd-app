import { listHandlers } from '../_lib/rest-proxy';

// GET /api/spells -> SpellListView (active rows only).
export const { onRequestGet, onRequestHead, onRequest } = listHandlers('SpellListView', [
  'spellID',
  'spellName',
  'spellLevel',
  'schoolName',
  'spellConcentration',
  'spellIsRitual',
  'spellCastingTime',
]);
