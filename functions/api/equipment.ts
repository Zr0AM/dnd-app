import { listHandlers } from '../_lib/rest-proxy';

// GET /api/equipment -> EquipmentListView (active rows only).
export const { onRequestGet, onRequestHead, onRequest } = listHandlers('EquipmentListView', [
  'equipmentID',
  'equipmentName',
  'equipmentKind',
  'weaponCategory',
  'armorCategory',
]);
