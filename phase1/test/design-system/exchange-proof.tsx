import {ROLE_ALIASES,THEME_ROLES,parseThemeExchange,exportThemeExchange,themeExchangeVariables} from '../../src/lib/themeExchange';
/** Isolated aliases only: no production import and no application preference writes. */
export function ExchangeProof(){return <section data-testid="exchange-proof" style={Object.fromEntries(THEME_ROLES.map(role=>[`--sc-${role}`,`var(${ROLE_ALIASES[role]})`])) as React.CSSProperties}><h2>Theme exchange aliases (isolated)</h2><div style={{background:'var(--sc-card)',color:'var(--sc-card-foreground)',padding:12}}>Alias card</div><button style={{background:'var(--sc-primary)',color:'var(--sc-primary-foreground)'}}>Alias primary</button></section>;}
// Development-fixture surface for the Playwright probe, never an app API.
Object.assign(window,{themeExchangeProof:{ROLE_ALIASES,THEME_ROLES,parseThemeExchange,exportThemeExchange,themeExchangeVariables}});
