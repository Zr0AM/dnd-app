import { detailHandlers } from '../../_lib/rest-proxy';

// GET /api/monsters/:id -> one Monster row (ability scores, languages, description).
export const { onRequestGet, onRequestHead, onRequest } = detailHandlers('Monster');
