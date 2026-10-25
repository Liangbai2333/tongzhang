// Original exports from Figma 87:1597 and 87:1713. QR codes remain live API data.
import scanCaption from '../../assets/figma/abe4a.svg';
import copy from '../../assets/figma/28367.svg';
import share from '../../assets/figma/f4867.svg';
import invitationInfo from '../../assets/figma/6ca74.svg';
import friendOne from '../../assets/figma/50701.png';
import friendTwo from '../../assets/figma/9bebe.png';
import circleLarge from '../../assets/figma/2d029.svg';
import circleSmall from '../../assets/figma/cf616.svg';
import ledger from '../../assets/figma/4b368.svg';
import scan from '../../assets/figma/ff61c.svg';
import joinInfo from '../../assets/figma/42245.svg';

export const invitationAssets = {
  scanCaption: { source: scanCaption, width: 14, height: 14 },
  copy: { source: copy, width: 20, height: 20 },
  share: { source: share, width: 16, height: 16 },
  invitationInfo: { source: invitationInfo, width: 16, height: 16 },
  friendOne: { source: friendOne, width: 20, height: 20 },
  friendTwo: { source: friendTwo, width: 20, height: 20 },
  circleLarge: { source: circleLarge, width: 160, height: 160 },
  circleSmall: { source: circleSmall, width: 80, height: 80 },
  ledger: { source: ledger, width: 32, height: 32 },
  scan: { source: scan, width: 20, height: 20 },
  joinInfo: { source: joinInfo, width: 18, height: 18 },
} as const;
