import { v7 } from 'uuid'

/** UUID v7 (time-sortable). Usado como ID de todas las entidades. */
export const newId = (): string => v7()
