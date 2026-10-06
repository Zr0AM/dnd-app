import { listHandlers } from '../_lib/rest-proxy';

// GET /api/monsters -> MonsterListView (active rows only).
export const { onRequestGet, onRequestHead, onRequest } = listHandlers('MonsterListView', [
  'monsterID',
  'monsterName',
  'creatureTypeName',
  'crValue',
  'crLabel',
  'monsterSizes',
]);
