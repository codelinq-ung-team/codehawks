// Abe in a few poses for the Basics form and results: the same head as Avatar.tsx on a small body.
// "peek" is just the head and hands, for looking over the top of the results easel.
// 48×48, transparent. Show at multiples of 48 (96, 144) so the pixels stay crisp.

import { toRects } from './pixels.ts'

type DrawnPose = 'wave' | 'point' | 'think' | 'clipboard' | 'thumbs' | 'cheer' | 'pointup' | 'ponder'
export type PoseName = DrawnPose | 'heart' | 'shocked' | 'peek'

// One letter per pixel, '.' is transparent. Letters map to the colors in pixels.ts.
const DRAWN: Record<DrawnPose, string[]> = {
  wave: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KTttTTTTTTTK..................',
    '..................KTTTTTTTTTTK.....O............',
    '..............KAaaaaaAAAAAAAAAAAAKO.............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH....z.z.z...O..',
    '...............HHHHSSSSSSSSSSHHHH...zSzSzSz...O.',
    '................hHSBBBSSSSBBBSHH....zSSSSSz.....',
    '................zHSsssSSSSsssSHz...zSSSSSSz.....',
    '...............zSHSSwESSsSwESSHSz..zzsSSSSz..O..',
    '...............zSHSSEESSsSEESSHSz....zSSSz....O.',
    '................sDDCSSSSsSSSCDDs.....KccK.......',
    '................DdDDSMSzzSSSDDDD....KrccK.......',
    '................DdDDDSnmmnSDdDDD....KrccK.......',
    '................DDgDDDSSSSDDdDDD....KrJJK.......',
    '................DDDdDDDgDDDDDDDD....KrJJK.......',
    '.................KDdDDDgDdDgDdK....KrJJJK.......',
    '..................KDDdDDDdDDDK.....KrJJK........',
    '...................DDdDDgDDDD.....KrJJJK........',
    '.....................DDDDDD......KrJJJJK........',
    '.............KKK.KKYYYccccYYYKK.KrJJJJK.........',
    '............KrrrKJJYYYYyyYYYYJJKrJJJJK..........',
    '............KrJJKrJYYLecccLYYJJKrJJJK...........',
    '............KrJJKrJJJLLccLLJoJJKrJJK............',
    '............KrJJKrJJJJLLLLJJOJJKKKK.............',
    '............KrJJKrJJJJJJKJJJJJJK................',
    '............KrJJKrJJJJJaKJJJJJJK................',
    '............KccJKrJJJJJJKJJJJJJK................',
    '............KccJKrJJJJJJKJJJJJJK................',
    '............zSSzKrJJJJJaKJJJJJJK................',
    '...........zSSSSzKrJJJJJKJJJJJK.................',
    '............zSSz.KrJJJJJKJJJJJK.................',
    '.............zz..KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  point: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KTttTTTTTTTK..................',
    '..................KTTTTTTTTTTK..................',
    '..............KAaaaaaAAAAAAAAAAAAK..............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH...............',
    '...............HHHHSSSSSSSSSSHHHH...............',
    '................hHSBBBSSSSBBBSHH................',
    '................zHSsssSSSSsssSHz................',
    '...............zSHSSwESSsSwESSHSz...............',
    '...............zSHSSEESSsSEESSHSz...............',
    '................sDDCSSSSsSSSCDDs................',
    '................DdDDSMSzzSSSDDDD................',
    '................DdDDDSnmmnSDdDDD................',
    '................DDgDDDSSSSDDdDDD................',
    '................DDDdDDDgDDDDDDDD................',
    '.................KDdDDDgDdDgDdK.................',
    '..................KDDdDDDdDDDK..................',
    '...................DDdDDgDDDD...................',
    '.....................DDDDDD.....................',
    '.............KKK.KKYYYccccYYYKK.KKKKKKKKKzz.....',
    '............KrrrKJJYYYYyyYYYYJJKrrrrrrrrrSSzzz..',
    '............KrJJKrJYYLecccLYYJJKrJJJJJJccSSSSSz.',
    '............KrJJKrJJJLLccLLJoJJKrJJJJJJccSSSz...',
    '............KrJJKrJJJJLLLLJJOJJKKKKKKrJJJSSz....',
    '............KrJJKrJJJJJJKJJJJJJK.....KKKKzz.....',
    '............KrJJKrJJJJJaKJJJJJJK................',
    '............KccJKrJJJJJJKJJJJJJK................',
    '............KccJKrJJJJJJKJJJJJJK................',
    '............zSSzKrJJJJJaKJJJJJJK................',
    '...........zSSSSzKrJJJJJKJJJJJK.................',
    '............zSSz.KrJJJJJKJJJJJK.................',
    '.............zz..KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  think: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK............kk....',
    '..................KAaaAAAAAAAK...........kWWk...',
    '..................KAaAAAAAAAAK..........kWWWWk..',
    '..................KAaAAAAAAAAK.........kWWWWWWk.',
    '..................KAaAAAAAAAAK.........kWWWWWWk.',
    '..................KTttTTTTTTTK..........kWWWWk..',
    '..................KTTTTTTTTTTK...........kkkk...',
    '..............KAaaaaaAAAAAAAAAAAAK....kk........',
    '...............KKKKKKKKKKKKKKKKKK....kWWk.......',
    '...............HHhssssssssssssHHH....kWWk.......',
    '...............HHHHSSSSSSSSSSHHHH.....kk........',
    '................hHSBBBSSSSBBBSHH....k...........',
    '................zHSsssSSSSsssSHz...kWk..........',
    '...............zSHSSwESSsSwESSHSz...k...........',
    '...............zSHSSEESSsSEESSHSz...............',
    '................sDDCSSSSsSSSCDDs................',
    '................DdDDSMSzzSSSDDDD................',
    '................DdDDDSnmmnSDdDDD................',
    '................DDgDDDSSSSDDdDDD................',
    '................DDDdDDDgDDDDDDDD................',
    '.................KDzzzDgDdDgDdK.................',
    '..................zSSSzDDdDDDK..................',
    '..................zSSSzDgDDDD...................',
    '.................KcSSzDDDDD.....................',
    '.............KKKKrccJKccccYYYKK.KKK.............',
    '............KrrrKrccKYYyyYYYYJJKrrrK............',
    '............KrJJrJJJKLecccLYYJJKrJJK............',
    '............KrJJJJJKJLLccLLJoJJKrJJK............',
    '............KrJJJJJKJJLLLLJJOJJKrJJK............',
    '............KrJJJJKJJJJJKJJJJJJKrJJK............',
    '............KrJJJKJJJJJaKJJJJJJKrJJK............',
    '............KrJJJKJJJJJJKJJJJJJKrccK............',
    '.............KrJKrJJJJJJKJJJJJJKrccK............',
    '..............KKKrJJJJJaKJJJJJJKzSSz............',
    '.................KrJJJJJKJJJJJKzSSSSz...........',
    '.................KrJJJJJKJJJJJK.zSSz............',
    '.................KrJJJJQQJJJJJK..zz.............',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  clipboard: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KTttTTTTTTTK..................',
    '..................KTTTTTTTTTTK..................',
    '..............KAaaaaaAAAAAAAAAAAAK..............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH...............',
    '...............HHHHSSSSSSSSSSHHHH...............',
    '................hHSBBBSSSSBBBSHH................',
    '................zHSsssSSSSsssSHz................',
    '...............zSHSSwESSsSwESSHSz...............',
    '...............zSHSSEESSsSEESSHSz...............',
    '................sDDCSSSSsSSSCDDs................',
    '................DdDDSMSzzSSSDDDD................',
    '................DdDDDSnmmnSDdDDD................',
    '................DDgDDDSSSSDDdDDD................',
    '................DDDdDDDgDDDDDDDD................',
    '.................KDdDDDgDdDgDdK.................',
    '..................KDDdDDDdDDDK..................',
    '...................DDdDDgDDDD...................',
    '.....................DDDDDD.....................',
    '.............KKK.KKYYYcGGcYYYKK.KKK.............',
    '............KrrrKJJYYYGGGGYYYJJKrrrK............',
    '............KrJJKrJUUUGGGGUUUJJKrJJK............',
    '............KrJJKrJUcccOccccUzKKrJJK............',
    '............KrJJKrJUccccccccUScrJJJK............',
    '............KrJJKrJUceeeeeecSzcJJJJK............',
    '............KrJJrKzUccccccccSzcJJJJK............',
    '............KrJJccSUceeeeeecUzKKKKK.............',
    '.............KrJcczSccccccccUJJK................',
    '..............KKrczSceeeeeecUJJK................',
    '................KKzUccccccccUJK.................',
    '.................KrUceeeecccUJK.................',
    '.................KrUccccccccUJK.................',
    '.................KrUUUUUUUUUUJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  thumbs: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KTttTTTTTTTK..................',
    '..................KTTTTTTTTTTK..................',
    '..............KAaaaaaAAAAAAAAAAAAK..............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH...............',
    '...............HHHHSSSSSSSSSSHHHH...............',
    '................hHSBBBSSSSBBBSHH................',
    '................zHSsssSSSSsssSHz................',
    '...............zSHSSwESSsSEESSHSz...............',
    '...............zSHSSEESSsESSESHSz...............',
    '................sDDCSSSSsSSSCDDs................',
    '................DdDDSMSzzSSSDDDD................',
    '................DdDDDSnmmnSDdDDD................',
    '................DDgDDDSSSSDDdDDD................',
    '................DDDdDDDgDDDDDDDD...........V....',
    '.................KDdDDDgDdDgDdK............V....',
    '..................KDDdDDDdDDDK...........VVWVV..',
    '...................DDdDDgDDDD........zz....V....',
    '.....................DDDDDD.........zSSz...V....',
    '.............KKK.KKYYYccccYYYKK.KKK.zSSz........',
    '............KrrrKJJYYYYyyYYYYJJKrrrKzSSzzz......',
    '............KrJJKrJYYLecccLYYJJKrJJKzSSSSSz.....',
    '............KrJJKrJJJLLccLLJoJJKrJJrzsSsSSz.....',
    '............KrJJKrJJJJLLLLJJOJJKKrJJzSSSSSz.....',
    '............KrJJKrJJJJJJKJJJJJJKKrJJrzzzzz......',
    '............KrJJKrJJJJJaKJJJJJJK.KrJJccK........',
    '............KccJKrJJJJJJKJJJJJJK..KrJJK.........',
    '............KccJKrJJJJJJKJJJJJJK...KKK..........',
    '............zSSzKrJJJJJaKJJJJJJK................',
    '...........zSSSSzKrJJJJJKJJJJJK.................',
    '............zSSz.KrJJJJJKJJJJJK.................',
    '.............zz..KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  cheer: [
    '................................................',
    '..................KKKKKKKKKKKK..........O.......',
    '..................KAaaAAAAAAAK..................',
    '..............T...KAaaAAAAAAAK...VV.............',
    '..............T...KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '.....OO...........KAaAAAAAAAAK............T.....',
    '..................KTttTTTTTTTK.............T....',
    '..................KTTTTTTTTTTK..................',
    '..............KAaaaaaAAAAAAAAAAAAK..............',
    '...............KKKKKKKKKKKKKKKKKK...............',
    '...............HHhssssssssssssHHH...............',
    '...V...........HHHHSSSSSSSSSSHHHH............O..',
    '........zzz.....hHSBBBSSSSBBBSHH.....zzz.....O..',
    '.......zSSSz....zHSsssSSSSsssSHz....zSSSz.......',
    '.......zSSSz...zSHSSEESSsSEESSHSz...zSSSz.......',
    '.......zSSSz...zSHSESSESsESSESHSz...zSSSz.......',
    '.......KcccK....sDDCSSSSsSSSCDDs....KcccK.......',
    '.......KcccK....DdDDSMSzzSSSDDDD....KcccK.......',
    '.......KrJJrK...DdDDDSmmmmSDdDDD...KrJJJK.......',
    '....V...KrJJK...DDgDDDSqqSDDdDDD...KrJJK....O...',
    '...VVV..KrJJK...DDDdDDDgDDDDDDDD...KrJJK...OOO..',
    '....V...KrJJK....KDdDDDgDdDgDdK....KrJJK....O...',
    '.........KrJrK....KDDdDDDdDDDK....KrJJK.........',
    '.........KrJJrK....DDdDDgDDDD....KrJJJK.........',
    '..........KrJJK......DDDDDD......KrJJK..........',
    '..........KrJJrK.KKYYYccccYYYKK.KrJJJK..........',
    '...........KrJJrKJJYYYYyyYYYYJJKrJJJK...........',
    '............KrJJKrJYYLecccLYYJJKrJJK............',
    '............KrJJKrJJJLLccLLJoJJKrJJK............',
    '.............KKKKrJJJJLLLLJJOJJKKKK.............',
    '................KrJJJJJJKJJJJJJK................',
    '................KrJJJJJaKJJJJJJK................',
    '................KrJJJJJJKJJJJJJK................',
    '................KrJJJJJJKJJJJJJK................',
    '................KrJJJJJaKJJJJJJK................',
    '.................KrJJJJJKJJJJJK.................',
    '.................KrJJJJJKJJJJJK.................',
    '.................KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  pointup: [
    '................................................',
    '..................KKKKKKKKKKKK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaaAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KAaAAAAAAAAK..................',
    '..................KTttTTTTTTTK..................',
    '..................KTTTTTTTTTTK..................',
    '..............KAaaaaaAAAAAAAAAAAAK..............',
    '...............KKKKKKKKKKKKKKKKKK.O.....O.......',
    '...............HHhssssssssssssHHH..O...O........',
    '...............HHHHSSSSSSSSSSHHHH...............',
    '................hHSBBBSSSSBBBSHH.........OO.....',
    '................zHSsssSSSSsssSHz.....z..........',
    '...............zSHSSwESSsSwESSHSz...zSz.........',
    '...............zSHSSEESSsSEESSHSz...zSz.........',
    '................sDDCSSSSsSSSCDDs....zSz.........',
    '................DdDDSMSzzSSSDDDD....zSz.........',
    '................DdDDDSmmmmSDdDDD....zSzz........',
    '................DDgDDDSqqSDDdDDD....zSSSz.......',
    '................DDDdDDDgDDDDDDDD....zSSSz.......',
    '.................KDdDDDgDdDgDdK.....zsSsz.......',
    '..................KDDdDDDdDDDK......Kzzz........',
    '...................DDdDDgDDDD......KrccK........',
    '.....................DDDDDD........KrccK........',
    '.............KKK.KKYYYccccYYYKK.KKKKrJJK........',
    '............KrrrKJJYYYYyyYYYYJJKrrrKrJJK........',
    '............KrJJKrJYYLecccLYYJJKrJJrJJJK........',
    '............KrJJKrJJJLLccLLJoJJKrJJJJJJK........',
    '............KrJJKrJJJJLLLLJJOJJKKKrJJJJK........',
    '............KrJJKrJJJJJJKJJJJJJK..KrJJJK........',
    '............KrJJKrJJJJJaKJJJJJJK...KKrK.........',
    '............KccJKrJJJJJJKJJJJJJK.....K..........',
    '............KccJKrJJJJJJKJJJJJJK................',
    '............zSSzKrJJJJJaKJJJJJJK................',
    '...........zSSSSzKrJJJJJKJJJJJK.................',
    '............zSSz.KrJJJJJKJJJJJK.................',
    '.............zz..KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ],
  ponder: [
    '................................................',
    '..................KKKKKKKKKKKK..........kkkk....',
    '..................KAaaAAAAAAAK.........kWWWWk...',
    '..................KAaaAAAAAAAK........kWWWWWWk..',
    '..................KAaAAAAAAAAK........kWWWWWWk..',
    '..................KAaAAAAAAAAK.......kWWWWWWWWk.',
    '..................KAaAAAAAAAAK........kWkWkWkk..',
    '..................KTttTTTTTTTK........kWWWWWWk..',
    '..................KTTTTTTTTTTK.........kWWWWk...',
    '..............KAaaaaaAAAAAAAAAAAAK...kk.kkkk....',
    '...............KKKKKKKKKKKKKKKKKK...kWWk........',
    '...............HHhssssssssssssHHH...kWWk........',
    '...............HHHHSSSSSSSSSSHHHH....kk.........',
    '................hHSBBBSSSSBBBSHH...k............',
    '................zHSsssSSSSsssSHz..kWk...........',
    '...............zSHSSwESSsSwESSHSz..k............',
    '...............zSHSSEESSsSEESSHSz...............',
    '................sDDCSSSSsSSSCDDs................',
    '................DdDDSMSzzSSSDDDD................',
    '................DdDDDSnmmnSDdDDD................',
    '................DDgDDDSSSSDDdDDD................',
    '................DDDdDDDgDDDDDDDD................',
    '.................KDdDDDgDdDgDdK.................',
    '..................KDDdDDDdDDDK..................',
    '...................DDdDDgDDDD...................',
    '.....................DDDDDD.....................',
    '.............KKK.KKYYYccccYYYKK.KKK.............',
    '............KrrrKJJYYYYyyYYYYJJKrrrK............',
    '............KrJJKrJYYLecccLYYJJKrJJK............',
    '............KrJJKKKKKKKKKKKKKzzKrJJK............',
    '............KrJJrrrrrrrrrrrrrSSzrJJK............',
    '............KrJJJJJJJJJJJJJJJSSzrJJK............',
    '.............KrJzJJJJJJJJJJJJSSzrJJK............',
    '..............KzSzKKKKKKKKKKKzzrJJJK............',
    '..............zSSSzJJJJJJJJJJJJJJJJK............',
    '..............zSSSzJJJJJJJJJJJJJJJJK............',
    '...............zzzrJJJJJJJJJJJJJJJK.............',
    '.................KKKKKKKKKKKKKKKKK..............',
    '.................KrJJJJQQJJJJJK.................',
    '.................KrJJJKPPKJJJJK.................',
    '.................KKKKKKQQKKKKKK.................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................QpPPQ..QpPPQ..................',
    '..................FfFF....FfFF..................',
    '.................FfFFFF..FfFFFF.................',
    '..................QQQQQ...QQQQQ.................',
    '................xxxxxxxxxxxxxxxx................'
  ]
}



// Abe holding a heart up in his right hand: the head from "point" on the body from
// "thumbs", with the thumb swapped for the heart.
const HEART = [
  '..KKK...KKK..',
  '.KXXXK.KXXXK.',
  'KXZZXXKXXXXXK',
  'KXZXXXXXXXXXK',
  'KXXXXXXXXXXXK',
  '.KXXXXXXXXXK.',
  '..KXXXXXXXK..',
  '...KXXXXXK...',
  '....KXXXK....',
  '.....KXK.....',
  '......K......'
]

// Paint `art` onto a copy of `rows` with its top-left at (x0, y0). '.' in `art` leaves the pixel alone
// unless `opaque` is set, in which case the whole string is written as-is (used to swap face rows).
function paint(rows: string[], x0: number, y0: number, art: string[], opaque = false) {
  art.forEach((line, dy) => {
    const row = rows[y0 + dy].split('')
    line.split('').forEach((c, dx) => { if (opaque || c !== '.') row[x0 + dx] = c })
    rows[y0 + dy] = row.join('')
  })
  return rows
}

function heart() {
  const rows = [...DRAWN.point.slice(0, 26), ...DRAWN.thumbs.slice(26)]
  rows[26] = rows[26].slice(0, 36) + '.'.repeat(12)
  return paint(rows, 40 - Math.floor(HEART[0].length / 2), 26 - HEART.length + 1, HEART)
}

// Shocked: the cheer pose's raised hands with raised brows, wide eyes, an "O" mouth and two "!" marks.
function shocked() {
  // Drop cheer's confetti (sparkles, plus orange and burgundy dots away from the body).
  const rows = DRAWN.cheer.map((row) => row.split('').map((c, x) =>
    c === 'V' || ((c === 'O' || c === 'T') && (x < 15 || x > 33)) ? '.' : c).join(''))
  paint(rows, 15, 12, ['HHHHBBBSSSSBBBHHHH'], true)
  paint(rows, 16, 13, ['hHSzzzSSSSzzzSHH', 'zHSWWWSSSSWWWSHz'], true)
  paint(rows, 15, 15, ['zSHSWEWSSsSWEWSHSz', 'zSHSWWWSSsSWWWSHSz'], true)
  paint(rows, 16, 19, ['DdDDDSmqqmSDdDDD', 'DDgDDDmqqmDDdDDD'], true)
  const bang = ['T', 'T', 'T', 'T', 'T', '.', 'T']
  paint(rows, 37, 2, bang)
  return paint(rows, 40, 3, bang)
}

// Peeking over the top of something: just the head, eyes down, with both hands gripping the edge
// at rows 23–26. Everything below is transparent, so it can sit on top of the easel.
function peek() {
  const rows = [...DRAWN.point.slice(0, 26), ...Array.from({ length: 22 }, () => '.'.repeat(48))]
  paint(rows, 15, 15, ['zSHSSwwSSsSwwSSHSz'], true)
  const hand = ['.zzzz.', 'zSSSSz', 'zSsSsz', 'zSSSSz']
  paint(rows, 10, 23, hand)
  return paint(rows, 32, 23, hand)
}

const POSES: Record<PoseName, string[]> = { ...DRAWN, heart: heart(), shocked: shocked(), peek: peek() }

const RECTS = Object.fromEntries(Object.entries(POSES).map(([name, rows]) => [name, toRects(rows)])) as Record<PoseName, ReturnType<typeof toRects>>

export function GuidePose({ name, size = 144, className }: { name: PoseName; size?: number; className?: string }) {
  return (
    <svg
      className={'guide-pose guide-pose--' + name + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 48 48"
      shapeRendering="crispEdges" aria-hidden="true"
    >
      {RECTS[name].map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
    </svg>
  )
}

// The thinking pose split into layers so the chat can animate it: Abe on his own,
// and his three thought clouds (small to big) as separate sprites.
const THINK_BODY = [
  '................................................',
  '..................KKKKKKKKKKKK..................',
  '..................KAaaAAAAAAAK..................',
  '..................KAaaAAAAAAAK..................',
  '..................KAaAAAAAAAAK..................',
  '..................KAaAAAAAAAAK..................',
  '..................KAaAAAAAAAAK..................',
  '..................KTttTTTTTTTK..................',
  '..................KTTTTTTTTTTK..................',
  '..............KAaaaaaAAAAAAAAAAAAK..............',
  '...............KKKKKKKKKKKKKKKKKK...............',
  '...............HHhssssssssssssHHH...............',
  '...............HHHHSSSSSSSSSSHHHH...............',
  '................hHSBBBSSSSBBBSHH................',
  '................zHSsssSSSSsssSHz................',
  '...............zSHSSwESSsSwESSHSz...............',
  '...............zSHSSEESSsSEESSHSz...............',
  '................sDDCSSSSsSSSCDDs................',
  '................DdDDSMSzzSSSDDDD................',
  '................DdDDDSnmmnSDdDDD................',
  '................DDgDDDSSSSDDdDDD................',
  '................DDDdDDDgDDDDDDDD................',
  '.................KDzzzDgDdDgDdK.................',
  '..................zSSSzDDdDDDK..................',
  '..................zSSSzDgDDDD...................',
  '.................KcSSzDDDDD.....................',
  '.............KKKKrccJKccccYYYKK.KKK.............',
  '............KrrrKrccKYYyyYYYYJJKrrrK............',
  '............KrJJrJJJKLecccLYYJJKrJJK............',
  '............KrJJJJJKJLLccLLJoJJKrJJK............',
  '............KrJJJJJKJJLLLLJJOJJKrJJK............',
  '............KrJJJJKJJJJJKJJJJJJKrJJK............',
  '............KrJJJKJJJJJaKJJJJJJKrJJK............',
  '............KrJJJKJJJJJJKJJJJJJKrccK............',
  '.............KrJKrJJJJJJKJJJJJJKrccK............',
  '..............KKKrJJJJJaKJJJJJJKzSSz............',
  '.................KrJJJJJKJJJJJKzSSSSz...........',
  '.................KrJJJJJKJJJJJK.zSSz............',
  '.................KrJJJJQQJJJJJK..zz.............',
  '.................KrJJJKPPKJJJJK.................',
  '.................KKKKKKQQKKKKKK.................',
  '..................QpPPQ..QpPPQ..................',
  '..................QpPPQ..QpPPQ..................',
  '..................QpPPQ..QpPPQ..................',
  '..................FfFF....FfFF..................',
  '.................FfFFFF..FfFFFF.................',
  '..................QQQQQ...QQQQQ.................',
  '................xxxxxxxxxxxxxxxx................'
]
const CLOUDS = [
  { x: 35, y: 13, rows: ['.k.', 'kWk', '.k.'] },
  { x: 37, y: 9, rows: ['.kk.', 'kWWk', 'kWWk', '.kk.'] },
  { x: 39, y: 2, rows: ['...kk...', '..kWWk..', '.kWWWWk.', 'kWWWWWWk', 'kWWWWWWk', '.kWWWWk.', '..kkkk..'] }
]
const THINK_RECTS = toRects(THINK_BODY)
const CLOUD_RECTS = CLOUDS.map((c) => ({ ...c, rects: toRects(c.rows) }))

export function ThinkingAbe({ size = 240, className }: { size?: number; className?: string }) {
  return (
    <svg
      className={'thinking-abe' + (className ? ' ' + className : '')} width={size} height={size} viewBox="0 0 48 48"
      shapeRendering="crispEdges" aria-hidden="true"
    >
      <g className="thinking-abe__body">
        {THINK_RECTS.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}
      </g>
      {CLOUD_RECTS.map((c, n) => (
        <g key={n} className={'thinking-abe__cloud thinking-abe__cloud--' + (n + 1)} transform={`translate(${c.x} ${c.y})`}>
          <g>{c.rects.map((r, i) => <rect key={i} x={r.x} y={r.y} width={r.w} height={1} fill={r.fill} />)}</g>
        </g>
      ))}
    </svg>
  )
}
