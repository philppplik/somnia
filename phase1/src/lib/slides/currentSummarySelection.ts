import {getSlideSummaryOwner} from './session';import {getSlideTextSelection} from './panelSelection';import {captureSlideSummary} from './summarySelection';
export const captureCurrentSlideSummary=()=>captureSlideSummary(getSlideSummaryOwner(),getSlideTextSelection());
