import { detailHandlers } from '../../_lib/rest-proxy';

// GET /api/equipment/:id -> one Equipment row (description).
export const { onRequestGet, onRequestHead, onRequest } = detailHandlers('Equipment');
