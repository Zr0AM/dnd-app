import { detailHandlers } from '../../_lib/rest-proxy';

// GET /api/spells/:id -> one Spell row (full description).
export const { onRequestGet, onRequestHead, onRequest } = detailHandlers('Spell');
