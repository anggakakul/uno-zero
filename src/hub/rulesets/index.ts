import { wrapRulesetWithExpansions } from '../expansions/expansionWrapper';
import { UnoRuleset, VariantId } from '../types';
import { unoClassicRuleset } from './unoClassic';
import { unoFlipRuleset } from './unoFlip';
import { unoFlexRuleset } from './unoFlex';
import { unoAllWildRuleset } from './unoAllWild';
import { unoNoMercyRuleset } from './unoNoMercy';
import { unoTeamsRuleset } from './unoTeams';
import { unoAttackRuleset } from './unoAttack';
import { unoTriplePlayRuleset } from './unoTriplePlay';
import { unoJuniorRuleset } from './unoJunior';
import { unoPartyRuleset } from './unoParty';
import { unoGolfRuleset } from './unoGolf';
import { unoLiarsRuleset } from './unoLiars';
import { unoHouseRemixRuleset } from './unoHouseRemix';
import { unoDareEmojiRuleset } from './unoDareEmoji';
import { unoExpressRuleset } from './unoExpress';
import { unoRummyUpRuleset } from './unoRummyUp';
import { unoHeartsRuleset } from './unoHearts';
import { dosModeRuleset } from './dosMode';
import { ono99Ruleset } from './ono99';

const BASE_REGISTRY: Record<Exclude<VariantId, 'uno-zero'>, UnoRuleset> = {
  'uno-classic': unoClassicRuleset,
  'uno-flip': unoFlipRuleset,
  'uno-flex': unoFlexRuleset,
  'uno-all-wild': unoAllWildRuleset,
  'uno-no-mercy': unoNoMercyRuleset,
  'uno-teams': unoTeamsRuleset,
  'uno-attack': unoAttackRuleset,
  'uno-triple-play': unoTriplePlayRuleset,
  'uno-junior': unoJuniorRuleset,
  'uno-party': unoPartyRuleset,
  'uno-golf': unoGolfRuleset,
  'uno-liars': unoLiarsRuleset,
  'uno-house-remix': unoHouseRemixRuleset,
  'uno-dare-emoji': unoDareEmojiRuleset,
  'uno-express': unoExpressRuleset,
  'uno-rummy-up': unoRummyUpRuleset,
  'uno-hearts': unoHeartsRuleset,
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
