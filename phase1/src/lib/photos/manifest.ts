import type {StudioDef} from '../studios/registry';
/** Merge this agent fragment into the real Photos Studio manifest. No auto-registration. */
export const photoDevelopManifest:Pick<StudioDef,'agent'>={agent:{tools:['photo_inspect','photo_propose_settings'],contextProviders:['photoDevelopMetadata','photoDevelopSettings'],quickActions:[]}};
