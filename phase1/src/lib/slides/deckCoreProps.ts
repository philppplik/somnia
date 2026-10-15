import {writeCoreProperties,type CorePropsMeta} from '../office/coreProps';
/** Deck metadata is the shared OOXML core-properties writer; the alias keeps the slides API stable. */
export type DeckCoreMeta=CorePropsMeta;
export const writeDeckCoreProperties=writeCoreProperties;
