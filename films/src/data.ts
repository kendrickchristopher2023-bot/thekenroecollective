import timelineJson from "./timeline.json";

export type FilmKey = "celebrations" | "workroom" | "application-kit";
export type Cut = "horizontal" | "vertical";
export type Line = { id:string; text:string; file:string; start:number; duration:number; captionEnd:number; sceneEnd:number; breathAfter:number; wpm:number; scene:string };
export type Crop = { x:number; y:number; scale:number };
export type Scene = { lineId:string; file?:string; portraitFile?:string; image?:string; alternateImage?:string; from?:number; portraitFrom?:number; fit?:"cover"|"contain"; crop?:{horizontal?:Crop;vertical?:Crop}; card?:{width:number;verticalWidth:number;verticalImage?:string}; verticalCardImage?:string; label?:string; hideLabelVertical?:boolean };
export type FilmData = { key:FilmKey; title:string; duration:number; bed:string; lines:Line[]; scenes:Scene[]; status?:string; actions:string[] };
export const DISCLOSURE = "All people, names and details shown are fictional.";
const all = timelineJson.lines as Line[];
const lines = (prefix:string) => all.filter((line)=>line.id.startsWith(prefix));

export const FILMS: Record<FilmKey, FilmData> = {
  celebrations: {
    key:"celebrations", title:"Celebrations", duration:timelineJson.filmDurations.c, bed:"bed-celebrations.mp3", lines:lines("c"),
    scenes:[
      {lineId:"c01",file:"c-live-invite.webm",from:7.95,fit:"cover"},
      {lineId:"c02",file:"c-live-invite.webm",from:10.15,fit:"cover"},
      {lineId:"c03",file:"c-live-invite.webm",from:10.94,fit:"cover"},
      {lineId:"c04",file:"c-live-invite.webm",from:15.93,fit:"cover"},
      {lineId:"c05",file:"c-live-host.webm",from:8.8,crop:{horizontal:{x:50,y:61,scale:1.2}},verticalCardImage:"footage/c-host-v.png",card:{width:0,verticalWidth:1000}},
      {lineId:"c06",file:"c-live-example.webm",from:7.5,fit:"cover"},
      {lineId:"c07",file:"c-live-wall.webm",from:7.0,alternateImage:"footage/c-family-celebration.jpg",verticalCardImage:"footage/c-wall-v.jpg",card:{width:0,verticalWidth:1000}},
      {lineId:"c08",image:"footage/print-live/cards.png",fit:"contain",crop:{vertical:{x:50,y:50,scale:1}}},
      {lineId:"c09",file:"f1-ecard-reveal-crop.webm",from:5,fit:"cover"},
      {lineId:"c10",file:"f1-studio.webm",from:6,image:"footage/c-studio-h.png",verticalCardImage:"footage/c-studio-v.png",card:{width:1200,verticalWidth:1000},label:"Kenroe Sound Studio | Coming soon"},
      {lineId:"c11"},
    ], actions:["See a finished example","Start your event"],
  },
  workroom: {
    key:"workroom", title:"The Workroom", duration:timelineJson.filmDurations.w, bed:"bed-workroom.mp3", lines:lines("w"),
    scenes:[
      {lineId:"w01",file:"f2-board.webm",from:10.5,crop:{horizontal:{x:50,y:74,scale:1.5}},verticalCardImage:"footage/w-cols-before.png",card:{width:0,verticalWidth:1000}},
      {lineId:"w02",file:"f2-board.webm",from:15.22,crop:{horizontal:{x:50,y:100,scale:1.5}},verticalCardImage:"footage/w-cols-after.png",card:{width:0,verticalWidth:1000}},

      {lineId:"w03",image:"footage/w-task.png",card:{width:640,verticalWidth:900}},
      {lineId:"w04",image:"footage/w-members.png",card:{width:760,verticalWidth:940}},
      {lineId:"w05",image:"footage/w-live.png",card:{width:1560,verticalWidth:1000,verticalImage:"footage/w-live-v.png"}},

      {lineId:"w06"},
    ], actions:["Plan the work","Move it forward"],
  },
  "application-kit": {
    key:"application-kit", title:"Application Kit", status:"Invite-only", duration:timelineJson.filmDurations.a, bed:"bed-application-kit.mp3", lines:lines("a"),
    scenes:[
      {lineId:"a01",file:"tailor_1920.mp4",portraitFile:"tailor_430.mp4",from:3,crop:{horizontal:{x:50,y:40,scale:1.65},vertical:{x:50,y:50,scale:1}}},
      {lineId:"a02",image:"footage/kit-filter-panel.png",card:{width:1500,verticalWidth:1000,verticalImage:"footage/kit-filter-panel-portrait.png"}},
      {lineId:"a03",file:"tailor_1920.mp4",portraitFile:"tailor_430.mp4",from:15,crop:{horizontal:{x:50,y:80,scale:1.5},vertical:{x:50,y:75,scale:1}}},
      {lineId:"a04",file:"tailor_1920.mp4",portraitFile:"tailor_430.mp4",from:24,portraitFrom:27.8,crop:{horizontal:{x:50,y:70,scale:1.55},vertical:{x:50,y:0,scale:1}}},
      {lineId:"a05",file:"tracker_1920.mp4",portraitFile:"tracker_430.mp4",from:20,portraitFrom:26,crop:{horizontal:{x:50,y:69,scale:1.5},vertical:{x:50,y:47,scale:1}}},
      {lineId:"a06",file:"applied_1920.mp4",portraitFile:"applied_430.mp4",from:7,crop:{horizontal:{x:50,y:72,scale:1.55},vertical:{x:50,y:68,scale:1}},label:"This only drafts text. You send it yourself.",hideLabelVertical:true},
      {lineId:"a07"},
    ], actions:["Your experience","Your words","Your decision"],
  },
};
