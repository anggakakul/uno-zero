import { wrapRulesetWithExpansions } from '../expansions/expansionWrapper';
import { UnoRuleset, VariantId } from '../types';
import { unoClassicRuleset } from './unoClassic';
import { unoFlipRuleset } from './unoFlip';
import { unoFlexRuleset } from './unoFlex';
import { unoAllWildRuleset } from './unoAllWild';
import { unoNoMercyRuleset } from './unoNoMercy';
import { unoTeamsRuleset } from './unoTeams';
import { unoPartyRuleset } from './unoParty';
import { unoLiarsRuleset } from './unoLiars';
import { dosModeRuleset } from './dosMode';
import { ono99Ruleset } from './ono99';

const BASE_REGISTRY: Record<Exclude<VariantId, 'uno-zero'>, UnoRuleset> = {
  'uno-classic': unoClassicRuleset,
  'uno-flip': unoFlipRuleset,
  'uno-flex': unoFlexRuleset,
  'uno-all-wild': unoAllWildRuleset,
  'uno-no-mercy': unoNoMercyRuleset,
  'uno-teams': unoTeamsRuleset,
  'uno-party': unoPartyRuleset,
  'uno-liars': unoLiarsRuleset,
  'dos-mode': dosModeRuleset,
  'ono-99': ono99Ruleset,
};

export const RULESET_REGISTRY: Record<Exclude<VariantId, 'uno-zero'>, UnoRuleset> =
  Object.fromEntries(
    Object.entries(BASE_REGISTRY).map(([id, ruleset]) => [
      id,
      wrapRulesetWithExpansions(ruleset),
    ])
  ) as Record<Exclude<VariantId, 'uno-zero'>, UnoRuleset>;

export function getRuleset(variantId: Exclude<VariantId, 'uno-zero'>): UnoRuleset {
  return RULESET_REGISTRY[variantId];
}
