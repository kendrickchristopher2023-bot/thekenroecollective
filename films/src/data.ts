import timelineJson from "./timeline.json";

export type FilmKey = "celebrations" | "workroom" | "application-kit";
export type Cut = "horizontal" | "vertical";
export type Line = { id:string; text:string; file:string; start:number; duration:number; captionEnd:number; sceneEnd:number; breathAfter:number; wpm:number; scene:string };
export type Crop = { x:number; y:number; scale:number };
export type Scene = { lineId:string; file?:string; portraitFile?:string; image?:string; leadImage?:string; leadImageSeconds?:number; leadImageVerticalOnly?:boolean; start?:number; from?:number; portraitFrom?:number; fit?:"cover"|"contain"; crop?:{horizontal?:Crop;vertical?:Crop}; card?:{width:number;verticalWidth:number;verticalImage?:string}; verticalCardImage?:string; label?:string; hideLabelVertical?:boolean };
export type FilmData = { key:FilmKey; title:string; duration:number; bed:string; lines:Line[]; scenes:Scene[]; status?:string; actions:string[] };
export const DISCLOSURE = "All people, names and details shown are fictional.";
const all = timelineJson.lines as Line[];
const lines = (prefix:string) => all.filter((line)=>line.id.startsWith(prefix));

export const FILMS: Record<FilmKey, FilmData> = {
  celebrations: {
    key:"celebrations", title:"Celebrations", duration:timelineJson.filmDurations.c, bed:"bed-celebrations.mp3", lines:lines("c"),
    scenes:[
      {lineId:"c01",file:"c-invite-1.mp4",from:0,fit:"cover"},
      {lineId:"c02",file:"c-invite-2.mp4",from:0,fit:"cover"},
      {lineId:"c03",file:"c-invite-3.mp4",from:0,fit:"cover"},
      {lineId:"c04",file:"c-live-host.webm",from:8.8,crop:{horizontal:{x:50,y:61,scale:1.2}},verticalCardImage:"footage/c-host-v.jpg",card:{width:0,verticalWidth:1000}},
      {lineId:"c05",file:"c-live-example.webm",from:7.5,fit:"cover"},
      {lineId:"c06",file:"c-live-wall.webm",from:7.0,leadImage:"footage/c-family-celebration.jpg",leadImageSeconds:2.35,verticalCardImage:"footage/c-wall-v.jpg",card:{width:0,verticalWidth:1000}},
      {lineId:"c07",image:"footage/print-live/cards.png",fit:"contain",crop:{vertical:{x:50,y:50,scale:1}}},
      {lineId:"c08",file:"c-groupcard.mp4",from:0,fit:"contain"},
      {lineId:"c09",file:"f1-studio.webm",from:6,image:"footage/c-studio-h.jpg",verticalCardImage:"footage/c-studio-v.jpg",card:{width:1200,verticalWidth:1000},label:"Kenroe Sound Studio | Coming soon"},
      {lineId:"c10"},
    ], actions:["See a finished example","Start your event"],
  },
  workroom: {
    key:"workroom", title:"The Workroom", duration:timelineJson.filmDurations.w, bed:"bed-workroom.mp3", lines:lines("w"),
    scenes:[
      {lineId:"w01",file:"f2-board.webm",from:8.83,crop:{horizontal:{x:50,y:74,scale:1.5}},verticalCardImage:"footage/w-cols-before.jpg",card:{width:0,verticalWidth:1000}},
      {lineId:"w02",file:"f2-board.webm",from:9.81,crop:{horizontal:{x:50,y:100,scale:1.5}},leadImage:"footage/w-cols-before.jpg",leadImageSeconds:1,leadImageVerticalOnly:true,verticalCardImage:"footage/w-cols-after.jpg",card:{width:1500,verticalWidth:1000}},

      {lineId:"w03",image:"footage/w-task.png",card:{width:640,verticalWidth:900}},
      {lineId:"w04",image:"footage/w-members.png",card:{width:760,verticalWidth:940}},
      {lineId:"w05",image:"footage/w-live.png",card:{width:1560,verticalWidth:1000,verticalImage:"footage/w-live-v.png"}},

      {lineId:"w06"},
    ], actions:["Plan the work","Move it forward"],
  },
  "application-kit": {
    key:"application-kit", title:"Application Kit", status:"Invite-only", duration:timelineJson.filmDurations.a, bed:"bed-application-kit.mp3", lines:lines("a"),
    scenes:[
      {lineId:"a01",file:"tailor_1920.mp4",portraitFile:"tailor_430.mp4",from:15,crop:{horizontal:{x:50,y:40,scale:1.65},vertical:{x:50,y:50,scale:1}}},
      {lineId:"a02",image:"footage/kit-filter-panel.jpg",card:{width:1500,verticalWidth:1000,verticalImage:"footage/kit-filter-panel-portrait.jpg"}},
      {lineId:"a03",file:"tailor_1920.mp4",portraitFile:"tailor_430.mp4",from:20,crop:{horizontal:{x:50,y:80,scale:1.5},vertical:{x:50,y:75,scale:1}}},
      {lineId:"a04",file:"tailor_1920.mp4",portraitFile:"tailor_430.mp4",from:24,portraitFrom:27.8,crop:{horizontal:{x:50,y:70,scale:1.55},vertical:{x:50,y:0,scale:1}}},
      {lineId:"a05",file:"tracker_1920.mp4",portraitFile:"tracker_430.mp4",from:20,portraitFrom:20,crop:{horizontal:{x:50,y:69,scale:1.5},vertical:{x:50,y:47,scale:1}}},
      {lineId:"a06",file:"applied_1920.mp4",portraitFile:"applied_430.mp4",from:7,crop:{horizontal:{x:50,y:72,scale:1.55},vertical:{x:50,y:68,scale:1}},label:"This only drafts text. You send it yourself.",hideLabelVertical:true},
      {lineId:"a07"},
    ], actions:["Your experience","Your words","Your decision"],
  },
};
