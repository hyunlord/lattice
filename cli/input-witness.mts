import type { BigIntStats } from 'node:fs';
export type Identity = Pick<BigIntStats, 'dev' | 'ino' | 'size' | 'mtimeNs' | 'ctimeNs'>;
export const identity = ({ dev, ino, size, mtimeNs, ctimeNs }: BigIntStats): Identity => ({ dev, ino, size, mtimeNs, ctimeNs });
export const sameIdentity = (left: Identity | undefined, right: Identity | undefined): boolean => left === right || (left !== undefined && right !== undefined && left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs);
