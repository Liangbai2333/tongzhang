// Original Figma exports: list glyphs from Screen 5:358 (09.01), panel icons from Icons 121:17.
import user from '../../assets/figma/a5b01.svg';
import settings from '../../assets/figma/9ce9a.svg';
import about from '../../assets/figma/61916.svg';
import chevron from '../../assets/figma/30b34.svg';
import refresh from '../../assets/figma/db755.svg';
import bell from '../../assets/figma/f7c8c.svg';
import amount from '../../assets/figma/1d036.svg';
import lock from '../../assets/figma/fc0fc.svg';
import note from '../../assets/figma/dde5f.svg';

export const profileAssets = {
  user: { source: user, width: 20, height: 20 },
  settings: { source: settings, width: 20, height: 20 },
  about: { source: about, width: 20, height: 20 },
  chevron: { source: chevron, width: 16, height: 16 },
  refresh: { source: refresh, width: 24, height: 24 },
  bell: { source: bell, width: 24, height: 24 },
  amount: { source: amount, width: 24, height: 24 },
  lock: { source: lock, width: 24, height: 24 },
  note: { source: note, width: 24, height: 24 },
} as const;
