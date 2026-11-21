import { affinityChapter, AFFINITY_MAX, createFreeAffinity } from '../../../studio_web/free_affinity.mjs';

export function createIslandAffinity(bridge, query, variables, sceneChapter) {
  const keys = ['affC', 'affM', 'affS', 'freeAffC_ch', 'freeAffM_ch', 'freeAffS_ch'];
  const initial = Object.fromEntries(keys.filter(key => query.has(key)).map(key => [key, query.get(key)]));
  function chapter() {
    const vars = variables(), day = vars.day ?? query.get('day');
    const scene = sceneChapter();
    const inferred = scene === 'true' && day && vars.trueEnding_island_step === undefined ? null : scene;
    return affinityChapter(day, query.get('visitChapter') || query.get('chapter') || inferred);
  }
  return createFreeAffinity({
    embedded: bridge.embedded,
    variables: () => ({ ...initial, ...variables() }),
    chapter,
    write(changes) {
      Object.assign(variables(), changes);
      for (const [name, value] of Object.entries(changes)) bridge.setStep(name, value);
    },
    update(vars) {
      const mark = name => Number(vars[name]) || 0;
      const score = name => Math.max(0, Math.min(AFFINITY_MAX, mark(name)));
      window.STUDIO_GAME_STATE = {
        chapter: chapter(),
        affinity: { chen: score('affC'), ming: score('affM'), shi: score('affS') },
        freeAffC_ch: mark('freeAffC_ch'), freeAffM_ch: mark('freeAffM_ch'), freeAffS_ch: mark('freeAffS_ch')
      };
    },
    debug: query.get('debug') === '1'
  });
}
