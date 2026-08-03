import { CAPABILITIES, assertCapability } from '../modules/access-control/public.mjs';

export function assertBomManage(membership) {
  return assertCapability(membership, CAPABILITIES.BOM_MANAGE);
}

export function assertBomRead(membership) {
  return assertCapability(membership, CAPABILITIES.BOM_READ);
}
