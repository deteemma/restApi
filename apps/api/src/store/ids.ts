import { Types } from 'mongoose';
import { notFound } from '../errors';

/** Vrai pour un identifiant MongoDB bien formé (24 caractères hexadécimaux). */
export const isObjectId = (id: string | null | undefined): id is string =>
  typeof id === 'string' && /^[a-f\d]{24}$/i.test(id);

/** Identifiant MongoDB ; un identifiant mal formé désigne une ressource introuvable (404). */
export function toObjectId(id: string | null | undefined): Types.ObjectId {
  if (!isObjectId(id)) throw notFound();
  return new Types.ObjectId(id);
}
