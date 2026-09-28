export type BroadcastMode = 'COMPACT'|'LOWER_THIRD'|'SIDE_PANEL'|'FULL_SCREEN';
export type BroadcastOutput = 'PREVIEW'|'PROGRAM';
export type BroadcastLayer = 1|2|3|4|5|6;

export type BroadcastGraphicId =
  | 'MATCH_INTRO'|'VERSUS'|'TOSS'|'PLAYING_XI'|'SIDE_BY_SIDE_TEAMS'|'MATCH_CONDITIONS'
  | 'LOWER_THIRD'|'BATTER_INTRO'|'BOWLER_INTRO'|'PLAYER_STATS'|'PLAYER_COMPARISON'
  | 'FOUR'|'SIX'|'WICKET'|'DISMISSAL'|'FIFTY'|'CENTURY'|'MILESTONE'|'FIVE_WICKETS'|'HAT_TRICK'|'MAIDEN_OVER'
  | 'FREE_HIT'|'POWERPLAY'|'END_OF_OVER'|'PARTNERSHIP'|'FALL_OF_WICKET'|'TARGET'|'CHASE_EQUATION'|'LAST_FIVE_OVERS'|'PROJECTED_SCORE'|'CHASE_PRESSURE'
  | 'BATTING_SCORECARD'|'BOWLING_SCORECARD'|'FULL_INNINGS_SCORECARD'
  | 'WORM'|'RUN_RATE_GRAPH'|'PARTNERSHIP_GRAPH'|'BOUNDARY_MAP'|'WAGON_WHEEL'|'BOWLING_PITCH_MAP'
  | 'TEAM_COMPARISON'|'HEAD_TO_HEAD'|'STANDINGS'|'TOP_RUN_SCORERS'|'TOP_WICKET_TAKERS'|'MOST_SIXES'|'BEST_STRIKE_RATE'|'BEST_ECONOMY'
  | 'INNINGS_BREAK'|'MATCH_RESULT'|'PLAYER_OF_MATCH'|'TOURNAMENT_AWARD'|'CHAMPIONS'
  | 'HOLDING'|'SPONSOR'|'REPLAY'|'CAMERA_ID'|'LIVE_ID'|'RECORD'
  | 'TEAM_STATS'|'TOURNAMENT_STATS'|'UPCOMING_MATCH'|'MATCH_SCHEDULE'|'SOCIAL'|'QR_PROMO'
  | 'TRANSITION'|'CLEAR_LAYER';

export type BroadcastTemplateFamily =
  | 'MATCH_BOARD'
  | 'LOWER_THIRD'
  | 'PLAYER_FEATURE'
  | 'EVENT_IMPACT'
  | 'INFO_TAKEOVER'
  | 'SCORECARD'
  | 'ANALYTICS'
  | 'LEADERBOARD'
  | 'RESULT_AWARD'
  | 'HOLDING'
  | 'UTILITY';

export type BroadcastGraphicDefinition = Readonly<{
  id: BroadcastGraphicId;
  label: string;
  family: BroadcastTemplateFamily;
  layer: BroadcastLayer;
  modes: readonly BroadcastMode[];
  defaultMode: BroadcastMode;
  defaultDurationMs: number | null;
  priority: number;
  hidesScorebar: boolean;
}>;

const D = (
  id: BroadcastGraphicId,
  label: string,
  family: BroadcastTemplateFamily,
  layer: BroadcastLayer,
  modes: readonly BroadcastMode[],
  defaultMode: BroadcastMode,
  defaultDurationMs: number|null,
  priority: number,
  hidesScorebar=false,
): BroadcastGraphicDefinition => ({id,label,family,layer,modes,defaultMode,defaultDurationMs,priority,hidesScorebar});

export const BROADCAST_GRAPHICS: readonly BroadcastGraphicDefinition[] = [
  D('MATCH_INTRO','Match intro','MATCH_BOARD',4,['FULL_SCREEN'],'FULL_SCREEN',9000,92,true),
  D('VERSUS','Versus','MATCH_BOARD',4,['FULL_SCREEN','COMPACT'],'FULL_SCREEN',6500,88,true),
  D('TOSS','Toss','MATCH_BOARD',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',7000,82,true),
  D('PLAYING_XI','Playing XI','MATCH_BOARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',12000,78,true),
  D('SIDE_BY_SIDE_TEAMS','Teams side-by-side','MATCH_BOARD',4,['FULL_SCREEN'],'FULL_SCREEN',10000,78,true),
  D('MATCH_CONDITIONS','Match conditions','MATCH_BOARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',9000,70,true),

  D('LOWER_THIRD','Lower third','LOWER_THIRD',2,['LOWER_THIRD','COMPACT'],'LOWER_THIRD',6500,48),
  D('BATTER_INTRO','Batter intro','PLAYER_FEATURE',3,['FULL_SCREEN','LOWER_THIRD','SIDE_PANEL'],'LOWER_THIRD',7000,66),
  D('BOWLER_INTRO','Bowler intro','PLAYER_FEATURE',3,['FULL_SCREEN','LOWER_THIRD','SIDE_PANEL'],'LOWER_THIRD',7000,66),
  D('PLAYER_STATS','Player stats','PLAYER_FEATURE',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',9000,64,true),
  D('PLAYER_COMPARISON','Player comparison','PLAYER_FEATURE',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',9000,64,true),

  D('FOUR','Four','EVENT_IMPACT',3,['FULL_SCREEN','LOWER_THIRD','COMPACT'],'COMPACT',2600,72),
  D('SIX','Six','EVENT_IMPACT',3,['FULL_SCREEN','LOWER_THIRD','COMPACT'],'FULL_SCREEN',3200,78),
  D('WICKET','Wicket','EVENT_IMPACT',4,['FULL_SCREEN','LOWER_THIRD','COMPACT'],'FULL_SCREEN',4200,96,true),
  D('DISMISSAL','Dismissal','PLAYER_FEATURE',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',7000,82,true),
  D('FIFTY','Fifty','EVENT_IMPACT',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',5200,82,true),
  D('CENTURY','Century','EVENT_IMPACT',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',6500,90,true),
  D('MILESTONE','Milestone','EVENT_IMPACT',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',6000,84,true),
  D('FIVE_WICKETS','Five wickets','EVENT_IMPACT',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',6200,88,true),
  D('HAT_TRICK','Hat-trick','EVENT_IMPACT',4,['FULL_SCREEN'],'FULL_SCREEN',6200,92,true),
  D('MAIDEN_OVER','Maiden over','INFO_TAKEOVER',3,['COMPACT','LOWER_THIRD'],'COMPACT',3200,56),

  D('FREE_HIT','Free hit','INFO_TAKEOVER',3,['COMPACT'],'COMPACT',null,62),
  D('POWERPLAY','Powerplay','INFO_TAKEOVER',3,['COMPACT','LOWER_THIRD'],'COMPACT',4500,56),
  D('END_OF_OVER','End of over','INFO_TAKEOVER',3,['LOWER_THIRD','COMPACT'],'LOWER_THIRD',5200,58),
  D('PARTNERSHIP','Partnership','INFO_TAKEOVER',3,['LOWER_THIRD','SIDE_PANEL'],'LOWER_THIRD',6500,52),
  D('FALL_OF_WICKET','Fall of wicket','INFO_TAKEOVER',3,['LOWER_THIRD','SIDE_PANEL'],'LOWER_THIRD',6500,58),
  D('TARGET','Target','INFO_TAKEOVER',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',6000,80,true),
  D('CHASE_EQUATION','Chase equation','INFO_TAKEOVER',3,['LOWER_THIRD','COMPACT'],'LOWER_THIRD',5000,60),
  D('LAST_FIVE_OVERS','Last five overs','INFO_TAKEOVER',3,['LOWER_THIRD','SIDE_PANEL'],'LOWER_THIRD',6500,54),
  D('PROJECTED_SCORE','Projected score','INFO_TAKEOVER',3,['LOWER_THIRD','SIDE_PANEL'],'LOWER_THIRD',6500,50),
  D('CHASE_PRESSURE','Chase pressure','ANALYTICS',4,['FULL_SCREEN','SIDE_PANEL'],'SIDE_PANEL',7500,58,true),

  D('BATTING_SCORECARD','Batting scorecard','SCORECARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',12000,74,true),
  D('BOWLING_SCORECARD','Bowling scorecard','SCORECARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',12000,74,true),
  D('FULL_INNINGS_SCORECARD','Full innings scorecard','SCORECARD',4,['FULL_SCREEN'],'FULL_SCREEN',15000,78,true),

  D('WORM','Worm','ANALYTICS',4,['FULL_SCREEN'],'FULL_SCREEN',10000,62,true),
  D('RUN_RATE_GRAPH','Run rate graph','ANALYTICS',4,['FULL_SCREEN'],'FULL_SCREEN',10000,62,true),
  D('PARTNERSHIP_GRAPH','Partnership graph','ANALYTICS',4,['FULL_SCREEN'],'FULL_SCREEN',9000,58,true),
  D('BOUNDARY_MAP','Boundary map','ANALYTICS',4,['FULL_SCREEN'],'FULL_SCREEN',9000,58,true),
  D('WAGON_WHEEL','Wagon wheel','ANALYTICS',4,['FULL_SCREEN'],'FULL_SCREEN',9000,62,true),
  D('BOWLING_PITCH_MAP','Bowling pitch map','ANALYTICS',4,['FULL_SCREEN'],'FULL_SCREEN',9000,62,true),

  D('TEAM_COMPARISON','Team comparison','ANALYTICS',4,['FULL_SCREEN'],'FULL_SCREEN',9000,60,true),
  D('HEAD_TO_HEAD','Head-to-head','ANALYTICS',4,['FULL_SCREEN'],'FULL_SCREEN',9000,60,true),
  D('STANDINGS','Standings','LEADERBOARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',12000,62,true),
  D('TOP_RUN_SCORERS','Top run scorers','LEADERBOARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',10000,58,true),
  D('TOP_WICKET_TAKERS','Top wicket takers','LEADERBOARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',10000,58,true),
  D('MOST_SIXES','Most sixes','LEADERBOARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',9000,54,true),
  D('BEST_STRIKE_RATE','Best strike rate','LEADERBOARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',9000,54,true),
  D('BEST_ECONOMY','Best economy','LEADERBOARD',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',9000,54,true),

  D('INNINGS_BREAK','Innings break','RESULT_AWARD',4,['FULL_SCREEN'],'FULL_SCREEN',null,84,true),
  D('MATCH_RESULT','Match result','RESULT_AWARD',4,['FULL_SCREEN'],'FULL_SCREEN',9000,94,true),
  D('PLAYER_OF_MATCH','Player of the match','RESULT_AWARD',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',10000,88,true),
  D('TOURNAMENT_AWARD','Tournament award','RESULT_AWARD',4,['FULL_SCREEN'],'FULL_SCREEN',10000,88,true),
  D('CHAMPIONS','Champions','RESULT_AWARD',4,['FULL_SCREEN'],'FULL_SCREEN',null,100,true),

  D('HOLDING','Holding graphic','HOLDING',4,['FULL_SCREEN'],'FULL_SCREEN',null,76,true),
  D('SPONSOR','Sponsor','UTILITY',6,['FULL_SCREEN','LOWER_THIRD','COMPACT'],'COMPACT',5000,46),
  D('REPLAY','Replay','UTILITY',5,['FULL_SCREEN','COMPACT'],'FULL_SCREEN',1800,98,true),
  D('CAMERA_ID','Camera ID','UTILITY',2,['COMPACT'],'COMPACT',2500,28),
  D('LIVE_ID','Live ID','UTILITY',6,['COMPACT'],'COMPACT',null,22),
  D('RECORD','Record','RESULT_AWARD',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',7000,86,true),
  D('TEAM_STATS','Team statistics','ANALYTICS',4,['FULL_SCREEN','SIDE_PANEL'],'FULL_SCREEN',9000,58,true),
  D('TOURNAMENT_STATS','Tournament statistics','ANALYTICS',4,['FULL_SCREEN'],'FULL_SCREEN',10000,58,true),
  D('UPCOMING_MATCH','Upcoming match','MATCH_BOARD',4,['FULL_SCREEN','LOWER_THIRD'],'FULL_SCREEN',8000,60,true),
  D('MATCH_SCHEDULE','Match schedule','MATCH_BOARD',4,['FULL_SCREEN'],'FULL_SCREEN',12000,56,true),
  D('SOCIAL','Follow IPS','UTILITY',2,['LOWER_THIRD','COMPACT'],'COMPACT',6000,26),
  D('QR_PROMO','QR / digital promotion','UTILITY',3,['SIDE_PANEL','LOWER_THIRD'],'SIDE_PANEL',9000,30),
  D('TRANSITION','Transition','UTILITY',5,['FULL_SCREEN'],'FULL_SCREEN',1200,99,true),
  D('CLEAR_LAYER','Clear layer','UTILITY',5,['COMPACT'],'COMPACT',0,101),
] as const;

export const broadcastGraphic = (id: BroadcastGraphicId) =>
  BROADCAST_GRAPHICS.find(item=>item.id===id) ?? null;

export const broadcastCategories = [
  {id:'MATCH',label:'Match',graphics:['MATCH_INTRO','VERSUS','TOSS','PLAYING_XI','MATCH_CONDITIONS','TARGET','UPCOMING_MATCH','MATCH_SCHEDULE']},
  {id:'PLAYERS',label:'Players',graphics:['LOWER_THIRD','BATTER_INTRO','BOWLER_INTRO','PLAYER_STATS','PLAYER_COMPARISON','DISMISSAL']},
  {id:'EVENTS',label:'Events',graphics:['FOUR','SIX','WICKET','FIFTY','CENTURY','FIVE_WICKETS','HAT_TRICK','MAIDEN_OVER','RECORD']},
  {id:'LIVE',label:'Live info',graphics:['FREE_HIT','POWERPLAY','END_OF_OVER','PARTNERSHIP','FALL_OF_WICKET','CHASE_EQUATION','LAST_FIVE_OVERS','PROJECTED_SCORE','CHASE_PRESSURE']},
  {id:'CARDS',label:'Scorecards',graphics:['BATTING_SCORECARD','BOWLING_SCORECARD','FULL_INNINGS_SCORECARD']},
  {id:'ANALYTICS',label:'Analytics',graphics:['WORM','RUN_RATE_GRAPH','PARTNERSHIP_GRAPH','BOUNDARY_MAP','WAGON_WHEEL','BOWLING_PITCH_MAP','TEAM_COMPARISON','HEAD_TO_HEAD']},
  {id:'TOURNAMENT',label:'Tournament',graphics:['STANDINGS','TOP_RUN_SCORERS','TOP_WICKET_TAKERS','MOST_SIXES','BEST_STRIKE_RATE','BEST_ECONOMY','TEAM_STATS','TOURNAMENT_STATS']},
  {id:'RESULTS',label:'Results & awards',graphics:['INNINGS_BREAK','MATCH_RESULT','PLAYER_OF_MATCH','TOURNAMENT_AWARD','CHAMPIONS']},
  {id:'PRODUCTION',label:'Production',graphics:['HOLDING','SPONSOR','REPLAY','CAMERA_ID','LIVE_ID','SOCIAL','QR_PROMO','TRANSITION']},
] as const;

export const broadcastTheme = {
  name:'IPS Signal Frame',
  palette:{
    ink:'#090B10',
    inkRaised:'#121620',
    panel:'#171C27',
    paper:'#F5F7FA',
    muted:'#9AA3B2',
    hairline:'rgba(245,247,250,.16)',
    master:'#6D5CFF',
    masterSoft:'#A99DFF',
    alert:'#F04F64',
    warning:'#FFB84A',
  },
  geometry:{
    cut:'8px',
    radius:'2px',
    hairline:'1px',
  },
  motion:{
    microInMs:180,
    lowerThirdInMs:260,
    fullFrameInMs:380,
    eventInMs:220,
    outMs:220,
    wipeAngleDeg:6,
  },
  safeArea:{
    xPercent:4,
    topPercent:4,
    bottomPercent:5,
  },
} as const;
