/**
 * Extension file-open router (B2 of the extension SDK wave).
 *
 * Extensions may offer to open validated document kinds, but they are never
 * studios and never silent winners. This module is the guarded adapter between
 * extension contributions and the Smart Open resolver (lib/studios/openResolver):
 *
 * - Kinds come from the closed OpenKind set; bytes decide the kind, an
 *   extension can never claim a kind the content did not validate to.
 * - The target command must be owned by the same extension (ownership is
 *   checked through a host-supplied predicate; this module stays pure).
 * - Extension priority is hard-capped below every built-in default handler,
 *   so an extension can never pre-empt the product default.
 * - Extensions are never marked default; ties are always resolved by the
 *   user, never by registration order.
 * - Registration returns a Disposable-style unregister that only removes the
 *   entry it created, mirroring registerOpenHandler.
 */
import {ExtensionError} from './contracts/v2/api';
import {OPEN_KINDS,type OpenKind} from '../studios/openHandlers';

/** Built-in handlers use 100 (primary), 50 (queued studios) and 0 (code fallback).
 * Extension offers must stay strictly below the built-in product defaults. */
export const MAX_EXTENSION_OPEN_PRIORITY = 49;

const VALID_KINDS: readonly OpenKind[] = OPEN_KINDS;

export interface ExtensionOpenOffer {
  /** Handler id, namespaced as `<extensionId>.<localId>` by the host. */
  readonly id: string;
  readonly extensionId: string;
  /** Validated document kinds the extension offers to open. */
  readonly kinds: readonly OpenKind[];
  /** Command the router invokes when the user picks this offer. Must belong to the extension. */
  readonly commandId: string;
  /** 'preview' offers are reported read-only; they never imply edit or round-trip saving. */
  readonly capability: 'edit' | 'preview';
  /** Requested priority; clamped to MAX_EXTENSION_OPEN_PRIORITY. Negative allowed. */
  readonly priority: number;
  /** Localized display label for the choose-handler UI. */
  readonly title: string;
}

export interface RoutedOpenOffer extends ExtensionOpenOffer {
  /** Effective priority after the hard cap. */
  readonly effectivePriority: number;
}

/** Host predicate: true when `commandId` is a command contributed by `extensionId`. */
export type CommandOwnership = (extensionId: string, commandId: string) => boolean;

const offers = new Map<string, RoutedOpenOffer>();

function assertOffer(offer: ExtensionOpenOffer, ownsCommand: CommandOwnership): void {
  if (!offer.id || offer.id.length > 128 || /[\\:\u0000-\u001f]/.test(offer.id))
    throw new ExtensionError('E_INVALID_ARGUMENT', 'Open offer id is invalid.');
  if (!offer.extensionId) throw new ExtensionError('E_INVALID_ARGUMENT', 'Open offer needs an extension id.');
  if (!offer.kinds.length || offer.kinds.length > VALID_KINDS.length)
    throw new ExtensionError('E_INVALID_ARGUMENT', 'Open offer must declare at least one kind.');
  for (const kind of offer.kinds)
    if (!VALID_KINDS.includes(kind))
      throw new ExtensionError('E_INVALID_ARGUMENT', `Open offer kind is not a validated document kind: ${String(kind)}`);
  if (!offer.title || offer.title.length > 120)
    throw new ExtensionError('E_INVALID_ARGUMENT', 'Open offer needs a display title (max 120 chars).');
  if (!ownsCommand(offer.extensionId, offer.commandId))
    throw new ExtensionError('E_PERMISSION_DENIED', `Command ${offer.commandId} is not contributed by ${offer.extensionId}.`);
}

/**
 * Registers an extension open offer. Throws ExtensionError on any invariant
 * violation; nothing is registered partially.
 */
export function registerExtensionOpenOffer(
  offer: ExtensionOpenOffer,
  ownsCommand: CommandOwnership,
): () => void {
  assertOffer(offer, ownsCommand);
  if (offers.has(offer.id)) throw new ExtensionError('E_INVALID_ARGUMENT', `Open offer already registered: ${offer.id}`);
  const routed: RoutedOpenOffer = {
    ...offer,
    kinds: Object.freeze([...offer.kinds]),
    effectivePriority: Math.min(offer.priority, MAX_EXTENSION_OPEN_PRIORITY),
  };
  offers.set(offer.id, routed);
  return () => { if (offers.get(offer.id) === routed) offers.delete(offer.id); };
}

/** All offers for a validated kind, priority-descending, registration order as stable tiebreak for display only. */
export function extensionOffersFor(kind: OpenKind): RoutedOpenOffer[] {
  return [...offers.values()]
    .filter(o => o.kinds.includes(kind))
    .sort((a, b) => b.effectivePriority - a.effectivePriority);
}

/**
 * Merge extension offers into a resolver outcome. Extensions only ever join
 * the candidate list the user picks from; a single built-in winner stays the
 * winner (the offer list is exposed separately for "Open with").
 */
export function mergeWithBuiltIns<T>(builtInWinner: T | null, kind: OpenKind): {
  winner: T | null;
  extensionCandidates: RoutedOpenOffer[];
} {
  return {winner: builtInWinner, extensionCandidates: extensionOffersFor(kind)};
}

/** Execution path behind a registered offer, bound by the host that owns the extension runtime. */
export type OpenOfferDispatch = (args: unknown) => Promise<void>;

const dispatchers = new Map<string, OpenOfferDispatch>();

/** Host wiring: binds the execution path for an already registered offer. The coordinator gate hides offers whose host never binds a dispatch ("no dispatch, no offers"). */
export function setExtensionOpenOfferDispatch(offerId: string, dispatch: OpenOfferDispatch): () => void {
  if (!offers.has(offerId)) throw new ExtensionError('E_INVALID_ARGUMENT', `Open offer is not registered: ${offerId}`);
  dispatchers.set(offerId, dispatch);
  return () => { if (dispatchers.get(offerId) === dispatch) dispatchers.delete(offerId); };
}

/** True when the offer has a bound execution path. */
export function hasExtensionOpenOfferDispatch(offerId: string): boolean { return dispatchers.has(offerId); }

/** Runs the command behind an offer. False when no dispatch is bound. */
export async function dispatchExtensionOpenOffer(offerId: string, args: unknown): Promise<boolean> {
  const dispatch = dispatchers.get(offerId);
  if (!dispatch) return false;
  await dispatch(args);
  return true;
}

/** Test hook: forget every registered offer and dispatch binding. */
export function resetExtensionOpenOffers(): void { offers.clear(); dispatchers.clear(); }
