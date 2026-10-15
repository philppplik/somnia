import {Star} from 'lucide-react';
import {useT} from '../../lib/useT';
import {MAX_RATING,useRating} from '../../lib/photos/ratings';
import {cullSetRating} from '../../lib/photos/cullHistory';
import {Button} from '../ui/button';

/** Five star buttons for one photo: clicking star n rates n, clicking the current rating clears it to 0. */
export function RatingStars({name,prefix}:{name:string;prefix:string}){
 const {t}=useT();
 const rating=useRating(name);
 return <div className="flex items-center gap-0.5" role="group" aria-label={t('photos.rating.label')} data-testid={`${prefix}-rating`}>
  {Array.from({length:MAX_RATING},(_,i)=>i+1).map(n=><Button key={n} variant="ghost" size="compact" aria-pressed={n<=rating} aria-label={`${n} / ${MAX_RATING}`} title={`${n} / ${MAX_RATING}`} onClick={()=>cullSetRating(name,n===rating?0:n)} className="px-0.5" data-testid={`${prefix}-rating-star-${n}`}>
   <Star size={12} fill={n<=rating?'currentColor':'none'} className={n<=rating?'text-[var(--accent)]':'text-ink-3'}/>
  </Button>)}
 </div>;
}
