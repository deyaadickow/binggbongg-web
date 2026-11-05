/* =====================================================================================
   Bingg Bongg — "Build Your Houses" SHARED HOUSE RENDERER  (house-view.js, v1, 2026-11-05)

   ONE renderer for all three platforms: the web page (/houses) loads this file, and the
   Android + iOS apps show it in a WebView (house-view.html next to this file, served at
   https://www.binggbongg.com/houses/house-view.html and also bundled inside the apps).
   Plain ES2017, no dependencies, no build step. Design = Steve's approved mockup
   (1 Ads/Build your houses/house_builder_mockup.html, 2026-11-05).

   RULES (same as the server, docs/build_your_houses_contract.md in binggbongg-backend)
     1 part = 1 coin. House = 5,000 cement (foundation, 20 layers x 250) + 50,000 bricks
     (269 courses, running bond, 10 openings) + 5,000 roof shingles (76 rows) = 60,000.
     Street = 40 houses.

   API (window.HouseView)
     HouseView.init({ container, lang, sound, speedPartsPerSec, height, onEvent })
        container        DOM element to draw into (required). Everything is created inside it.
        lang             'en' | 'fil' | 'tl' | 'id' | 'es' | 'ar' (anything else = English), or
                         { code, strings: {key: text} } to supply your own table (missing keys
                         fall back to English). Keys: see STRINGS.en below.
        sound            true (default) / false — initial sound state (the member's own choice,
                         once made with the speaker button, is remembered and wins).
        speedPartsPerSec initial speed, 1..20000 parts per second (default 380, or the member's
                         last choice on the speed bar).
        height           canvas height in CSS px (default 380).
        onEvent          optional function(event) — same events as below.
     HouseView.setProgress({ lifetimeParts, lastSeenParts, housesBuilt, streetsBuilt, theme })
        lifetimeParts    the member's lifetime parts (= server lifetime_coins). REQUIRED.
        lastSeenParts    where the animation starts on the FIRST call (what this member already
                         watched being laid). Omitted = the start of the current house.
                         Ignored on later calls (pass reset:true to start over).
        housesBuilt / streetsBuilt  optional; the drawing always derives them from lifetimeParts
                         (houses = floor(lifetimeParts / 60000), streets = floor(houses / 40)).
        theme            optional integer: shifts which of the 6 house colour schemes is used.
        Calling it again with a higher lifetimeParts QUEUES the new parts (live gifts) — they are
        laid at the chosen speed, finished houses slide onto the street, 40 make a street.
        A LOWER lifetimeParts than what is shown jumps straight there (no animation).
     HouseView.setSpeed(partsPerSec)   HouseView.mute(true|false)
     HouseView.toast(text)             small notice in the corner ("+50 · PK Battle")
     HouseView.zoomToNewest()  HouseView.fit()  HouseView.getState()  HouseView.destroy()

   CATCH-UP RULE (big gaps, e.g. 0 -> 250,000 parts on a first open)
     The animation never runs longer than CATCHUP_SECONDS (30 s) at the chosen speed and never
     starts before the beginning of the house the target is in (if the target is exactly a
     finished house, the start of that finished house, so its completion is still celebrated).
     Everything before that start point is placed instantly: completed houses go straight onto
     the street (one "N houses were finished while you were away" notice, one houseCompleted /
     streetCompleted event with fastForward:true), and only the rest is laid part by part.
     Example: 0 -> 250,000 at 380 parts/sec: houses 1-4 appear on the street at once, house #5
     starts at 250,000 - 11,400 = 238,600 and the last 11,400 parts are laid (30 s).
     The same rule is applied whenever a new setProgress makes the queue longer than 30 s.

   EVENTS — every event is an object { type, ... } delivered to ALL of:
     opts.onEvent(ev); window.HouseViewEvents(ev) (if it is a function, or .onEvent(ev));
     window.webkit.messageHandlers.houseView.postMessage(ev)            (iOS WKWebView)
     window.HouseViewAndroid.onEvent(JSON.stringify(ev))                 (Android JS interface)
     window.parent.postMessage({ source:'houseView', ...ev }, '*')       (when in an iframe)
     window 'houseview' CustomEvent (ev in .detail)
     Types: ready {} | progress { partsShown } (≤ 2 a second, and on caughtUp) |
            houseCompleted { house, fastForward? } | streetCompleted { street, fastForward? } |
            caughtUp { partsShown }
     Save partsShown as the member's lastSeenParts so the next open continues from there.

   INBOUND postMessage (for an <iframe> host): { houseView: 'setProgress'|'setSpeed'|'mute'|
     'toast'|'zoomToNewest'|'fit', args: <the argument> }

   PERFORMANCE: built parts are cached in a 2000x1280 bitmap + box-filtered mipmaps when zoomed
   out; when zoomed in only on-screen parts are drawn. The loop stops while the page is hidden
   and skips drawing while the house is scrolled off screen.
   ===================================================================================== */
(function (global) {
"use strict";
if (global.HouseView) return;

/* ===================== GEOMETRY (world units, y grows DOWN, ground y = 0) ===================== */
var N_F=5000, N_B=50000, N_S=5000, N_ALL=60000, PER_STREET=40, CATCHUP_SECONDS=30;
var F_LAYERS=20, F_PER=250, F_X0=-28, F_W=1800, F_H=2;
var WALL_W=218, BRICK=8, CH=3, COURSES=269, WW=WALL_W*BRICK;
var WALL_Y0=-40;
var OPEN=[[804,940,0,89],[148,268,30,86],[480,600,30,86],[1144,1264,30,86],[1476,1596,30,86],
          [148,268,150,206],[480,600,150,206],[812,932,150,206],[1144,1264,150,206],[1476,1596,150,206]];
var ROOF_B=WALL_Y0-COURSES*CH;
var R_ROWS=76, R_EXP=5, R_H=R_ROWS*R_EXP, R_CX=WW/2;
var R_WB=1872, R_WR=640, R_Y0=ROOF_B+6;
var PX=new Float32Array(N_ALL),PY=new Float32Array(N_ALL),PW=new Float32Array(N_ALL),PH=new Float32Array(N_ALL);
var KIND=new Uint8Array(N_ALL),VAR=new Uint8Array(N_ALL),ROW=new Uint16Array(N_ALL);
var courseStart=new Int32Array(COURSES+1);
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;var t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
(function build(){
  var rnd=mulberry(7),n=0;
  function put(x,y,w,h,k,row){PX[n]=x;PY[n]=y;PW[n]=w;PH[n]=h;KIND[n]=k;ROW[n]=row;var r0=rnd();VAR[n]=r0<.035?28+((rnd()*4)|0):(rnd()*28)|0;n++;}
  var fw=F_W/F_PER,l,i,c;
  for(l=0;l<F_LAYERS;l++)for(i=0;i<F_PER;i++)put(F_X0+i*fw,-(l+1)*F_H,fw,F_H,0,l);
  for(c=0;c<COURSES;c++){
    courseStart[c]=n;
    var ed=[];
    if(c%2===0){for(i=0;i<=WALL_W;i++)ed.push(i*BRICK);}else{ed.push(0);for(i=0;i<WALL_W;i++)ed.push(i*BRICK+4);ed.push(WW);}
    var oc=OPEN.filter(function(o){return c>=o[2]&&c<o[3];});
    var y=WALL_Y0-(c+1)*CH;
    for(i=0;i<ed.length-1;i++){
      var segs=[[ed[i],ed[i+1]]];
      for(var a=0;a<oc.length;a++){var o=oc[a],nn=[];for(var b=0;b<segs.length;b++){var p=segs[b][0],q=segs[b][1];if(q<=o[0]||p>=o[1])nn.push([p,q]);else{if(p<o[0])nn.push([p,o[0]]);if(q>o[1])nn.push([o[1],q]);}}segs=nn;}
      for(var s=0;s<segs.length;s++)put(segs[s][0],y,segs[s][1]-segs[s][0],CH,1,c);
    }
  }
  courseStart[COURSES]=n;
  function rowW(r){return R_WB-(R_WB-R_WR)*(r/R_ROWS);}
  function counts(sw){var a=[];for(var r=0;r<R_ROWS;r++)a.push(Math.max(2,Math.round(rowW(r)/sw)));return a;}
  function tot(a){var s=0;for(var r=0;r<a.length;r++)s+=r%2?a[r]+1:a[r];return s;}
  var lo=4,hi=60;for(var k=0;k<50;k++){var m=(lo+hi)/2;if(tot(counts(m))>N_S)lo=m;else hi=m;}
  var cnt=counts(hi),diff=N_S-tot(cnt);k=0;
  while(diff!==0){var sg=diff>0?1:-1;cnt[k%R_ROWS]+=sg;diff-=sg;k++;}
  for(var r=0;r<R_ROWS;r++){
    var w=rowW(r),x0=R_CX-w/2,sw=w/cnt[r],yb=R_Y0-r*R_EXP,yy=yb-2*R_EXP;
    if(r%2===0){for(i=0;i<cnt[r];i++)put(x0+i*sw,yy,sw,2*R_EXP,2,r);}
    else{put(x0,yy,sw/2,2*R_EXP,2,r);for(i=0;i<cnt[r]-1;i++)put(x0+sw/2+i*sw,yy,sw,2*R_EXP,2,r);put(x0+w-sw/2,yy,sw/2,2*R_EXP,2,r);}
  }
  if(n!==N_ALL&&global.console)console.warn("HouseView: part count "+n);
})();

/* ===================== STRINGS ===================== */
var STRINGS={
 en:{house_lbl:"House #{1} · Street {2}, lot {3}",of_coins:"/ {1} coins",
  ph_foundation:"Foundation",ph_bricks:"Bricks",ph_roof:"Roof",ph_complete:"Complete",
  tag_foundation:"Pouring the foundation · layer {1} of {2}",tag_bricks:"Laying bricks · course {1} of {2}",tag_roof:"Roofing · row {1} of {2}",tag_complete:"House complete!",
  follow:"Follow newest",newest:"Zoom to the newest brick",fit:"FIT",sound:"Sound on/off",zoom_in:"Zoom in",zoom_out:"Zoom out",
  bar_f:"Foundation (cement)",bar_b:"Bricks",bar_s:"Roof shingles",bar_t:"Whole house",
  bn_f_t:"Foundation poured!",bn_f_p:"5,000 / 5,000 parts of cement · now the bricks",
  bn_w_t:"Walls are up!",bn_w_p:"50,000 / 50,000 bricks laid · now the roof",
  bn_h_t:"House #{1} built!",bn_h_p:"60,000 coins · foundation, bricks and shingles",
  bn_s_t:"Street {1} complete!",bn_s_p:"40 houses · 2,400,000 coins",
  speed:"Building speed",pps:"{1} parts/sec",pps1:"1 part/sec",slower:"Slower",faster:"Faster",
  queued:"Queued: {1} coins · about {2} to lay at this speed",queue_empty:"Queue empty · new coins are laid at this speed",
  t_lt1:"under a second",t_sec:"{1} sec",t_min:"{1} min",t_hr:"{1} hours",
  street_of:"Street {1} of {2}",lg_built:"Built",lg_now:"Building now",lg_empty:"Empty lot",
  street_count:"{1} / 40 houses on this street · {2} streets complete",street_sign:"STREET {1} · BINGG BONGG AVENUE",
  ff_one:"House #{1} was finished while you were away",ff_many:"{1} houses were finished while you were away"},
 fil:{house_lbl:"Bahay #{1} · Kalye {2}, lote {3}",of_coins:"/ {1} coins",
  ph_foundation:"Pundasyon",ph_bricks:"Ladrilyo",ph_roof:"Bubong",ph_complete:"Tapos na",
  tag_foundation:"Binubuhos ang pundasyon · patong {1} ng {2}",tag_bricks:"Naglalatag ng ladrilyo · hanay {1} ng {2}",tag_roof:"Binububungan · hilera {1} ng {2}",tag_complete:"Tapos na ang bahay!",
  follow:"Sundan ang pinakabago",newest:"I-zoom sa pinakabagong ladrilyo",fit:"FIT",sound:"Tunog on/off",zoom_in:"Palakihin",zoom_out:"Paliitin",
  bar_f:"Pundasyon (semento)",bar_b:"Ladrilyo",bar_s:"Bubong (shingles)",bar_t:"Buong bahay",
  bn_f_t:"Tapos ang pundasyon!",bn_f_p:"5,000 / 5,000 parte ng semento · ladrilyo naman",
  bn_w_t:"Tayo na ang mga pader!",bn_w_p:"50,000 / 50,000 ladrilyo · bubong naman",
  bn_h_t:"Tapos ang Bahay #{1}!",bn_h_p:"60,000 coins · pundasyon, ladrilyo at bubong",
  bn_s_t:"Tapos ang Kalye {1}!",bn_s_p:"40 bahay · 2,400,000 coins",
  speed:"Bilis ng paggawa",pps:"{1} parte/seg",pps1:"1 parte/seg",slower:"Mas mabagal",faster:"Mas mabilis",
  queued:"Nakapila: {1} coins · mga {2} para mailatag sa bilis na ito",queue_empty:"Walang nakapila · ilalatag ang bagong coins sa bilis na ito",
  t_lt1:"wala pang isang segundo",t_sec:"{1} seg",t_min:"{1} min",t_hr:"{1} oras",
  street_of:"Kalye {1} ng {2}",lg_built:"Tapos",lg_now:"Ginagawa ngayon",lg_empty:"Bakanteng lote",
  street_count:"{1} / 40 bahay sa kalyeng ito · {2} kalyeng tapos",street_sign:"KALYE {1} · BINGG BONGG AVENUE",
  ff_one:"Natapos ang Bahay #{1} habang wala ka",ff_many:"{1} bahay ang natapos habang wala ka"},
 id:{house_lbl:"Rumah #{1} · Jalan {2}, kavling {3}",of_coins:"/ {1} koin",
  ph_foundation:"Fondasi",ph_bricks:"Bata",ph_roof:"Atap",ph_complete:"Selesai",
  tag_foundation:"Mengecor fondasi · lapisan {1} dari {2}",tag_bricks:"Memasang bata · baris {1} dari {2}",tag_roof:"Memasang atap · baris {1} dari {2}",tag_complete:"Rumah selesai!",
  follow:"Ikuti yang terbaru",newest:"Zoom ke bata terbaru",fit:"PAS",sound:"Suara on/off",zoom_in:"Perbesar",zoom_out:"Perkecil",
  bar_f:"Fondasi (semen)",bar_b:"Bata",bar_s:"Genteng atap",bar_t:"Seluruh rumah",
  bn_f_t:"Fondasi selesai!",bn_f_p:"5.000 / 5.000 bagian semen · sekarang bata",
  bn_w_t:"Dinding berdiri!",bn_w_p:"50.000 / 50.000 bata terpasang · sekarang atap",
  bn_h_t:"Rumah #{1} selesai!",bn_h_p:"60.000 koin · fondasi, bata dan genteng",
  bn_s_t:"Jalan {1} selesai!",bn_s_p:"40 rumah · 2.400.000 koin",
  speed:"Kecepatan membangun",pps:"{1} bagian/detik",pps1:"1 bagian/detik",slower:"Lebih lambat",faster:"Lebih cepat",
  queued:"Antrean: {1} koin · sekitar {2} untuk dipasang pada kecepatan ini",queue_empty:"Antrean kosong · koin baru dipasang pada kecepatan ini",
  t_lt1:"kurang dari sedetik",t_sec:"{1} detik",t_min:"{1} menit",t_hr:"{1} jam",
  street_of:"Jalan {1} dari {2}",lg_built:"Selesai",lg_now:"Sedang dibangun",lg_empty:"Kavling kosong",
  street_count:"{1} / 40 rumah di jalan ini · {2} jalan selesai",street_sign:"JALAN {1} · BINGG BONGG AVENUE",
  ff_one:"Rumah #{1} selesai saat kamu pergi",ff_many:"{1} rumah selesai saat kamu pergi"},
 es:{house_lbl:"Casa #{1} · Calle {2}, lote {3}",of_coins:"/ {1} monedas",
  ph_foundation:"Cimientos",ph_bricks:"Ladrillos",ph_roof:"Techo",ph_complete:"Terminada",
  tag_foundation:"Vertiendo los cimientos · capa {1} de {2}",tag_bricks:"Poniendo ladrillos · hilada {1} de {2}",tag_roof:"Techando · fila {1} de {2}",tag_complete:"¡Casa terminada!",
  follow:"Seguir el más nuevo",newest:"Ir al ladrillo más nuevo",fit:"AJUSTAR",sound:"Sonido sí/no",zoom_in:"Acercar",zoom_out:"Alejar",
  bar_f:"Cimientos (cemento)",bar_b:"Ladrillos",bar_s:"Tejas del techo",bar_t:"Casa completa",
  bn_f_t:"¡Cimientos listos!",bn_f_p:"5,000 / 5,000 partes de cemento · ahora los ladrillos",
  bn_w_t:"¡Paredes levantadas!",bn_w_p:"50,000 / 50,000 ladrillos · ahora el techo",
  bn_h_t:"¡Casa #{1} construida!",bn_h_p:"60,000 monedas · cimientos, ladrillos y tejas",
  bn_s_t:"¡Calle {1} completa!",bn_s_p:"40 casas · 2,400,000 monedas",
  speed:"Velocidad de construcción",pps:"{1} partes/seg",pps1:"1 parte/seg",slower:"Más lento",faster:"Más rápido",
  queued:"En cola: {1} monedas · unos {2} a esta velocidad",queue_empty:"Cola vacía · las monedas nuevas se colocan a esta velocidad",
  t_lt1:"menos de un segundo",t_sec:"{1} seg",t_min:"{1} min",t_hr:"{1} horas",
  street_of:"Calle {1} de {2}",lg_built:"Construida",lg_now:"En obra",lg_empty:"Lote vacío",
  street_count:"{1} / 40 casas en esta calle · {2} calles completas",street_sign:"CALLE {1} · BINGG BONGG AVENUE",
  ff_one:"La casa #{1} se terminó mientras no estabas",ff_many:"{1} casas se terminaron mientras no estabas"},
 ar:{house_lbl:"البيت رقم {1} · الشارع {2}، القطعة {3}",of_coins:"/ {1} عملة",
  ph_foundation:"الأساس",ph_bricks:"الطوب",ph_roof:"السقف",ph_complete:"مكتمل",
  tag_foundation:"صبّ الأساس · الطبقة {1} من {2}",tag_bricks:"رصّ الطوب · الصف {1} من {2}",tag_roof:"تركيب السقف · الصف {1} من {2}",tag_complete:"اكتمل البيت!",
  follow:"تتبّع الأحدث",newest:"تكبير على أحدث طوبة",fit:"ملاءمة",sound:"الصوت تشغيل/إيقاف",zoom_in:"تكبير",zoom_out:"تصغير",
  bar_f:"الأساس (إسمنت)",bar_b:"الطوب",bar_s:"قرميد السقف",bar_t:"البيت كاملًا",
  bn_f_t:"اكتمل الأساس!",bn_f_p:"5,000 / 5,000 جزء من الإسمنت · والآن الطوب",
  bn_w_t:"ارتفعت الجدران!",bn_w_p:"50,000 / 50,000 طوبة · والآن السقف",
  bn_h_t:"اكتمل البيت رقم {1}!",bn_h_p:"60,000 عملة · أساس وطوب وقرميد",
  bn_s_t:"اكتمل الشارع {1}!",bn_s_p:"40 بيتًا · 2,400,000 عملة",
  speed:"سرعة البناء",pps:"{1} جزء/ثانية",pps1:"جزء واحد/ثانية",slower:"أبطأ",faster:"أسرع",
  queued:"في الانتظار: {1} عملة · نحو {2} بهذه السرعة",queue_empty:"لا شيء في الانتظار · تُبنى العملات الجديدة بهذه السرعة",
  t_lt1:"أقل من ثانية",t_sec:"{1} ث",t_min:"{1} د",t_hr:"{1} ساعة",
  street_of:"الشارع {1} من {2}",lg_built:"مبني",lg_now:"قيد البناء",lg_empty:"قطعة فارغة",
  street_count:"{1} / 40 بيتًا في هذا الشارع · {2} شوارع مكتملة",street_sign:"STREET {1} · BINGG BONGG AVENUE",
  ff_one:"اكتمل البيت رقم {1} أثناء غيابك",ff_many:"اكتمل {1} بيوت أثناء غيابك"}
};
STRINGS.tl=STRINGS.fil;
var STR=STRINGS.en;
function T(k){var s=(STR&&STR[k]!=null)?STR[k]:(STRINGS.en[k]||"");for(var i=1;i<arguments.length;i++)s=s.split("{"+i+"}").join(String(arguments[i]));return s;}

/* ===================== palettes ===================== */
var PALS=[
 {brick:['#9e3b2a','#a8432f','#8f3424','#b04a33','#973a2b','#a33f2c','#8a3122','#b5523a'],mortar:'#cfc6b8',roof:['#3a3f47','#343941','#41474f','#2f343b','#454b54','#383d45','#3d424a','#32373e'],roofDark:'#14171b',trim:'#f3efe6',door:'#6b3b1f'},
 {brick:['#d2b48c','#c9a97f','#dcc199','#c4a275','#d8ba90','#ccad84','#bf9d70','#e0c7a0'],mortar:'#efe9dd',roof:['#a8452c','#b04d33','#9c3e27','#b85638','#a04a30','#943a24','#ad4a2f','#a24129'],roofDark:'#4a1c10',trim:'#ffffff',door:'#2f5d50'},
 {brick:['#5e3a2a','#674132','#553425','#704837','#5a3727','#61402f','#4f3022','#76503c'],mortar:'#b9ad9c',roof:['#2f4f6b','#36587a','#2a4862','#3c6082','#304f6c','#2c4a66','#335472','#28445d'],roofDark:'#101e2b',trim:'#efe8da',door:'#8c1c1c'},
 {brick:['#7d8288','#868b91','#73787e','#8e9399','#797e84','#83888e','#6f747a','#959aa0'],mortar:'#d6d6d2',roof:['#3f5f3a','#456840','#395634','#4c7046','#40603b','#3a5836','#43643e','#375332'],roofDark:'#152214',trim:'#ffffff',door:'#b8902e'},
 {brick:['#c0623a','#c96b42','#b65a33','#d0744a','#bd5f38','#c7683f','#ad5430','#d67c52'],mortar:'#e8dccb',roof:['#2b2b2b','#323232','#262626','#383838','#2e2e2e','#242424','#303030','#292929'],roofDark:'#0a0a0a',trim:'#fff7e6',door:'#1f3b5c'},
 {brick:['#6d3b4f','#764357','#643447','#7f4b60','#6a394c','#73405a','#5e3043','#875268'],mortar:'#d8cbd0',roof:['#b8902e','#c29a36','#ad8628','#cba43f','#b48c2c','#a88226','#be9532','#b08a2a'],roofDark:'#4a390e',trim:'#fffaf0',door:'#111111'}];
var CEM=['#8d8d88','#96968f','#85857f','#9d9d96','#8a8a84','#a3a39c','#90908a','#999992'];
var SHUT=['#2e4a3a','#3b3f45','#1f3550','#5b2a2a','#26402a','#2b2b2b'];
function palIdx(h){return ((h+themeOff)%PALS.length+PALS.length)%PALS.length;}
function hex2rgb(h){var n=parseInt(h.slice(1),16);return[n>>16,(n>>8)&255,n&255];}
function shade(h,f){var c=hex2rgb(h);return'rgb('+Math.min(255,c[0]*f|0)+','+Math.min(255,c[1]*f|0)+','+Math.min(255,c[2]*f|0)+')';}
function prepPal(h){var pi=palIdx(h),b=PALS[pi],r=mulberry(100+h),brickT=[],roofT=[],cemT=[];
  for(var i=0;i<32;i++){brickT.push(shade(b.brick[i%8],i>=28?.6+r()*.08:.84+r()*.3));roofT.push(shade(b.roof[i%8],.78+r()*.42));cemT.push(shade(CEM[i%8],.9+r()*.18));}
  return {brick:b.brick,roof:b.roof,roofDark:b.roofDark,trim:b.trim,door:b.door,brickT:brickT,roofT:roofT,cemT:cemT,mortar:shade(b.mortar,.66),shut:SHUT[pi%SHUT.length]};}

/* ===================== instance state (one HouseView per page) ===================== */
var themeOff=0;
var S=null, P=null, animStart=new Float64Array(N_ALL), DUR=280;
var root=null, els={}, opts={}, alive=false, raf=0;
var cv=null, ctx=null, cw=0, ch=0, dpr=1;
var cam={x:R_CX,y:-600,z:.2}, camA=null, follow=false, fitZ=.2;
var stageVisible=true, stVisible=true, observers=[], cleanups=[];
var lastEmitAt=0, lastEmitted=-1, wasBusy=false;

function freshState(){return {houses:0,built:0,settled:0,target:0,started:false,completing:false,lit:false,slideAt:0,slideStart:0,slideT:0};}
function shownParts(){return S.houses*N_ALL+S.built;}
function pendingN(){return Math.max(0,S.target-shownParts());}

var stars=[];(function(){var r=mulberry(3);for(var i=0;i<70;i++)stars.push([r(),r()*.55,r()*1.3+.3,r()]);})();

/* ---- built-parts bitmap (1 px per world unit) + mipmaps ---- */
var BX0=-120,BY0=-1260,BW=2000,BH=1280;
var bm=null,bctx=null,bmCount=0,mip1=null,m1=null,mip2=null,m2=null,mipAt=-1,mipCount=-1;
function makeBitmaps(){if(bm)return;bm=document.createElement('canvas');bm.width=BW;bm.height=BH;bctx=bm.getContext('2d');
  mip1=document.createElement('canvas');mip1.width=BW/2;mip1.height=BH/2;m1=mip1.getContext('2d');
  mip2=document.createElement('canvas');mip2.width=BW/4;mip2.height=BH/4;m2=mip2.getContext('2d');}
function roofClip(c){c.beginPath();c.moveTo(R_CX-R_WB/2,R_Y0);c.lineTo(R_CX+R_WB/2,R_Y0);c.lineTo(R_CX+R_WR/2,R_Y0-R_H);c.lineTo(R_CX-R_WR/2,R_Y0-R_H);c.closePath();c.clip();}
function drawPart(c,i,fine){
  var x=PX[i],y=PY[i],w=PW[i],h=PH[i],k=KIND[i],v=VAR[i];
  if(k===1){
    c.fillStyle=P.mortar;c.fillRect(x,y,w,h);
    c.fillStyle=P.brickT[v];c.fillRect(x+.55,y+.5,w-1.1,h-1);
    if(fine){
      c.fillStyle='rgba(255,235,205,.2)';c.fillRect(x+.55,y+.5,w-1.1,.38);
      c.fillStyle='rgba(0,0,0,.28)';c.fillRect(x+.55,y+h-.88,w-1.1,.38);c.fillRect(x+w-.93,y+.5,.38,h-1);
      if(v%5===0){c.fillStyle='rgba(0,0,0,.17)';c.fillRect(x+1.2+(i%4),y+.95,1.4,.7);}
      if(v%7===2){c.fillStyle='rgba(255,255,255,.11)';c.fillRect(x+2+(i%3),y+1.1,2.2,.5);}
      if(i%13===0){c.fillStyle='rgba(30,20,10,.13)';c.fillRect(x+.55,y+.5,(w-1.1)*.45,h-1);}
    }
  }else if(k===0){
    c.fillStyle=P.cemT[v];c.fillRect(x,y,w+.05,h);
    c.fillStyle='rgba(0,0,0,.3)';c.fillRect(x+(v%6)*1.1,y+((v>>3)&1)*.9+.3,.5,.5);
    c.fillStyle='rgba(255,255,255,.24)';c.fillRect(x+((v*5)%7),y+1.15,.45,.45);
    if(ROW[i]%4===3){c.fillStyle='rgba(0,0,0,.15)';c.fillRect(x,y,w+.05,.35);}
  }else{
    c.fillStyle=P.roofDark;c.fillRect(x,y,w,h);
    c.fillStyle=P.roofT[v];c.fillRect(x+.45,y,w-.9,h-1.3);
    c.fillStyle='rgba(255,255,255,.1)';c.fillRect(x+.45,y+h-5.6,w-.9,1.1);
    c.fillStyle='rgba(0,0,0,.24)';c.fillRect(x+.45,y+h-2.6,w-.9,1.3);
    if(fine){c.fillStyle='rgba(0,0,0,.22)';c.fillRect(x+1+(v%4)*2,y+h-4.4,.6,.6);c.fillStyle='rgba(255,255,255,.14)';c.fillRect(x+2+(v%5)*1.6,y+h-3.7,.5,.5);}
  }
}
function syncBitmap(){
  if(bmCount>=S.settled)return;
  bctx.setTransform(1,0,0,1,-BX0,-BY0);
  var i=bmCount,end=S.settled;
  for(;i<end&&i<N_F+N_B;i++)drawPart(bctx,i,false);
  if(i<end){bctx.save();roofClip(bctx);for(;i<end;i++)drawPart(bctx,i,false);bctx.restore();}
  bmCount=end;
}
function refreshMip(now){if(mipCount===bmCount||(now-mipAt<250&&mipCount>0&&bmCount>0))return;mipAt=now;mipCount=bmCount;
  m1.clearRect(0,0,BW/2,BH/2);m1.drawImage(bm,0,0,BW/2,BH/2);m2.clearRect(0,0,BW/4,BH/4);m2.drawImage(mip1,0,0,BW/4,BH/4);}
function resetBitmap(){bctx.setTransform(1,0,0,1,0,0);bctx.clearRect(0,0,BW,BH);bmCount=0;mipCount=-1;}
function firstAtOrAbove(y){var lo=0,hi=N_ALL;while(lo<hi){var m=(lo+hi)>>1;if(PY[m]<=y)hi=m;else lo=m+1;}return lo;}
function lastBelow(y){var lo=0,hi=N_ALL;while(lo<hi){var m=(lo+hi)>>1;if(PY[m]>=y)lo=m+1;else hi=m;}return lo-1;}

/* ===================== particles / sound ===================== */
var parts=[];
function sparkle(wx,wy,n,big){for(var i=0;i<n;i++){var a=Math.random()*Math.PI*2,s=(big?2.4:1.2)+Math.random()*(big?4:2.2);parts.push({wx:wx,wy:wy,ox:0,oy:0,vx:Math.cos(a)*s,vy:Math.sin(a)*s-1.2,life:1,sz:big?3:1.6+Math.random()*1.4});}if(parts.length>260)parts.splice(0,parts.length-260);}
var actx=null,muted=false,lastTock=0;
function ensureAudio(){if(muted)return;if(!actx){try{actx=new(global.AudioContext||global.webkitAudioContext)();}catch(e){}}if(actx&&actx.state==='suspended'){try{actx.resume();}catch(e){}}}
function tone(f,t,d,type,vol){var o=actx.createOscillator(),g=actx.createGain();o.type=type;o.frequency.setValueAtTime(f,t);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(vol,t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+d);o.connect(g).connect(actx.destination);o.start(t);o.stop(t+d+.02);return o;}
function tock(kind){if(muted||!actx||actx.state!=='running')return;var t=actx.currentTime;if(t-lastTock<.05)return;lastTock=t;
  var base=kind===0?300:kind===1?560:820;var o=tone(base*(.9+Math.random()*.25),t,.09,'triangle',.12);o.frequency.exponentialRampToValueAtTime(base*.5,t+.07);}
function chime(seq,step){if(muted||!actx||actx.state!=='running')return;var t=actx.currentTime;seq.forEach(function(f,i){tone(f,t+i*step,.45,'sine',.14);tone(f*2,t+i*step,.25,'triangle',.04);});}

/* ===================== events ===================== */
function emit(type,data){
  var ev={type:type};if(data)for(var k in data)ev[k]=data[k];
  try{if(opts.onEvent)opts.onEvent(ev);}catch(e){}
  try{var h=global.HouseViewEvents;if(typeof h==='function')h(ev);else if(h&&typeof h.onEvent==='function')h.onEvent(ev);}catch(e){}
  try{if(global.webkit&&global.webkit.messageHandlers&&global.webkit.messageHandlers.houseView)global.webkit.messageHandlers.houseView.postMessage(ev);}catch(e){}
  try{if(global.HouseViewAndroid&&typeof global.HouseViewAndroid.onEvent==='function')global.HouseViewAndroid.onEvent(JSON.stringify(ev));}catch(e){}
  try{if(global.parent&&global.parent!==global){var m={source:'houseView'};for(var k2 in ev)m[k2]=ev[k2];global.parent.postMessage(m,'*');}}catch(e){}
  try{global.dispatchEvent(new CustomEvent('houseview',{detail:ev}));}catch(e){}
}
function emitProgress(now){lastEmitAt=now||performance.now();lastEmitted=shownParts();emit('progress',{partsShown:lastEmitted});}

/* ===================== laying parts ===================== */
function newestIdx(){return Math.max(0,Math.min(N_ALL-1,S.built-1));}
var SPEED=380,SPEED_V=60,budget=0,idle=true,lastStep=0;
function spdOf(v){var r=Math.pow(10,v/100*Math.log10(20000));return r<10?Math.round(r):r<100?Math.round(r/5)*5:r<1000?Math.round(r/10)*10:Math.round(r/100)*100;}
function vOf(pps){pps=Math.max(1,Math.min(20000,+pps||380));return Math.round(Math.log10(pps)/Math.log10(20000)*100);}
function step(now){
  var dt=lastStep?Math.min(100,now-lastStep):16;lastStep=now;
  var pend=pendingN();
  if(S.completing||pend<=0||S.built>=N_ALL){idle=true;budget=0;return;}
  if(idle){idle=false;budget=Math.max(budget,1);}else budget+=SPEED*dt/1000;
  if(budget<1)return;
  var n=Math.min(pend,N_ALL-S.built,Math.floor(budget));budget-=n;if(budget>SPEED*.25+1)budget=0;
  DUR=SPEED<=4?560:SPEED<=30?380:280;
  var prev=S.built,anim=Math.min(n,8);
  for(var j=0;j<n;j++){var i=prev+j;animStart[i]=(j<n-anim)?now-DUR*2:now+(j-(n-anim))*(n>3?14:0);}
  S.built+=n;
  var li=S.built-1;tock(KIND[li]);
  if(Math.random()<.7||n>1)sparkle(PX[li]+PW[li]/2,PY[li]+PH[li]/2,n>20?6:3,false);
  bump();
  if(prev<N_F&&S.built>=N_F){banner(T('bn_f_t'),T('bn_f_p'));chime([523,659,784],.09);}
  if(prev<N_F+N_B&&S.built>=N_F+N_B){banner(T('bn_w_t'),T('bn_w_p'));chime([523,659,784,1047],.09);}
  if(S.built>=N_ALL)houseDone(now);
}
function houseDone(now){
  S.completing=true;S.lit=true;var num=S.houses+1;
  banner(T('bn_h_t',fmt(num)),T('bn_h_p'));
  chime([523,659,784,1047,1319,1568],.11);confetti();
  sparkle(R_CX,-700,40,true);
  emit('houseCompleted',{house:num});
  S.slideAt=now+3000;
}
function finishSlide(){
  S.houses++;S.built=0;S.settled=0;S.completing=false;S.lit=false;S.slideAt=0;S.slideStart=0;S.slideT=0;P=prepPal(S.houses);resetBitmap();
  lotPop=performance.now();viewStreet=Math.floor(S.houses/PER_STREET);
  if(S.houses%PER_STREET===0){var st=S.houses/PER_STREET;banner(T('bn_s_t',fmt(st)),T('bn_s_p'));chime([392,523,659,784,1047],.12);confetti();emit('streetCompleted',{street:st});}
  scrollStreetToCurrent();
}
/* Put the scene at lifetime part L instantly (no animation). */
function placeAt(L,fastForward){
  var prevH=S.houses+(S.completing?1:0);
  if(S.completing){S.completing=false;S.lit=false;S.slideAt=0;S.slideStart=0;S.slideT=0;}
  var h=Math.floor(L/N_ALL),b=L-h*N_ALL;
  if(h!==S.houses||b<S.settled||P==null){S.houses=h;P=prepPal(h);resetBitmap();}
  S.built=b;S.settled=b;if(b>0)animStart.fill(-1e9,0,b);
  viewStreet=Math.floor(h/PER_STREET);
  if(fastForward&&h>prevH){
    emit('houseCompleted',{house:h,fastForward:true});
    if(Math.floor(h/PER_STREET)>Math.floor(prevH/PER_STREET))emit('streetCompleted',{street:Math.floor(h/PER_STREET),fastForward:true});
    toast(h-prevH===1?T('ff_one',fmt(h)):T('ff_many',fmt(h-prevH)));
    lotPop=performance.now();
  }
  lastShown=-1;
}
/* The catch-up rule (see header). */
function catchUp(){
  var L=S.target,gap=L-shownParts(),win=Math.max(20,SPEED*CATCHUP_SECONDS);
  if(gap<=win)return;
  var houseStart=(L>0&&L%N_ALL===0)?L-N_ALL:Math.floor(L/N_ALL)*N_ALL;
  var start=Math.max(L-win,houseStart);
  if(start>shownParts())placeAt(start,true);
}

/* ===================== rendering ===================== */
function w2s(x,y){return[(x-cam.x)*cam.z+cw/2,(y-cam.y)*cam.z+ch/2];}
var clouds=[];(function(){var r=mulberry(9);for(var i=0;i<6;i++)clouds.push([r(),.05+r()*.3,36+r()*70,r()]);})();
function hills(c,amp,base,f1,f2,ph){c.beginPath();c.moveTo(-5000,10);for(var x=-5000;x<=7000;x+=200)c.lineTo(x,base-amp*(.6+.4*Math.sin(x/f1+ph))-amp*.35*Math.sin(x/f2));c.lineTo(7000,10);c.fill();}
var skyC=null,curShift=0;
function buildSky(){skyC=document.createElement('canvas');skyC.width=cv.width;skyC.height=cv.height;var c=skyC.getContext('2d');c.scale(dpr,dpr);
  var g=c.createLinearGradient(0,0,0,ch);g.addColorStop(0,'#3a6aa0');g.addColorStop(.42,'#a3a7bf');g.addColorStop(.72,'#f1b56f');g.addColorStop(1,'#ffdca0');
  c.fillStyle=g;c.fillRect(0,0,cw,ch);
  var sx0=cw*.14,sy0=ch*.6,sg=c.createRadialGradient(sx0,sy0,0,sx0,sy0,ch*.55);
  sg.addColorStop(0,'rgba(255,250,225,1)');sg.addColorStop(.06,'rgba(255,236,180,.9)');sg.addColorStop(.3,'rgba(255,200,120,.3)');sg.addColorStop(1,'rgba(255,190,110,0)');
  c.fillStyle=sg;c.fillRect(0,0,cw,ch);
}
function drawScene(now){
  var z=cam.z,i,c;
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(!skyC||skyC.width!==cv.width||skyC.height!==cv.height)buildSky();ctx.drawImage(skyC,0,0,cw,ch);
  for(i=0;i<clouds.length;i++){c=clouds[i];var x=((c[0]*(cw+240)+now*.006*(.4+c[3]))%(cw+240))-120,y=c[1]*ch,s=c[2];
    ctx.fillStyle='rgba(255,240,228,.42)';ctx.beginPath();ctx.ellipse(x,y,s,s*.26,0,0,7);ctx.fill();ctx.beginPath();ctx.ellipse(x+s*.35,y-s*.14,s*.5,s*.24,0,0,7);ctx.fill();
    ctx.fillStyle='rgba(190,130,120,.16)';ctx.beginPath();ctx.ellipse(x,y+s*.08,s*.9,s*.12,0,0,7);ctx.fill();}
  drawBirds();
  var shift=0,alpha=1;curShift=0;
  if(S.slideStart){var e0=S.slideT*S.slideT;shift=e0*2600;alpha=1-e0*.8;curShift=shift;}
  ctx.setTransform(dpr*z,0,0,dpr*z,dpr*(cw/2-cam.x*z),dpr*(ch/2-cam.y*z));
  ctx.fillStyle='rgba(118,126,146,.5)';hills(ctx,260,-30,900,330,0);
  ctx.fillStyle='rgba(84,108,66,.85)';hills(ctx,110,0,600,210,2);
  var gg=ctx.createLinearGradient(0,0,0,300);gg.addColorStop(0,'#7aa84a');gg.addColorStop(.12,'#5a8a38');gg.addColorStop(1,'#2c4d1e');
  ctx.fillStyle=gg;ctx.fillRect(-8000,0,16000,3000);
  ctx.fillStyle='rgba(255,230,160,.3)';ctx.fillRect(-8000,0,16000,3);
  drawSceneryBack(now,z);
  ctx.save();ctx.translate(shift,0);ctx.globalAlpha=alpha;
  ctx.fillStyle='#7a5532';ctx.fillRect(-100,-3,1944,20);ctx.fillStyle='#5a3c22';ctx.fillRect(-100,12,1944,5);
  ctx.fillStyle='rgba(0,0,0,.16)';for(var xx=-96;xx<1840;xx+=23)ctx.fillRect(xx,3+(xx%7+7)%7,3,2);
  var topY=S.settled>0?PY[S.settled-1]:0,Hb=-topY;
  if(Hb>0){ctx.save();ctx.translate(990+Hb*.14,6);ctx.scale(1,.045);var r=1000+Hb*.32;var cg=ctx.createRadialGradient(0,0,0,0,0,r);
    cg.addColorStop(0,'rgba(25,12,0,.5)');cg.addColorStop(.7,'rgba(25,12,0,.22)');cg.addColorStop(1,'rgba(25,12,0,0)');ctx.fillStyle=cg;ctx.beginPath();ctx.arc(0,0,r,0,7);ctx.fill();ctx.restore();}
  drawBlueprint(z);
  var fine=z*dpr>3;
  syncBitmap();
  if(z*dpr<=2){ctx.imageSmoothingEnabled=true;if(z*dpr<.6){refreshMip(now);ctx.imageSmoothingQuality='low';ctx.drawImage(mip2,BX0,BY0,BW,BH);}else{ctx.imageSmoothingQuality='medium';ctx.drawImage(bm,BX0,BY0,BW,BH);}ctx.imageSmoothingQuality='low';}
  else{
    var wx0=cam.x-cw/2/z-shift,wx1=cam.x+cw/2/z-shift,wy0=cam.y-ch/2/z,wy1=cam.y+ch/2/z;
    var lo=firstAtOrAbove(wy1),hi=Math.min(S.settled-1,lastBelow(wy0-12));
    i=lo;
    for(;i<=hi&&i<N_F+N_B;i++){if(PX[i]+PW[i]<wx0||PX[i]>wx1)continue;drawPart(ctx,i,fine);}
    if(i<=hi){ctx.save();roofClip(ctx);for(;i<=hi;i++){if(PX[i]+PW[i]<wx0||PX[i]>wx1)continue;drawPart(ctx,i,fine);}ctx.restore();}
  }
  drawLighting();
  drawOpenings(z,now);
  drawDetails(z,now);
  for(i=S.settled;i<S.built;i++){
    var t=(now-animStart[i])/DUR;if(t<0)continue;t=Math.min(1,t);
    var e=1+2.2*Math.pow(t-1,3)+1.2*Math.pow(t-1,2);
    var lift=(1-e)*30/z;ctx.globalAlpha=alpha*Math.min(1,t*3);
    ctx.save();ctx.translate(0,-lift);
    if(KIND[i]===2){ctx.save();roofClip(ctx);drawPart(ctx,i,fine);ctx.restore();}else drawPart(ctx,i,fine);
    if(t<1){ctx.strokeStyle='rgba(255,221,85,'+(1-t)+')';ctx.lineWidth=1.6/z;ctx.strokeRect(PX[i],PY[i],PW[i],PH[i]);}
    ctx.restore();
  }
  ctx.globalAlpha=1;ctx.restore();
  drawSceneryFront(now);
  ctx.setTransform(dpr,0,0,dpr,0,0);
  if(S.built>0&&!S.completing){
    var ni=newestIdx(),sp=w2s(PX[ni]+PW[ni]/2,PY[ni]+PH[ni]/2);
    var rr=9+3*Math.sin(now/180);ctx.strokeStyle='rgba(255,221,85,.95)';ctx.lineWidth=2.2;ctx.beginPath();ctx.arc(sp[0],sp[1],rr,0,7);ctx.stroke();
    ctx.strokeStyle='rgba(0,0,0,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.arc(sp[0],sp[1],rr+2,0,7);ctx.stroke();
  }
  for(var k=parts.length-1;k>=0;k--){var p=parts[k];p.ox+=p.vx;p.oy+=p.vy;p.vy+=.12;p.life-=.025;if(p.life<=0){parts.splice(k,1);continue;}
    var q=w2s(p.wx+shift,p.wy);ctx.globalAlpha=p.life;ctx.fillStyle=p.life>.5?'#FFF2A8':'#FFDD55';
    var ss=p.sz*(.6+p.life);ctx.beginPath();ctx.moveTo(q[0]+p.ox,q[1]+p.oy-ss*1.6);ctx.lineTo(q[0]+p.ox+ss*.5,q[1]+p.oy);ctx.lineTo(q[0]+p.ox,q[1]+p.oy+ss*1.6);ctx.lineTo(q[0]+p.ox-ss*.5,q[1]+p.oy);ctx.fill();}
  ctx.globalAlpha=1;
}
function drawBlueprint(z){
  ctx.save();ctx.strokeStyle='rgba(255,255,255,.75)';ctx.lineWidth=1.3/z;ctx.setLineDash([6/z,5/z]);
  ctx.strokeRect(F_X0,-40,F_W,40);ctx.strokeRect(0,ROOF_B,WW,-ROOF_B-40);
  ctx.beginPath();ctx.moveTo(R_CX-R_WB/2,R_Y0);ctx.lineTo(R_CX+R_WB/2,R_Y0);ctx.lineTo(R_CX+R_WR/2,R_Y0-R_H);ctx.lineTo(R_CX-R_WR/2,R_Y0-R_H);ctx.closePath();ctx.stroke();
  ctx.strokeStyle='rgba(255,255,255,.45)';
  for(var k=0;k<OPEN.length;k++){var o=OPEN[k];ctx.strokeRect(o[0],WALL_Y0-o[3]*CH,o[1]-o[0],(o[3]-o[2])*CH);}
  ctx.restore();
}
function drawLighting(){
  var fl=Math.min(S.settled,N_F),layers=Math.floor(fl/F_PER);
  if(layers>0){var t=-layers*F_H,fg=ctx.createLinearGradient(0,t,0,0);fg.addColorStop(0,'rgba(255,255,255,.14)');fg.addColorStop(.15,'rgba(255,255,255,0)');fg.addColorStop(1,'rgba(0,0,0,.25)');
    ctx.fillStyle=fg;ctx.fillRect(F_X0,t,F_W,-t);ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(F_X0+F_W-10,t,10,-t);}
  var bEnd=Math.min(S.settled,N_F+N_B)-N_F;
  if(bEnd>0){var top=PY[N_F+bEnd-1];var hh=WALL_Y0-top;
    var lg=ctx.createLinearGradient(0,0,WW,0);lg.addColorStop(0,'rgba(255,200,130,.17)');lg.addColorStop(.5,'rgba(255,180,100,.04)');lg.addColorStop(1,'rgba(20,10,40,.24)');
    ctx.fillStyle=lg;ctx.fillRect(0,top,WW,hh);
    var ag=ctx.createLinearGradient(0,WALL_Y0-70,0,WALL_Y0);ag.addColorStop(0,'rgba(0,0,0,0)');ag.addColorStop(1,'rgba(0,0,0,.25)');ctx.fillStyle=ag;ctx.fillRect(0,Math.max(top,WALL_Y0-70),WW,Math.min(hh,70));
    ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(WW-12,top,12,hh);ctx.fillStyle='rgba(255,225,175,.14)';ctx.fillRect(0,top,7,hh);}
  if(S.settled>N_F+N_B){
    var rg=ctx.createLinearGradient(0,ROOF_B,0,ROOF_B+110);rg.addColorStop(0,'rgba(0,0,0,.55)');rg.addColorStop(1,'rgba(0,0,0,0)');ctx.fillStyle=rg;ctx.fillRect(0,ROOF_B,WW,110);
    var rtop=PY[S.settled-1];ctx.save();roofClip(ctx);
    var rl=ctx.createLinearGradient(R_CX-R_WB/2,0,R_CX+R_WB/2,0);rl.addColorStop(0,'rgba(255,200,130,.18)');rl.addColorStop(.6,'rgba(0,0,0,0)');rl.addColorStop(1,'rgba(0,0,30,.25)');
    ctx.fillStyle=rl;ctx.fillRect(R_CX-R_WB/2,rtop,R_WB,R_Y0-rtop);ctx.restore();}
}
function drawWindow(x0,x1,yT,yB,w,h){
  ctx.fillStyle=P.shut;ctx.fillRect(x0-32,yT,27,h);ctx.fillRect(x1+5,yT,27,h);
  ctx.fillStyle='rgba(0,0,0,.28)';for(var yy=yT+8;yy<yB-6;yy+=9){ctx.fillRect(x0-29,yy,21,2.2);ctx.fillRect(x1+8,yy,21,2.2);}
  ctx.fillStyle='rgba(255,255,255,.1)';ctx.fillRect(x0-32,yT,27,2);ctx.fillRect(x1+5,yT,27,2);
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.fillRect(x1+32,yT+3,3,h);ctx.fillRect(x0-5,yT+3,3,h);
  ctx.fillStyle=P.trim;ctx.fillRect(x0,yT,w,h);
  ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(x0,yB-3,w,3);ctx.fillRect(x1-3,yT,3,h);
  var gx=x0+8,gy=yT+8,gw=w-16,gh=h-16,gg=ctx.createLinearGradient(0,gy,0,gy+gh);
  if(S.lit){gg.addColorStop(0,'#fff1b8');gg.addColorStop(1,'#f0a640');}
  else{gg.addColorStop(0,'#cfe0ea');gg.addColorStop(.45,'#7c9fbd');gg.addColorStop(1,'#2a435c');}
  ctx.fillStyle=gg;ctx.fillRect(gx,gy,gw,gh);
  if(S.lit){ctx.fillStyle='rgba(150,50,35,.55)';ctx.fillRect(gx,gy,14,gh);ctx.fillRect(gx+gw-14,gy,14,gh);}
  else{ctx.fillStyle='rgba(255,255,255,.28)';ctx.beginPath();ctx.moveTo(gx+6,gy+gh*.75);ctx.lineTo(gx+gw*.45,gy+4);ctx.lineTo(gx+gw*.6,gy+4);ctx.lineTo(gx+18,gy+gh*.75);ctx.fill();
    ctx.fillStyle='rgba(255,255,255,.14)';ctx.beginPath();ctx.moveTo(gx+gw*.55,gy+gh-4);ctx.lineTo(gx+gw-4,gy+gh*.4);ctx.lineTo(gx+gw-4,gy+gh*.55);ctx.lineTo(gx+gw*.68,gy+gh-4);ctx.fill();}
  ctx.fillStyle='rgba(0,0,0,.38)';ctx.fillRect(gx,gy,gw,4);ctx.fillRect(gx,gy,3,gh);
  ctx.fillStyle=P.trim;ctx.fillRect(x0+w/2-3,gy,6,gh);ctx.fillRect(gx,yT+h/2-3,gw,6);
  ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(x0+w/2+3,gy,1.5,gh);ctx.fillRect(gx,yT+h/2+3,gw,1.5);
  ctx.fillStyle=P.trim;ctx.fillRect(x0-12,yB,w+24,7);ctx.fillStyle='rgba(255,255,255,.35)';ctx.fillRect(x0-12,yB,w+24,1.5);
  ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(x0-12,yB+7,w+24,2.5);ctx.fillStyle='rgba(0,0,0,.14)';ctx.fillRect(x0-10,yB+9.5,w+20,6);
  if(S.lit){ctx.fillStyle='rgba(255,205,100,.16)';ctx.fillRect(x0-18,yT-18,w+36,h+36);}
}
function drawDoor(x0,x1,yT,yB,w,h){
  ctx.fillStyle='#a8a194';ctx.fillRect(x0-54,-34,w+108,34);ctx.fillStyle='#bdb6a9';ctx.fillRect(x0-36,-46,w+72,12);
  ctx.fillStyle='rgba(255,255,255,.3)';ctx.fillRect(x0-36,-46,w+72,2);ctx.fillRect(x0-54,-34,w+108,2);ctx.fillStyle='rgba(0,0,0,.22)';ctx.fillRect(x0-54,-4,w+108,4);ctx.fillRect(x0-36,-35,w+72,1.5);
  ctx.fillStyle=P.trim;ctx.fillRect(x0,yT,w,h-6);
  ctx.fillStyle='rgba(0,0,0,.14)';ctx.fillRect(x1-4,yT,4,h-6);
  var tx=x0+9,ty=yT+9,tw=w-18,th=30,tg=ctx.createLinearGradient(0,ty,0,ty+th);
  if(S.lit){tg.addColorStop(0,'#fff1b8');tg.addColorStop(1,'#f0a640');}else{tg.addColorStop(0,'#cfe0ea');tg.addColorStop(1,'#46677f');}
  ctx.fillStyle=tg;ctx.fillRect(tx,ty,tw,th);ctx.fillStyle=P.trim;for(var k=1;k<4;k++)ctx.fillRect(tx+k*tw/4-1.5,ty,3,th);
  var dx=x0+9,dy=yT+46,dw=w-18,dh=yB-6-dy;
  ctx.fillStyle=P.door;ctx.fillRect(dx,dy,dw,dh);
  var lg=ctx.createLinearGradient(dx,0,dx+dw,0);lg.addColorStop(0,'rgba(255,255,255,.14)');lg.addColorStop(1,'rgba(0,0,0,.25)');ctx.fillStyle=lg;ctx.fillRect(dx,dy,dw,dh);
  var pw=(dw-30)/2,ph=(dh-44)/3;
  for(var r=0;r<3;r++)for(var c=0;c<2;c++){var px=dx+10+c*(pw+10),py=dy+10+r*(ph+12);
    ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(px,py,pw,ph);ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(px,py,pw,2);ctx.fillRect(px,py,2,ph);
    ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(px,py+ph-2,pw,2);ctx.fillRect(px+pw-2,py,2,ph);}
  ctx.fillStyle='#d9b544';ctx.fillRect(dx+dw/2-15,dy+10+ph+3,30,5);
  ctx.fillStyle='#b8902e';ctx.fillRect(dx+dw-22,dy+dh*.5-12,7,24);
  ctx.fillStyle='#FFDD55';ctx.beginPath();ctx.arc(dx+dw-18.5,dy+dh*.53,5,0,7);ctx.fill();ctx.fillStyle='rgba(255,255,255,.7)';ctx.beginPath();ctx.arc(dx+dw-20,dy+dh*.53-1.5,1.6,0,7);ctx.fill();
  var lx=x1+42,ly=yT+70;
  if(S.lit){var lgw=ctx.createRadialGradient(lx,ly+16,0,lx,ly+16,90);lgw.addColorStop(0,'rgba(255,215,120,.6)');lgw.addColorStop(1,'rgba(255,215,120,0)');ctx.fillStyle=lgw;ctx.beginPath();ctx.arc(lx,ly+16,90,0,7);ctx.fill();}
  ctx.fillStyle='#1e1e1e';ctx.fillRect(lx-3,ly-8,6,10);ctx.fillRect(lx-12,ly,24,4);ctx.fillRect(lx-10,ly+4,20,28);ctx.fillRect(lx-12,ly+32,24,4);
  ctx.fillStyle=S.lit?'#ffe08a':'#d8c79a';ctx.fillRect(lx-7,ly+7,14,22);ctx.fillStyle='#1e1e1e';ctx.fillRect(lx-1,ly+7,2,22);
}
function drawOpenings(){
  if(S.settled<=N_F)return;
  var wallTop=S.settled>=N_F+N_B?-1e5:PY[S.settled-1];
  ctx.save();ctx.beginPath();ctx.rect(-400,wallTop,WW+800,1e5);ctx.clip();
  for(var k=0;k<OPEN.length;k++){
    var o=OPEN[k];if(S.settled<=courseStart[o[2]])continue;
    var x0=o[0],x1=o[1],yT=WALL_Y0-o[3]*CH,yB=WALL_Y0-o[2]*CH,w=x1-x0,h=yB-yT;
    if(k===0)drawDoor(x0,x1,yT,yB,w,h);else drawWindow(x0,x1,yT,yB,w,h);
    if(o[3]<COURSES&&S.settled>=courseStart[o[3]]){var lx=x0-12,lw=w+24;
      ctx.fillStyle='#cfc6b3';ctx.fillRect(lx,yT-13,lw,13);ctx.fillStyle='rgba(255,255,255,.3)';ctx.fillRect(lx,yT-13,lw,2);
      ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(lx,yT-2,lw,2);ctx.fillStyle='rgba(0,0,0,.16)';ctx.fillRect(lx,yT,lw,3);
      ctx.fillStyle='#ddd5c3';ctx.fillRect(x0+w/2-9,yT-17,18,17);ctx.fillStyle='rgba(0,0,0,.22)';ctx.fillRect(x0+w/2+7,yT-17,2,17);}
  }
  ctx.restore();
}
function drawChimney(){
  var x0=1330,x1=1414,top=R_Y0-R_H-64;function yAt(x){return R_Y0-R_H*((R_CX+R_WB/2)-x)/((R_WB-R_WR)/2);}
  ctx.fillStyle=P.brickT[3];ctx.beginPath();ctx.moveTo(x0,top);ctx.lineTo(x1,top);ctx.lineTo(x1,yAt(x1)+4);ctx.lineTo(x0,yAt(x0)+4);ctx.fill();
  ctx.fillStyle=P.mortar;for(var y=top+3,c=0;y<yAt(x1);y+=3,c++){ctx.fillRect(x0,y,x1-x0,.6);for(var x=x0+(c%2?4:0);x<x1;x+=8)ctx.fillRect(x,y-3,.6,3);}
  ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.moveTo(x1-18,top);ctx.lineTo(x1,top);ctx.lineTo(x1,yAt(x1)+4);ctx.lineTo(x1-18,yAt(x1-18)+4);ctx.fill();
  ctx.fillStyle='rgba(255,210,150,.15)';ctx.fillRect(x0,top,8,yAt(x0)-top);
  ctx.fillStyle='#bfb7a6';ctx.fillRect(x0-9,top-12,x1-x0+18,12);ctx.fillStyle='rgba(255,255,255,.3)';ctx.fillRect(x0-9,top-12,x1-x0+18,2);ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(x0-9,top-2,x1-x0+18,2);
  ctx.fillStyle='#8a5a3a';ctx.fillRect(x0+14,top-30,18,18);ctx.fillRect(x1-34,top-26,18,14);
  ctx.strokeStyle='rgba(60,60,60,.8)';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(x0-2,yAt(x0)+3);ctx.lineTo(x1+2,yAt(x1+2)+3);ctx.stroke();
}
function drawDetails(){
  var roofOn=S.settled>N_F+N_B;
  if(roofOn){ctx.fillStyle='rgba(0,0,0,.35)';ctx.fillRect(R_CX-R_WB/2+8,R_Y0+5,R_WB-16,7);
    ctx.fillStyle=P.trim;ctx.fillRect(R_CX-R_WB/2,R_Y0-2,R_WB,8);ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(R_CX-R_WB/2,R_Y0+4,R_WB,2);}
  if((roofOn&&ROW[S.settled-1]>=58)||S.settled>=N_ALL)drawChimney();
  if(S.settled>=N_ALL){
    ctx.strokeStyle=P.roofDark;ctx.lineWidth=6;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(R_CX-R_WB/2,R_Y0);ctx.lineTo(R_CX-R_WR/2,R_Y0-R_H);ctx.moveTo(R_CX+R_WB/2,R_Y0);ctx.lineTo(R_CX+R_WR/2,R_Y0-R_H);ctx.stroke();
    ctx.fillStyle=P.roofDark;ctx.fillRect(R_CX-R_WR/2-6,R_Y0-R_H-8,R_WR+12,11);ctx.fillStyle='rgba(255,255,255,.16)';ctx.fillRect(R_CX-R_WR/2-6,R_Y0-R_H-8,R_WR+12,3);
    ctx.fillStyle='#9a9182';ctx.beginPath();ctx.moveTo(818,0);ctx.lineTo(926,0);ctx.lineTo(962,40);ctx.lineTo(772,40);ctx.fill();
    ctx.fillStyle='rgba(0,0,0,.12)';for(var y=10;y<40;y+=10)ctx.fillRect(818-y*1.15,y,108+y*2.3,1.5);
    var bxs=[60,330,1420,1690];
    for(var j=0;j<bxs.length;j++){var bx=bxs[j];ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(bx+20,-6,70,10,0,0,7);ctx.fill();
      ctx.fillStyle='#2c5e2e';ctx.beginPath();ctx.ellipse(bx,-46,64,40,0,0,7);ctx.fill();ctx.fillStyle='#3f7d3c';ctx.beginPath();ctx.ellipse(bx-14,-58,40,24,0,0,7);ctx.fill();
      ctx.fillStyle='#5a9a4a';ctx.beginPath();ctx.ellipse(bx-24,-66,18,10,0,0,7);ctx.fill();
      ctx.fillStyle='#ffd166';for(var k=0;k<5;k++){ctx.beginPath();ctx.arc(bx-40+k*20,-40-(k%2)*16,3.5,0,7);ctx.fill();}}
  }
}
/* ===================== NEIGHBOURHOOD (decoration only) ===================== */
var LAKE={x0:-1400,x1:3000,y0:292,y1:700};function shoreY(x){return LAKE.y0+9*Math.sin(x/170)+5*Math.sin(x/53);}
function lakePath(c){c.beginPath();c.moveTo(LAKE.x0,LAKE.y1);for(var x=LAKE.x0;x<=LAKE.x1;x+=40)c.lineTo(x,shoreY(x));c.lineTo(LAKE.x1,LAKE.y1);c.closePath();}
var ROAD={side0:40,kerb0:62,asph0:70,asph1:220,kerb1:228,side1:252};
var TREES=[{x:-1150,b:10,t:'palm',s:.85,ph:7,lean:1},{x:-820,b:0,t:'round',s:.85,ph:3},{x:-600,b:-24,t:'pine',s:.9,ph:1},{x:-505,b:-28,t:'pine',s:.62,ph:2},
  {x:-80,b:28,t:'palm',s:1,ph:0,lean:-1},{x:2190,b:14,t:'round',s:1,ph:4},{x:2360,b:24,t:'palm',s:.9,ph:5,lean:1},{x:2520,b:6,t:'pine',s:.85,ph:6}];
var SCX0=-1400,SCY0=-60,SCW=4400,SCH=760;
var scnM=null;
function buildScenery(){if(scnM)return;var scn=document.createElement('canvas');scn.width=SCW;scn.height=SCH;
  var c=scn.getContext('2d'),r=mulberry(21),i,k,x,y;c.translate(-SCX0,-SCY0);
  var greens=['#4f7f30','#5e9238','#6fa544','#3f6b28','#82b452'];
  for(i=0;i<16000;i++){x=SCX0+r()*SCW;y=r()<.55?2+r()*38:ROAD.side1+4+r()*40;c.globalAlpha=.5+r()*.5;c.fillStyle=greens[(r()*5)|0];c.fillRect(x,y-4-r()*5,1.4,4+r()*5);}
  c.globalAlpha=1;
  var fc=['#ff6b8a','#ffd34d','#ffffff','#c77dff','#ff8c42'];
  var beds=[[250,16],[560,20],[1200,18],[1480,16],[-1000,18],[2500,20],[-300,272],[400,270],[1100,274],[1700,270],[2300,268],[-900,272]];
  for(var b=0;b<beds.length;b++){for(k=0;k<26;k++){x=beds[b][0]+(r()-.5)*120;y=beds[b][1]+(r()-.5)*14;c.fillStyle='#2f5a22';c.fillRect(x,y,1.2,6);c.fillStyle=fc[(r()*5)|0];c.beginPath();c.arc(x+.6,y,3+r()*1.5,0,7);c.fill();}}
  for(i=0;i<26000;i++){x=SCX0+r()*SCW;y=ROAD.asph0+r()*(ROAD.asph1-ROAD.asph0);c.fillStyle=r()<.5?'rgba(255,255,255,.08)':'rgba(0,0,0,.2)';c.fillRect(x,y,1.5+r()*2,1+r());}
  for(i=0;i<16;i++){x=SCX0+r()*SCW;y=ROAD.asph0+16+r()*110;c.fillStyle='rgba(0,0,0,.13)';c.fillRect(x,y,60+r()*90,16+r()*20);}
  c.fillStyle='rgba(0,0,0,.2)';for(x=SCX0;x<SCX0+SCW;x+=64){c.fillRect(x,ROAD.side0,1.5,ROAD.kerb0-ROAD.side0);c.fillRect(x+30,ROAD.kerb1,1.5,ROAD.side1-ROAD.kerb1);}
  c.fillStyle='#b9a77f';c.beginPath();c.moveTo(LAKE.x0,LAKE.y1);for(x=LAKE.x0;x<=LAKE.x1;x+=40)c.lineTo(x,shoreY(x)-12);c.lineTo(LAKE.x1,LAKE.y1);c.fill();
  for(i=0;i<500;i++){x=LAKE.x0+r()*(LAKE.x1-LAKE.x0);c.fillStyle=r()<.5?'#8f8466':'#d8c9a2';c.beginPath();c.ellipse(x,shoreY(x)-6+r()*6,4+r()*6,2.5+r()*2,0,0,7);c.fill();}
  c.save();lakePath(c);c.clip();
  var wg=c.createLinearGradient(0,LAKE.y0,0,LAKE.y1);wg.addColorStop(0,'#f3c48c');wg.addColorStop(.12,'#c9b9b4');wg.addColorStop(.35,'#7ea3c4');wg.addColorStop(1,'#1d4a74');
  c.fillStyle=wg;c.fillRect(LAKE.x0,LAKE.y0-20,LAKE.x1-LAKE.x0,LAKE.y1-LAKE.y0+20);
  c.fillStyle='rgba(255,255,255,.2)';for(i=0;i<220;i++)c.fillRect(LAKE.x0+r()*(LAKE.x1-LAKE.x0),LAKE.y0+r()*(LAKE.y1-LAKE.y0),30+r()*90,1.5);
  c.restore();
  var dx=1300;for(y=shoreY(dx)-6;y<520;y+=12){c.fillStyle=(y/12|0)%2?'#9a6a3a':'#8c5f33';c.fillRect(dx,y,90,11);c.fillStyle='rgba(0,0,0,.25)';c.fillRect(dx,y+10,90,1.5);}
  var posts=[380,450,520];for(i=0;i<3;i++){c.fillStyle='#5c3d22';c.fillRect(dx-4,posts[i]-10,8,34);c.fillRect(dx+86,posts[i]-10,8,34);}
  scnM=[scn];var src=scn;for(k=0;k<2;k++){var m=document.createElement('canvas');m.width=src.width/2;m.height=src.height/2;m.getContext('2d').drawImage(src,0,0,m.width,m.height);scnM.push(m);src=m;}
}
function blitScenery(z){var vx0=cam.x-cw/2/z,vx1=cam.x+cw/2/z,vy0=cam.y-ch/2/z,vy1=cam.y+ch/2/z;
  var x0=Math.max(SCX0,vx0),x1=Math.min(SCX0+SCW,vx1),y0=Math.max(SCY0,vy0),y1=Math.min(SCY0+SCH,vy1);if(x1<=x0||y1<=y0)return;
  var zz=z*dpr,lv=zz<.35?2:zz<.7?1:0,f=1/(1<<lv);ctx.imageSmoothingQuality='low';ctx.drawImage(scnM[lv],(x0-SCX0)*f,(y0-SCY0)*f,(x1-x0)*f,(y1-y0)*f,x0,y0,x1-x0,y1-y0);}
var shimmer=[];(function(){var r=mulberry(33);for(var i=0;i<70;i++)shimmer.push([LAKE.x0+400+r()*3600,LAKE.y0+15+r()*360,20+r()*60,r()*6]);})();
var ducks=[];
function drawLakeLife(now,shift){var t=now/1000,k;
  ctx.save();lakePath(ctx);ctx.clip();
  if(S.settled>0){var WL=LAKE.y0+6,src=S.settled>N_F+400?bm:null;
    if(src){var zz=cam.z*dpr,lo=zz<.6;if(lo)refreshMip(now);var im=lo?mip2:bm,f=lo?.25:1;ctx.save();ctx.globalAlpha=.42;ctx.translate(shift,WL);ctx.scale(1,-.5);var sl=lo?12:24,sh=BH/sl;
      for(k=0;k<sl;k++){var sy=k*sh,wy=BY0+sy;var off=Math.sin(t*1.7+k*.9)*(3+(sl-k)*.4);ctx.drawImage(im,0,sy*f,BW*f,sh*f,BX0+off,wy,BW,sh+.5);}
      ctx.restore();}}
  for(k=0;k<shimmer.length;k++){var s=shimmer[k],a=.5+.5*Math.sin(t*1.6+s[3]);ctx.fillStyle='rgba(255,255,255,'+(a*.5)+')';ctx.fillRect(s[0]+Math.sin(t+s[3])*8,s[1],s[2]*(.6+.4*a),2);}
  var bx=500+Math.sin(t*.25)*60,by=440+Math.sin(t*1.3)*2.5,tl=Math.sin(t*1.1)*.03;
  ctx.save();ctx.translate(bx,by);ctx.rotate(tl);ctx.scale(1.6,1.6);
  ctx.fillStyle='rgba(20,40,60,.3)';ctx.beginPath();ctx.ellipse(0,6,74,6,0,0,7);ctx.fill();
  ctx.fillStyle='#b5442f';ctx.beginPath();ctx.moveTo(-72,-16);ctx.lineTo(72,-18);ctx.quadraticCurveTo(64,4,46,5);ctx.lineTo(-50,5);ctx.quadraticCurveTo(-66,2,-72,-16);ctx.fill();
  ctx.fillStyle='#e8dcc5';ctx.fillRect(-70,-18,141,4);ctx.fillStyle='rgba(0,0,0,.2)';ctx.fillRect(-60,-4,110,2);
  ctx.strokeStyle='#7a5530';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-20,-22);ctx.lineTo(30,10);ctx.stroke();
  ctx.fillStyle='#e74c3c';ctx.fillRect(-8,-52,18,32);ctx.fillStyle='#f1c27d';ctx.beginPath();ctx.arc(1,-62,10,0,7);ctx.fill();ctx.fillStyle='#f2c230';ctx.beginPath();ctx.arc(1,-66,11,Math.PI,0);ctx.fill();
  ctx.restore();
  for(k=0;k<ducks.length;k++){var d=ducks[k],yy=d.y+Math.sin(t*2+d.ph)*1.2;ctx.save();ctx.translate(d.x,yy);ctx.scale(1.5,1.5);ctx.translate(-d.x,-yy);
    ctx.strokeStyle='rgba(255,255,255,.35)';ctx.lineWidth=1;ctx.beginPath();ctx.ellipse(d.x,yy+5,22,3,0,0,7);ctx.stroke();
    ctx.fillStyle=d.c;ctx.beginPath();ctx.ellipse(d.x,yy,16,7,0,0,7);ctx.fill();ctx.beginPath();ctx.moveTo(d.x-d.d*14,yy-3);ctx.lineTo(d.x-d.d*22,yy-8);ctx.lineTo(d.x-d.d*14,yy+1);ctx.fill();
    ctx.fillStyle=d.c==='#f2efe8'?'#f2efe8':'#1f6b3a';ctx.beginPath();ctx.arc(d.x+d.d*13,yy-9,6,0,7);ctx.fill();
    ctx.fillStyle='#f08a24';ctx.beginPath();ctx.moveTo(d.x+d.d*18,yy-10);ctx.lineTo(d.x+d.d*26,yy-8);ctx.lineTo(d.x+d.d*18,yy-6);ctx.fill();
    ctx.fillStyle='#111';ctx.fillRect(d.x+d.d*14,yy-11,1.6,1.6);ctx.restore();}
  ctx.restore();}
function drawTree(t,now){var sway=Math.sin(now/1000*.9+t.ph)*.02,k,b;ctx.save();ctx.translate(t.x,t.b);ctx.scale(t.s,t.s);
  ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.ellipse(50,0,t.t==='palm'?150:230,14,0,0,7);ctx.fill();
  if(t.t==='round'){
    ctx.fillStyle='#5a3d26';ctx.beginPath();ctx.moveTo(-24,0);ctx.lineTo(24,0);ctx.lineTo(13,-430);ctx.lineTo(-13,-430);ctx.fill();
    ctx.fillStyle='rgba(0,0,0,.28)';ctx.beginPath();ctx.moveTo(4,0);ctx.lineTo(24,0);ctx.lineTo(13,-430);ctx.lineTo(4,-430);ctx.fill();
    ctx.strokeStyle='#5a3d26';ctx.lineWidth=12;ctx.beginPath();ctx.moveTo(0,-330);ctx.lineTo(-90,-480);ctx.moveTo(0,-370);ctx.lineTo(80,-500);ctx.stroke();
    ctx.translate(0,-300);ctx.rotate(sway);ctx.translate(0,300);
    var blobs=[[0,-620,250,'#2a5426'],[-160,-560,165,'#2a5426'],[160,-560,165,'#244b22'],[-90,-700,180,'#3a7231'],[100,-690,170,'#356a2e'],[0,-790,150,'#468638'],[-130,-650,115,'#559841'],[-50,-770,95,'#67aa4a'],[140,-620,90,'#2f5f2b']];
    for(k=0;k<blobs.length;k++){b=blobs[k];ctx.fillStyle=b[3];ctx.beginPath();ctx.arc(b[0],b[1],b[2],0,7);ctx.fill();}
    ctx.fillStyle='rgba(255,220,150,.18)';ctx.beginPath();ctx.arc(-110,-720,90,0,7);ctx.fill();
  }else if(t.t==='pine'){
    ctx.fillStyle='#4e3420';ctx.fillRect(-13,-210,26,210);ctx.fillStyle='rgba(0,0,0,.3)';ctx.fillRect(2,-210,11,210);
    ctx.translate(0,-150);ctx.rotate(sway*.6);ctx.translate(0,150);
    for(k=0;k<5;k++){var w=250-k*46,yb=-150-k*150,h=260;
      ctx.fillStyle=k%2?'#2a5a34':'#24502f';ctx.beginPath();ctx.moveTo(-w,yb);ctx.lineTo(w,yb);ctx.lineTo(0,yb-h);ctx.fill();
      ctx.fillStyle='rgba(0,0,0,.22)';ctx.beginPath();ctx.moveTo(0,yb);ctx.lineTo(w,yb);ctx.lineTo(0,yb-h);ctx.fill();
      ctx.fillStyle='rgba(255,220,150,.12)';ctx.beginPath();ctx.moveTo(-w,yb);ctx.lineTo(-w*.6,yb);ctx.lineTo(0,yb-h);ctx.fill();}
  }else{
    var l=t.lean||1,tx=l*170,ty=-820;
    for(k=0;k<16;k++){var a=k/16,bb=(k+1)/16,P0=[l*-30*2*a*(1-a)+tx*a*a,-420*2*a*(1-a)+ty*a*a],P1=[l*-30*2*bb*(1-bb)+tx*bb*bb,-420*2*bb*(1-bb)+ty*bb*bb];
      ctx.strokeStyle=k%2?'#8a6a45':'#7a5c3a';ctx.lineWidth=32-k;ctx.lineCap='butt';ctx.beginPath();ctx.moveTo(P0[0],P0[1]);ctx.lineTo(P1[0],P1[1]);ctx.stroke();}
    ctx.translate(tx,ty);ctx.rotate(sway*1.6);
    for(k=0;k<9;k++){var an=-Math.PI+k*Math.PI/8+(k%2?.1:-.05),L=270,ex=Math.cos(an)*L,ey=Math.sin(an)*L*.55+110*Math.abs(Math.cos(an))+40;
      ctx.fillStyle=k%2?'#3c7d2f':'#2f6a26';ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(ex*.5,ey*.5-80,ex,ey);ctx.quadraticCurveTo(ex*.5,ey*.5-30,0,0);ctx.fill();
      ctx.strokeStyle='rgba(150,200,90,.6)';ctx.lineWidth=4;ctx.lineCap='round';ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(ex*.5,ey*.5-58,ex,ey);ctx.stroke();}
    ctx.fillStyle='#6b4a1f';var nuts=[[-14,22],[12,24],[0,34]];for(k=0;k<3;k++){ctx.beginPath();ctx.arc(nuts[k][0],nuts[k][1],15,0,7);ctx.fill();}
  }
  ctx.restore();}
function drawSceneryBack(now,z){
  ctx.fillStyle='#b9b4aa';ctx.fillRect(-8000,ROAD.side0,16000,ROAD.kerb0-ROAD.side0);
  ctx.fillStyle='#8e8a82';ctx.fillRect(-8000,ROAD.kerb0,16000,ROAD.asph0-ROAD.kerb0);ctx.fillStyle='#dcd7cd';ctx.fillRect(-8000,ROAD.kerb0,16000,2.5);
  ctx.fillStyle='#45464b';ctx.fillRect(-8000,ROAD.asph0,16000,ROAD.asph1-ROAD.asph0);ctx.fillStyle='rgba(0,0,0,.28)';ctx.fillRect(-8000,ROAD.asph0,16000,6);
  ctx.fillStyle='#8e8a82';ctx.fillRect(-8000,ROAD.asph1,16000,ROAD.kerb1-ROAD.asph1);ctx.fillStyle='#dcd7cd';ctx.fillRect(-8000,ROAD.asph1,16000,2.5);
  ctx.fillStyle='#bdb8ae';ctx.fillRect(-8000,ROAD.kerb1,16000,ROAD.side1-ROAD.kerb1);
  ctx.fillStyle='#1d4a74';ctx.fillRect(-8000,LAKE.y1-2,16000,4000);ctx.fillStyle='#2a5a86';ctx.fillRect(-8000,ROAD.side1+40,LAKE.x0+8000,LAKE.y1-ROAD.side1-40);ctx.fillRect(LAKE.x1,ROAD.side1+40,8000,LAKE.y1-ROAD.side1-40);
  blitScenery(z);
  ctx.fillStyle='rgba(245,245,240,.85)';ctx.fillRect(-8000,ROAD.asph0+9,16000,3);ctx.fillRect(-8000,ROAD.asph1-12,16000,3);
  ctx.fillStyle='#f2c230';var vx0=cam.x-cw/2/z,vx1=cam.x+cw/2/z;for(var x=Math.floor(vx0/120)*120;x<vx1;x+=120)ctx.fillRect(x,143,64,4);
  drawLakeLife(now,curShift);
  for(var i=0;i<TREES.length;i++)drawTree(TREES[i],now);
}
var CAR_COLS=['#c0392b','#f1f1ee','#2c5aa0','#b9bfc7','#f2c230','#1f2124','#2e7d4f','#e67e22'];
function drawCar(c,car){
  var L=car.type==='jeep'?720:560,hx=-L/2,x,k,g;c.save();c.translate(car.x,car.y);var sc=car.sc||1;c.scale(sc*car.dir,sc);
  c.fillStyle='rgba(0,0,0,.35)';c.beginPath();c.ellipse(0,-2,L*.5,12,0,0,7);c.fill();
  if(!car.parked){var bg=c.createLinearGradient(L/2,0,L/2+320,0);bg.addColorStop(0,'rgba(255,240,180,.38)');bg.addColorStop(1,'rgba(255,240,180,0)');c.fillStyle=bg;c.beginPath();c.moveTo(L/2-12,-102);c.lineTo(L/2+320,-150);c.lineTo(L/2+320,-20);c.lineTo(L/2-12,-86);c.fill();}
  if(car.type==='jeep'){
    g=c.createLinearGradient(0,-200,0,-40);g.addColorStop(0,'#f4f6f8');g.addColorStop(.5,'#bcc3cb');g.addColorStop(1,'#7d858e');
    c.fillStyle=g;c.beginPath();c.moveTo(hx+10,-44);c.lineTo(hx+4,-162);c.lineTo(hx+L-150,-162);c.lineTo(hx+L-118,-126);c.lineTo(hx+L-10,-116);c.lineTo(hx+L-4,-60);c.lineTo(hx+L-14,-44);c.closePath();c.fill();
    c.fillStyle=car.col;c.fillRect(hx-6,-212,L-126,20);c.fillStyle='rgba(255,255,255,.3)';c.fillRect(hx-6,-212,L-126,4);
    c.fillStyle='rgba(20,30,40,.8)';for(x=hx+26;x<hx+L-180;x+=68)c.fillRect(x,-190,54,30);
    c.fillStyle='#6b4a32';for(x=hx+50,k=0;x<hx+L-180;x+=68,k++)if(k%2===0){c.beginPath();c.arc(x+8,-172,10,0,7);c.fill();}
    c.fillStyle='#dfe3e8';for(x=hx+18;x<hx+L-150;x+=68)c.fillRect(x,-192,8,32);
    c.fillStyle='rgba(30,50,70,.85)';c.beginPath();c.moveTo(hx+L-152,-190);c.lineTo(hx+L-140,-190);c.lineTo(hx+L-122,-160);c.lineTo(hx+L-152,-160);c.fill();
    c.fillStyle='#d6312f';c.fillRect(hx+6,-124,L-130,8);c.fillStyle='#1f5fbf';c.fillRect(hx+6,-114,L-130,6);c.fillStyle='#f2c230';c.fillRect(hx+6,-106,L-130,4);
    c.fillStyle='#e9ecef';c.fillRect(hx+L-16,-112,10,52);c.fillStyle='#c9a227';c.fillRect(hx+L-90,-136,10,12);
  }else{
    var p=new Path2D();p.moveTo(hx+30,-46);p.lineTo(hx+10,-60);p.quadraticCurveTo(hx+2,-104,hx+30,-112);p.lineTo(hx+L*.27,-124);p.lineTo(hx+L*.37,-170);p.quadraticCurveTo(hx+L*.4,-178,hx+L*.46,-178);
    p.lineTo(hx+L*.62,-178);p.quadraticCurveTo(hx+L*.67,-177,hx+L*.7,-170);p.lineTo(hx+L*.8,-128);p.lineTo(hx+L-34,-118);p.quadraticCurveTo(hx+L-4,-110,hx+L-4,-72);p.lineTo(hx+L-14,-46);p.closePath();
    c.fillStyle=car.col;c.fill(p);
    g=c.createLinearGradient(0,-180,0,-44);g.addColorStop(0,'rgba(255,255,255,.3)');g.addColorStop(.45,'rgba(255,255,255,0)');g.addColorStop(.55,'rgba(0,0,0,.08)');g.addColorStop(1,'rgba(0,0,0,.38)');c.fillStyle=g;c.fill(p);
    var gl=c.createLinearGradient(0,-168,0,-128);gl.addColorStop(0,'#a9c3d6');gl.addColorStop(1,'#26384a');c.fillStyle=gl;
    c.beginPath();c.moveTo(hx+L*.31,-128);c.lineTo(hx+L*.385,-166);c.lineTo(hx+L*.52,-166);c.lineTo(hx+L*.52,-128);c.fill();
    c.beginPath();c.moveTo(hx+L*.545,-128);c.lineTo(hx+L*.545,-166);c.lineTo(hx+L*.64,-166);c.lineTo(hx+L*.72,-128);c.fill();
    c.fillStyle='rgba(255,255,255,.25)';c.beginPath();c.moveTo(hx+L*.4,-160);c.lineTo(hx+L*.44,-160);c.lineTo(hx+L*.4,-134);c.lineTo(hx+L*.36,-134);c.fill();
    c.fillStyle='rgba(0,0,0,.35)';c.fillRect(hx+L*.533,-128,2.5,76);c.fillRect(hx+L*.3,-118,2.5,66);c.fillRect(hx+L*.46,-112,18,4);c.fillRect(hx+L*.68,-112,18,4);
    c.fillStyle='rgba(255,255,255,.28)';c.fillRect(hx+20,-100,L-50,2.5);
    c.fillStyle='#2b2b2b';c.fillRect(hx+L-22,-66,20,14);c.fillRect(hx+2,-66,20,14);
  }
  var wxs=[hx+L*.19,hx+L*.8];
  for(var w=0;w<2;w++){var wx=wxs[w];c.fillStyle='#111';c.beginPath();c.arc(wx,-44,54,Math.PI,0);c.fill();
    c.fillStyle='#1a1a1a';c.beginPath();c.arc(wx,-44,44,0,7);c.fill();c.fillStyle='#c9cdd3';c.beginPath();c.arc(wx,-44,26,0,7);c.fill();
    c.strokeStyle='#7d838a';c.lineWidth=5;c.beginPath();for(k=0;k<5;k++){var a=(car.rot||0)+k*1.2566;c.moveTo(wx,-44);c.lineTo(wx+Math.cos(a)*24,-44+Math.sin(a)*24);}c.stroke();
    c.fillStyle='#5c6168';c.beginPath();c.arc(wx,-44,7,0,7);c.fill();}
  c.fillStyle='#fff3c4';c.beginPath();c.ellipse(hx+L-12,-96,8,10,0,0,7);c.fill();
  c.fillStyle='#e0262b';c.fillRect(hx+3,-106,10,22);
  if(!car.parked){var rg=c.createRadialGradient(hx+6,-95,0,hx+6,-95,40);rg.addColorStop(0,'rgba(255,40,40,.45)');rg.addColorStop(1,'rgba(255,40,40,0)');c.fillStyle=rg;c.fillRect(hx-40,-140,90,90);}
  c.restore();}
var SKINS=['#f1c27d','#c68642','#8d5524','#e0ac69','#ffdbac'],HAIRS=['#2b1d14','#4a3020','#111111','#7a5230'],
  SHIRTS=['#e74c3c','#3498db','#f1c40f','#9b59b6','#1abc9c','#ffffff','#e67e22','#ff7eb6'],PANTS=['#2c3e50','#34495e','#5d6d7e','#1f3a5f','#7f6a52'];
function drawPerson(p,now){var s=p.s;ctx.save();ctx.translate(p.x,p.y);
  ctx.fillStyle='rgba(0,0,0,.25)';ctx.beginPath();ctx.ellipse(0,0,30*s,5*s,0,0,7);ctx.fill();
  ctx.scale(p.dir,1);
  if(p.dog){var dx=110*s,lg=Math.sin(p.ph*1.6)*.5;ctx.strokeStyle=p.dogc;ctx.lineWidth=6*s;ctx.lineCap='round';ctx.beginPath();
    var legs=[[-20,0],[-12,Math.PI],[18,Math.PI],[26,0]];
    for(var k=0;k<4;k++){var ox=legs[k][0],a0=lg*(legs[k][1]?1:-1);ctx.moveTo(dx+ox*s,-36*s);ctx.lineTo(dx+ox*s+Math.sin(a0)*24*s,-36*s+Math.cos(a0)*34*s);}ctx.stroke();
    ctx.fillStyle=p.dogc;ctx.beginPath();ctx.ellipse(dx,-42*s,34*s,13*s,0,0,7);ctx.fill();ctx.beginPath();ctx.arc(dx+36*s,-56*s,12*s,0,7);ctx.fill();
    ctx.beginPath();ctx.ellipse(dx+48*s,-53*s,8*s,5*s,0,0,7);ctx.fill();ctx.fillStyle='rgba(0,0,0,.35)';ctx.beginPath();ctx.ellipse(dx+30*s,-60*s,5*s,9*s,.4,0,7);ctx.fill();
    ctx.strokeStyle=p.dogc;ctx.lineWidth=5*s;ctx.beginPath();ctx.moveTo(dx-32*s,-46*s);ctx.quadraticCurveTo(dx-44*s,-62*s,dx-40*s,-74*s+Math.sin(p.ph*3)*4*s);ctx.stroke();}
  var run=p.run,sw=p.builder?0:Math.sin(p.ph)*(run?.8:.45),bob=p.builder?0:Math.abs(Math.cos(p.ph))*(run?9:4)*s;
  ctx.translate(0,-bob);ctx.lineCap='round';
  var hipY=-98*s,shY=-168*s;
  function leg(a,col){var kx=Math.sin(a)*50*s,ky=hipY+Math.cos(a)*50*s,bend=run?Math.max(0,-Math.sin(a))*1.1+.2:Math.max(0,-a)*.6,a2=a-bend,fx=kx+Math.sin(a2)*50*s,fy=ky+Math.cos(a2)*50*s;
    ctx.strokeStyle=col;ctx.lineWidth=15*s;ctx.beginPath();ctx.moveTo(0,hipY);ctx.lineTo(kx,ky);ctx.lineTo(fx,fy);ctx.stroke();ctx.fillStyle='#222';ctx.beginPath();ctx.ellipse(fx+7*s,fy+1*s,11*s,5*s,0,0,7);ctx.fill();}
  function arm(a,col,bendX){var sy=shY+6*s,ex=Math.sin(a)*38*s,ey=sy+Math.cos(a)*38*s,a2=a+(bendX!==undefined?bendX:(run?1.5:.35)),hx=ex+Math.sin(a2)*36*s,hy=ey+Math.cos(a2)*36*s;
    ctx.strokeStyle=col;ctx.lineWidth=11*s;ctx.beginPath();ctx.moveTo(0,sy);ctx.lineTo(ex,ey);ctx.lineTo(hx,hy);ctx.stroke();ctx.fillStyle=p.skin;ctx.beginPath();ctx.arc(hx,hy,6*s,0,7);ctx.fill();return[hx,hy];}
  leg(-sw,shade(p.pants,.7));if(!p.builder)arm(sw,shade(p.shirt,.75));
  ctx.fillStyle=p.shirt;ctx.beginPath();if(ctx.roundRect)ctx.roundRect(-18*s,shY-4*s,36*s,hipY-shY+14*s,9*s);else ctx.rect(-18*s,shY-4*s,36*s,hipY-shY+14*s);ctx.fill();
  if(p.builder){ctx.fillStyle='#ff7a1a';ctx.fillRect(-18*s,shY,36*s,hipY-shY+6*s);ctx.fillStyle='#e8ff5a';ctx.fillRect(-18*s,shY+30*s,36*s,5*s);ctx.fillRect(-18*s,shY+50*s,36*s,5*s);}
  ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(4*s,shY-2*s,14*s,hipY-shY+10*s);
  leg(sw,p.pants);
  var hand;
  if(p.builder){var a=-1.3+.9*Math.max(0,Math.sin(now/170));hand=arm(a,p.shirt,-.6);var hx=hand[0],hy=hand[1];
    ctx.strokeStyle='#7a5530';ctx.lineWidth=5*s;ctx.beginPath();ctx.moveTo(hx,hy);ctx.lineTo(hx+Math.sin(a-.6+1.57)*30*s,hy+Math.cos(a-.6+1.57)*30*s);ctx.stroke();
    ctx.fillStyle='#555';ctx.beginPath();ctx.arc(hx+Math.sin(a-.6+1.57)*30*s,hy+Math.cos(a-.6+1.57)*30*s,6*s,0,7);ctx.fill();}
  else hand=arm(p.dog?.7:-sw,p.shirt,p.dog?-.2:undefined);
  ctx.fillStyle=p.skin;ctx.fillRect(-5*s,shY-14*s,10*s,12*s);ctx.beginPath();ctx.arc(3*s,shY-30*s,19*s,0,7);ctx.fill();
  ctx.fillStyle='#111';ctx.beginPath();ctx.arc(14*s,shY-33*s,2*s,0,7);ctx.fill();
  if(p.builder){ctx.fillStyle='#f5c518';ctx.beginPath();ctx.arc(3*s,shY-36*s,21*s,Math.PI,0);ctx.fill();ctx.fillRect(-20*s,shY-38*s,48*s,5*s);ctx.fillStyle='rgba(255,255,255,.4)';ctx.fillRect(-6*s,shY-54*s,10*s,3*s);}
  else{ctx.fillStyle=p.hair;ctx.beginPath();ctx.arc(1*s,shY-34*s,19*s,Math.PI*.85,Math.PI*2.05);ctx.fill();if(p.pony){ctx.beginPath();ctx.ellipse(-20*s,shY-26*s,7*s,14*s,.4,0,7);ctx.fill();}}
  if(p.dog){ctx.strokeStyle='rgba(30,30,30,.8)';ctx.lineWidth=2*s;ctx.beginPath();ctx.moveTo(hand[0],hand[1]);ctx.quadraticCurveTo(70*s,-40*s+bob,(110+30)*s,-52*s+bob);ctx.stroke();}
  ctx.restore();}
var people=[],cars=[],nextCar=4,nextPerson=2,birds=[],nextBird=1,stCars=[],nextStCar=.5;
var PARKED={x:2140,y:112,dir:-1,type:'car',col:'#f1f1ee',parked:true,rot:.4};
var BUILDER={x:1800,y:34,dir:-1,s:1,builder:true,skin:'#c68642',shirt:'#3a5f8a',pants:'#2c3e50',hair:'#111',ph:0};
function pick(a){return a[(Math.random()*a.length)|0];}
function spawnPerson(x,dir){var k=Math.random(),p={x:x!==undefined?x:(Math.random()<.5?-2200:4000),y:58,ph:Math.random()*6,s:1,skin:pick(SKINS),hair:pick(HAIRS),shirt:pick(SHIRTS),pants:pick(PANTS),pony:Math.random()<.4};
  p.dir=dir||(p.x<0?1:-1);
  if(k<.2){p.run=true;p.v=340;p.shirt=pick(['#ff4d6d','#00b4d8','#80ed99']);}else if(k<.42){p.dog=true;p.dogc=pick(['#c8a165','#3b2a1a','#f2e6d0','#8a6a45']);p.v=120;}
  else if(k<.62){p.s=.62;p.v=120;}else p.v=135;
  people.push(p);return p;}
function spawnCar(x,lane){lane=lane!==undefined?lane:(Math.random()<.5?0:1);var dir=lane===0?1:-1;
  cars.push({x:x!==undefined?x:(dir>0?-2600:4400),y:lane===0?140:205,lane:lane,dir:dir,type:Math.random()<.25?'jeep':'car',col:pick(CAR_COLS),v:700+Math.random()*450,rot:0});}
function resetWorld(){
  people=[];cars=[];birds=[];stCars=[];nextCar=4;nextPerson=2;nextBird=1;nextStCar=.5;parts=[];
  ducks=[{x:-200,y:360,d:1,ph:0,c:'#7a5a3a',a:-500,b:600},{x:-140,y:372,d:1,ph:1.3,c:'#8c6a45',a:-500,b:600},{x:1900,y:400,d:-1,ph:2,c:'#f2efe8',a:1500,b:2500}];
  spawnPerson(250,1);var dg=spawnPerson(1350,-1);dg.run=false;dg.dog=true;dg.v=120;dg.dogc='#c8a165';spawnPerson(-250,1).s=.62;spawnPerson(2300,-1);spawnCar(1500,1);
  for(var i=0;i<3;i++)stCars.push({x:150+i*300,y:i%2?129:113,dir:i%2?-1:1,sc:.075,type:i===1?'jeep':'car',col:CAR_COLS[i*2],v:70,rot:0});
}
function spawnBirds(){var dir=Math.random()<.5?1:-1,y=(.08+Math.random()*.22)*ch,n=3+((Math.random()*3)|0);for(var k=0;k<n;k++)birds.push({x:dir>0?-30-k*22:cw+30+k*22,y:y+(k%2)*9+k*3,vx:dir*(36+Math.random()*10),ph:Math.random()*6});}
function updateWorld(dt){
  var i,c,p,b;
  for(i=cars.length-1;i>=0;i--){c=cars[i];c.x+=c.dir*c.v*dt;c.rot+=c.dir*c.v*dt/44;if(c.x<-2800||c.x>4600)cars.splice(i,1);}
  if((nextCar-=dt)<=0){nextCar=3+Math.random()*6;if(cars.length<3)spawnCar();}
  for(i=people.length-1;i>=0;i--){p=people[i];p.x+=p.dir*p.v*dt;p.ph+=dt*(p.run?11:6.5);if(p.x<-2400||p.x>4200)people.splice(i,1);}
  if((nextPerson-=dt)<=0){nextPerson=2.5+Math.random()*5;if(people.length<6)spawnPerson();}
  for(i=0;i<ducks.length;i++){var d=ducks[i];d.x+=d.d*dt*14;d.ph+=dt;if(d.x>d.b||d.x<d.a)d.d*=-1;}
  for(i=birds.length-1;i>=0;i--){b=birds[i];b.x+=b.vx*dt;b.ph+=dt*9;if(b.x<-200||b.x>cw+200)birds.splice(i,1);}
  if((nextBird-=dt)<=0){nextBird=7+Math.random()*9;spawnBirds();}
  for(i=stCars.length-1;i>=0;i--){c=stCars[i];c.x+=c.dir*c.v*dt;c.rot+=c.dir*c.v*dt/3.3;if(c.x<-80||c.x>SW+80)stCars.splice(i,1);}
  if((nextStCar-=dt)<=0){nextStCar=2+Math.random()*4;var lane=Math.random()<.5?0:1,dir=lane?-1:1;stCars.push({x:dir>0?-60:SW+60,y:lane?129:113,dir:dir,sc:.075,type:Math.random()<.25?'jeep':'car',col:pick(CAR_COLS),v:60+Math.random()*50,rot:0});}
}
function drawBirds(){ctx.strokeStyle='rgba(40,35,55,.85)';ctx.lineWidth=1.6;ctx.lineCap='round';ctx.beginPath();
  for(var i=0;i<birds.length;i++){var b=birds[i],f=Math.sin(b.ph)*4;ctx.moveTo(b.x-7,b.y-f);ctx.quadraticCurveTo(b.x-3,b.y-2,b.x,b.y);ctx.quadraticCurveTo(b.x+3,b.y-2,b.x+7,b.y-f);}ctx.stroke();}
function drawSite(now){
  var fRem=1-Math.min(S.settled,N_F)/N_F,bRem=1-Math.max(0,Math.min(S.settled-N_F,N_B))/N_B,sRem=1-Math.max(0,S.settled-N_F-N_B)/N_S,gy=30,k,r;
  ctx.fillStyle='#2e7d4f';ctx.beginPath();ctx.moveTo(1500,-34);ctx.lineTo(1630,-34);ctx.lineTo(1612,0);ctx.lineTo(1520,0);ctx.fill();ctx.fillStyle='rgba(0,0,0,.25)';ctx.fillRect(1500,-34,130,5);
  ctx.fillStyle=S.settled<N_F?'#9a9a94':P.brickT[5];ctx.beginPath();ctx.ellipse(1565,-36,58,10,0,Math.PI,0);ctx.fill();
  ctx.strokeStyle='#444';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(1630,-20);ctx.lineTo(1470,-4);ctx.moveTo(1530,0);ctx.lineTo(1524,24);ctx.stroke();
  ctx.fillStyle='#1a1a1a';ctx.beginPath();ctx.arc(1640,14,17,0,7);ctx.fill();ctx.fillStyle='#999';ctx.beginPath();ctx.arc(1640,14,6,0,7);ctx.fill();
  if(S.settled>N_F+600){var top=Math.max(ROOF_B-30,PY[Math.min(S.settled,N_F+N_B)-1]-20);ctx.strokeStyle='#b8873e';ctx.lineWidth=6;ctx.beginPath();ctx.moveTo(1676,gy);ctx.lineTo(1668,top);ctx.moveTo(1720,gy);ctx.lineTo(1712,top);
    for(var y=gy-20;y>top+6;y-=34){ctx.moveTo(1674,y);ctx.lineTo(1718,y);}ctx.stroke();}
  var n=Math.ceil(fRem*6);for(k=0;k<n;k++){var bx=1850+(k%3)*42+(k>=3?21:0),by=gy-(k>=3?26:0);ctx.fillStyle='#ddd7c9';ctx.fillRect(bx,by-26,40,26);ctx.fillStyle='rgba(0,0,0,.18)';ctx.fillRect(bx+28,by-26,12,26);ctx.fillStyle='#c0392b';ctx.fillRect(bx+8,by-17,22,7);}
  ctx.fillStyle='#9b7448';ctx.fillRect(1990,gy-12,170,12);ctx.fillStyle='#6e5132';for(var x=1995;x<2155;x+=40)ctx.fillRect(x,gy-12,8,12);
  var rows=Math.ceil(bRem*9);for(r=0;r<rows;r++)for(k=0;k<8;k++){ctx.fillStyle=P.brickT[(r*8+k)%28];ctx.fillRect(1993+k*20+(r%2?5:0),gy-12-(r+1)*10,18,9);}
  var sb=Math.ceil(sRem*5);for(k=0;k<sb;k++){ctx.fillStyle=P.roofT[(k*3)%28];ctx.fillRect(2175,gy-(k+1)*12,90,11);ctx.fillStyle='rgba(255,255,255,.18)';ctx.fillRect(2175,gy-(k+1)*12,90,2);}
  drawPerson(BUILDER,now);
}
function drawFence(){var y0=34,top=-18;ctx.fillStyle='#f4f1ea';
  for(var x=-30;x<1880;x+=22){if(x>772&&x<962)continue;ctx.beginPath();ctx.moveTo(x,y0);ctx.lineTo(x,top+6);ctx.lineTo(x+5.5,top);ctx.lineTo(x+11,top+6);ctx.lineTo(x+11,y0);ctx.fill();}
  ctx.fillRect(-34,-6,820,5);ctx.fillRect(958,-6,928,5);ctx.fillRect(-34,18,820,5);ctx.fillRect(958,18,928,5);
  ctx.fillStyle='rgba(0,0,0,.14)';ctx.fillRect(-34,-1,820,2);ctx.fillRect(958,-1,928,2);ctx.fillRect(-34,23,820,2);ctx.fillRect(958,23,928,2);
  ctx.fillStyle='#ffffff';ctx.fillRect(772,-30,16,64);ctx.fillRect(946,-30,16,64);ctx.fillRect(768,-36,24,7);ctx.fillRect(942,-36,24,7);}
function drawSceneryFront(now){
  var i;
  if(S.settled<N_ALL&&!S.completing)drawSite(now);
  if(S.settled>=N_F)drawFence();
  for(i=0;i<people.length;i++)drawPerson(people[i],now);
  drawCar(ctx,PARKED);
  for(i=0;i<cars.length;i++)if(cars[i].lane===0)drawCar(ctx,cars[i]);
  for(i=0;i<cars.length;i++)if(cars[i].lane===1)drawCar(ctx,cars[i]);
}

/* ===================== DOM ===================== */
function fmt(n){return Math.round(n).toLocaleString('en-US');}
var lastShown=-1,bumpT=0;
function bump(){var b=els.bigCount;if(!b)return;if(performance.now()-bumpT>120){b.classList.add('hv-bump');bumpT=performance.now();setTimeout(function(){if(b)b.classList.remove('hv-bump');},110);}}
function phaseInfo(){
  var b=S.built;
  if(S.completing)return[T('tag_complete'),T('ph_complete')];
  if(b<N_F)return[T('tag_foundation',Math.floor(b/F_PER)+1,F_LAYERS),T('ph_foundation')];
  if(b<N_F+N_B)return[T('tag_bricks',ROW[b]+1,COURSES),T('ph_bricks')];
  return[T('tag_roof',ROW[Math.min(b,N_ALL-1)]+1,R_ROWS),T('ph_roof')];
}
function fmtTime(sec){return sec<1?T('t_lt1'):sec<90?T('t_sec',Math.ceil(sec)):sec<5400?T('t_min',Math.ceil(sec/60)):T('t_hr',(sec/3600).toFixed(1));}
function setText(el,s){if(el&&el.textContent!==s)el.textContent=s;}
function updateDOM(){
  var pend=pendingN();
  var key=S.built*7+S.houses*1e6+(S.completing?3:0)+cam.z+pend*13+SPEED*.001;
  if(key===lastShown)return;lastShown=key;
  var b=S.built,f=Math.min(b,N_F),br=Math.max(0,Math.min(b-N_F,N_B)),sh=Math.max(0,b-N_F-N_B);
  if(els.bigCount){els.bigNum.textContent=fmt(b);setText(els.bigOf,T('of_coins',fmt(N_ALL)));}
  setText(els.houseLbl,T('house_lbl',fmt(S.houses+1),fmt(Math.floor(S.houses/PER_STREET)+1),S.houses%PER_STREET+1));
  var pi=phaseInfo();setText(els.phaseTag,pi[0]);setText(els.phasePillText,pi[1]);
  setText(els.tF,fmt(f)+' / '+fmt(N_F));if(els.bF)els.bF.style.width=(f/N_F*100)+'%';
  setText(els.tB,fmt(br)+' / '+fmt(N_B));if(els.bB)els.bB.style.width=(br/N_B*100)+'%';
  setText(els.tS,fmt(sh)+' / '+fmt(N_S));if(els.bS)els.bS.style.width=(sh/N_S*100)+'%';
  setText(els.tT,(b/N_ALL*100).toFixed(b<6000?2:1)+'%');if(els.bT)els.bT.style.width=(b/N_ALL*100)+'%';
  setText(els.queueL,pend>0?T('queued',fmt(pend),fmtTime(pend/SPEED)):T('queue_empty'));
  setText(els.zoomTag,(cam.z/fitZ).toFixed(1)+'x');
}
var bannerT=0;
function banner(t,p){var b=els.banner;if(!b)return;els.bnT.textContent=t;els.bnP.textContent=p;b.className='hv-banner';void b.offsetWidth;b.className='hv-banner hv-show';}
function toast(text){var box=els.toasts;if(!box)return;var d=document.createElement('div');d.className='hv-toast';d.textContent=String(text);box.insertBefore(d,box.firstChild);while(box.children.length>3)box.removeChild(box.lastChild);setTimeout(function(){if(d.parentNode)d.parentNode.removeChild(d);},2700);}

/* ===================== street ===================== */
var sc=null,scVis=null,stOff=null,sctx=null,viewStreet=0,lotPop=0,lastStreet=0,stD=1,streetGrain=null;
var LOT=46,SW=20*LOT+24,SH=210;
function setupStreet(){var d=Math.min(2,global.devicePixelRatio||1);sc.width=SW*d;sc.height=SH*d;stOff.width=SW*d;stOff.height=SH*d;sc.style.width=SW+'px';sc.style.height=SH+'px';sctx.setTransform(d,0,0,d,0,0);stD=d;}
function streetFrame(){scVis.setTransform(1,0,0,1,0,0);scVis.drawImage(stOff,0,0);scVis.setTransform(stD,0,0,stD,0,0);for(var i=0;i<stCars.length;i++)drawCar(scVis,stCars[i]);}
function miniHouse(c,x,base,hIdx,prog,lit,scale){
  var pi=palIdx(hIdx),p=PALS[pi];c.save();c.translate(x,base);c.scale(scale,scale);
  var f=Math.min(1,prog/N_F),w=Math.max(0,Math.min(1,(prog-N_F)/N_B)),r=Math.max(0,Math.min(1,(prog-N_F-N_B)/N_S));
  if(prog>0){c.fillStyle='rgba(0,0,0,.4)';c.beginPath();c.ellipse(4,0,23,3,0,0,7);c.fill();}
  c.fillStyle='#9a9a94';c.fillRect(-19,-3,38*f,3);c.fillStyle='rgba(255,255,255,.2)';c.fillRect(-19,-3,38*f,.6);
  if(w>0){var hh=22*w,g=c.createLinearGradient(-17,0,17,0);g.addColorStop(0,shade(p.brick[3],1.15));g.addColorStop(1,shade(p.brick[3],.75));
    c.fillStyle=g;c.fillRect(-17,-3-hh,34,hh);c.fillStyle='rgba(0,0,0,.16)';for(var yy=-4.5;yy>-3-hh;yy-=1.6)c.fillRect(-17,yy,34,.35);
    var win=lit?'#ffd36b':'#8db3cf',sh=SHUT[pi%SHUT.length];
    var wnd=function(wx,wy){c.fillStyle=sh;c.fillRect(wx-1.6,wy,1.4,5);c.fillRect(wx+5.2,wy,1.4,5);c.fillStyle=p.trim;c.fillRect(wx,wy,5,5);c.fillStyle=win;c.fillRect(wx+.7,wy+.7,3.6,3.6);c.fillStyle=p.trim;c.fillRect(wx+2.2,wy+.7,.6,3.6);};
    if(w>.25){wnd(-14,-12);wnd(9,-12);c.fillStyle=p.trim;c.fillRect(-3,-12,6,9);c.fillStyle=p.door;c.fillRect(-2.2,-11,4.4,8);c.fillStyle='#FFDD55';c.fillRect(1,-7,.8,.8);}
    if(w>.85){wnd(-14,-22.5);wnd(-2.5,-22.5);wnd(9,-22.5);}}
  if(r>0){c.save();c.beginPath();c.moveTo(-21,-25);c.lineTo(21,-25);c.lineTo(8,-37);c.lineTo(-8,-37);c.closePath();c.clip();
    var rg=c.createLinearGradient(-21,0,21,0);rg.addColorStop(0,shade(p.roof[2],1.25));rg.addColorStop(1,shade(p.roof[2],.7));
    c.fillStyle=rg;c.fillRect(-21,-25-12*r,42,12*r);c.fillStyle='rgba(0,0,0,.28)';for(var y2=-26.5;y2>-25-12*r;y2-=1.5)c.fillRect(-21,y2,42,.4);c.restore();
    c.fillStyle='rgba(0,0,0,.35)';c.fillRect(-17,-25,34,2);c.fillStyle=p.trim;c.fillRect(-21,-25.6,42,1.2);
    if(r>=1){c.fillStyle=shade(p.brick[2],.9);c.fillRect(8,-38.5,4,7);c.fillStyle='#bfb7a6';c.fillRect(7.4,-39.4,5.2,1.2);c.fillStyle=shade(p.roof[2],.55);c.fillRect(-8.5,-37.6,17,1.2);}}
  c.restore();
}
function drawStreet(){
  var c=sctx,now=performance.now(),k;c.clearRect(0,0,SW,SH);
  var skies=[[0,72],[134,192]];
  for(k=0;k<2;k++){var y0=skies[k][0],y1=skies[k][1],sg=c.createLinearGradient(0,y0,0,y1);sg.addColorStop(0,'#3a6aa0');sg.addColorStop(.55,'#c7a99a');sg.addColorStop(1,'#f3c27e');c.fillStyle=sg;c.fillRect(0,y0,SW,y1-y0);}
  c.fillStyle='#5a8a38';c.fillRect(0,70,SW,22);c.fillRect(0,190,SW,20);c.fillStyle='rgba(255,230,160,.35)';c.fillRect(0,70,SW,1.5);c.fillRect(0,190,SW,1.5);
  c.fillStyle='#bdb8ae';c.fillRect(0,86,SW,6);c.fillRect(0,132,SW,6);c.fillStyle='rgba(0,0,0,.2)';for(var x=0;x<SW;x+=16){c.fillRect(x,86,1,6);c.fillRect(x+8,132,1,6);}
  c.fillStyle='#45464b';c.fillRect(0,92,SW,40);if(!streetGrain){streetGrain=[];var r=mulberry(5);for(var i=0;i<900;i++)streetGrain.push([r()*SW,92+r()*40,r()<.5]);}
  for(k=0;k<streetGrain.length;k++){var g=streetGrain[k];c.fillStyle=g[2]?'rgba(255,255,255,.09)':'rgba(0,0,0,.22)';c.fillRect(g[0],g[1],1.2,1);}
  c.fillStyle='rgba(245,245,240,.85)';c.fillRect(0,94.5,SW,1);c.fillRect(0,129,SW,1);
  c.fillStyle='#f2c230';for(x=4;x<SW;x+=22)c.fillRect(x,111.5,12,1.6);
  c.fillStyle='rgba(255,255,255,.55)';c.textAlign='left';
  c.font='800 8px Urbanist,system-ui,sans-serif';c.fillText(T('street_sign',viewStreet+1),10,142);
  var curStreet=Math.floor(S.houses/PER_STREET),curLot=S.houses%PER_STREET;
  for(k=0;k<PER_STREET;k++){
    var row=k<20?0:1,col=k%20,xx=12+col*LOT+LOT/2,base=row?190:70;
    var hIdx=viewStreet*PER_STREET+k;
    var built=viewStreet<curStreet||(viewStreet===curStreet&&k<curLot);
    var current=viewStreet===curStreet&&k===curLot;
    if(built){var sc2=1;if(hIdx===S.houses-1&&now-lotPop<700){var t=(now-lotPop)/700;sc2=1+.5*Math.sin(t*Math.PI)*(1-t);}
      miniHouse(c,xx,base,hIdx,N_ALL,true,sc2);
      if(k%3===1){c.fillStyle='#3f7d3c';c.beginPath();c.arc(xx+LOT/2,base-5,4.5,0,7);c.fill();c.fillStyle='#5a9a4a';c.beginPath();c.arc(xx+LOT/2-1.5,base-7,2.2,0,7);c.fill();}}
    else if(current){
      var glow=.5+.5*Math.sin(now/300);c.strokeStyle='rgba(255,221,85,'+(.6+.4*glow)+')';c.lineWidth=1.6;c.strokeRect(xx-LOT/2+2,base-46,LOT-4,48);
      c.fillStyle='rgba(255,221,85,.08)';c.fillRect(xx-LOT/2+2,base-46,LOT-4,48);
      miniHouse(c,xx,base,hIdx,S.built,S.completing,1);
    }else{c.strokeStyle='rgba(255,255,255,.55)';c.lineWidth=1;c.setLineDash([3,3]);c.strokeRect(xx-LOT/2+4,base-40,LOT-8,40);c.setLineDash([]);
      c.fillStyle='rgba(255,255,255,.75)';c.font='700 9px Urbanist,system-ui,sans-serif';c.textAlign='center';c.fillText(String(k+1),xx,base-17);}
  }
  setText(els.streetTitle,T('street_of',fmt(viewStreet+1),fmt(curStreet+1)));
  if(els.stPrev)els.stPrev.disabled=viewStreet<=0;if(els.stNext)els.stNext.disabled=viewStreet>=curStreet;
  var inView=viewStreet<curStreet?PER_STREET:curLot;
  setText(els.streetCount,T('street_count',inView,fmt(curStreet)));
}
function scrollStreetToCurrent(){var w=els.streetWrap;if(!w)return;var col=(S.houses%PER_STREET)%20;try{w.scrollTo({left:Math.max(0,12+col*LOT-w.clientWidth/2),behavior:'smooth'});}catch(e){w.scrollLeft=Math.max(0,12+col*LOT-w.clientWidth/2);}}

/* ===================== confetti ===================== */
var cc=null,cctx=null,conf=[];
function confetti(){if(!cc)return;cc.width=global.innerWidth;cc.height=global.innerHeight;var cols=['#FFDD55','#D4AF37','#ffffff','#ff6b6b','#5ec8ff','#7CFC9A'];
  var r=cv?cv.getBoundingClientRect():{left:0,top:0,width:global.innerWidth,height:global.innerHeight};
  var ox=r.left+r.width/2,oy=Math.max(40,Math.min(global.innerHeight-40,r.top+r.height*.35));
  for(var i=0;i<180;i++)conf.push({x:ox+(Math.random()-.5)*80,y:oy,vx:(Math.random()-.5)*14,vy:-Math.random()*13-4,r:Math.random()*6,c:cols[i%6],s:4+Math.random()*5,life:1});}
function drawConfetti(){if(!conf.length||!cctx)return;cctx.clearRect(0,0,cc.width,cc.height);
  for(var i=conf.length-1;i>=0;i--){var p=conf[i];p.x+=p.vx;p.y+=p.vy;p.vy+=.32;p.vx*=.99;p.r+=.2;p.life-=.006;if(p.life<=0||p.y>cc.height+20){conf.splice(i,1);continue;}
    cctx.save();cctx.translate(p.x,p.y);cctx.rotate(p.r);cctx.globalAlpha=Math.min(1,p.life*2);cctx.fillStyle=p.c;cctx.fillRect(-p.s/2,-p.s/4,p.s,p.s/2);cctx.restore();}
  if(!conf.length)cctx.clearRect(0,0,cc.width,cc.height);}

/* ===================== camera / input ===================== */
function resize(){if(!cv)return;dpr=Math.min(2,global.devicePixelRatio||1);cw=cv.clientWidth;ch=cv.clientHeight;cv.width=Math.max(1,cw*dpr);cv.height=Math.max(1,ch*dpr);fitZ=Math.min(cw/2900,ch/2100)||.1;}
function fitView(anim){goCam(800,-330,fitZ,anim?600:0);}
function goCam(x,y,z,dur){if(!dur){cam.x=x;cam.y=y;cam.z=z;camA=null;return;}camA={fx:cam.x,fy:cam.y,fz:cam.z,tx:x,ty:y,tz:z,t0:performance.now(),d:dur};}
function clampZ(z){return Math.max(fitZ*.7,Math.min(14,z));}
function zoomAt(sx,sy,nz){nz=clampZ(nz);var wx=(sx-cw/2)/cam.z+cam.x,wy=(sy-ch/2)/cam.z+cam.y;cam.z=nz;cam.x=wx-(sx-cw/2)/nz;cam.y=wy-(sy-ch/2)/nz;camA=null;}
function setFollow(v){follow=v;if(els.follow)els.follow.checked=v;}
function zoomNewest(){var i=S.built>0?newestIdx():0;goCam(PX[i]+PW[i]/2,PY[i]+PH[i]/2,clampZ(3.6),700);}
function on(el,ev,fn,o){if(!el)return;el.addEventListener(ev,fn,o||false);cleanups.push(function(){el.removeEventListener(ev,fn,o||false);});}

/* ===================== speed / mute ===================== */
function setSpeedV(v,save){v=Math.max(0,Math.min(100,Math.round(+v||0)));SPEED_V=v;SPEED=spdOf(v);
  if(els.spd){els.spd.value=v;els.spd.style.setProperty('--p',v+'%');}
  setText(els.spdL,SPEED===1?T('pps1'):T('pps',fmt(SPEED)));lastShown=-1;
  if(save){try{localStorage.setItem('bbHouseSpeed',String(v));}catch(e){}}}
var SPK_ON='<svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#FFDD55"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="#FFDD55" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
var SPK_OFF='<svg width="18" height="18" viewBox="0 0 24 24"><path d="M4 9h4l5-4v14l-5-4H4z" fill="#888"/><path d="M16 9l5 6M21 9l-5 6" stroke="#888" stroke-width="2" stroke-linecap="round"/></svg>';
function setMuted(m,save){muted=!!m;if(els.mute)els.mute.innerHTML=muted?SPK_OFF:SPK_ON;if(!muted)ensureAudio();if(save){try{localStorage.setItem('bbHouseMuted',muted?'1':'0');}catch(e){}}}

/* ===================== CSS + markup ===================== */
var CSS='.hv{--hv-gold:#D4AF37;--hv-gold2:#FFDD55;--hv-line:rgba(212,175,55,.38);--hv-muted:#a59b80;color:#fff;font-family:inherit;font-weight:600;-webkit-tap-highlight-color:transparent}'+
'.hv *{box-sizing:border-box}'+
'.hv-card{background:#0c0c0c;border:1px solid var(--hv-line);border-radius:18px;padding:12px;margin-bottom:12px}'+
'.hv-hero{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;margin-bottom:8px}'+
'.hv-lbl{font-size:12px;color:var(--hv-muted);font-weight:700;letter-spacing:.4px;text-transform:uppercase}'+
'.hv-big{font-size:30px;font-weight:900;color:var(--hv-gold2);line-height:1.05;font-variant-numeric:tabular-nums;transition:transform .12s;display:inline-block}'+
'.hv-big span{font-size:15px;color:var(--hv-muted);font-weight:700}.hv-big.hv-bump{transform:scale(1.06)}'+
'.hv-pill{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--hv-line);border-radius:999px;padding:5px 10px;font-size:12px;font-weight:800;color:var(--hv-gold2);background:#000;white-space:nowrap}'+
'.hv-pill i{width:8px;height:8px;border-radius:50%;background:var(--hv-gold2);box-shadow:0 0 8px var(--hv-gold2);animation:hvpulse 1.2s infinite}@keyframes hvpulse{50%{opacity:.35}}'+
'.hv-stage{position:relative;border-radius:16px;overflow:hidden;border:1.5px solid var(--hv-gold);background:#05060c}'+
'.hv-house{display:block;width:100%;touch-action:none;cursor:grab}.hv-house:active{cursor:grabbing}'+
'.hv-ctrls{position:absolute;right:8px;bottom:8px;display:flex;flex-direction:column;gap:6px}'+
'.hv-ctrls button,.hv-newest{border:1.5px solid var(--hv-gold);background:rgba(0,0,0,.78);color:var(--hv-gold2);font:inherit;font-weight:900;border-radius:12px;cursor:pointer}'+
'.hv-ctrls button{width:38px;height:34px;font-size:18px;line-height:1;display:grid;place-items:center;padding:0}.hv-ctrls button.hv-fit{font-size:10px}'+
'.hv-newest{position:absolute;left:8px;bottom:8px;padding:8px 11px;font-size:12px;display:flex;align-items:center;gap:6px}'+
'.hv-follow{position:absolute;left:8px;bottom:48px;font-size:11px;font-weight:800;color:var(--hv-gold2);background:rgba(0,0,0,.7);border:1px solid var(--hv-line);border-radius:10px;padding:5px 8px;display:flex;gap:6px;align-items:center;cursor:pointer;user-select:none}'+
'.hv-follow input{accent-color:#D4AF37;margin:0}'+
'.hv-phase{position:absolute;left:8px;top:8px;font-size:11px;font-weight:800;color:#000;background:var(--hv-gold2);border-radius:8px;padding:4px 8px;max-width:calc(100% - 70px)}'+
'.hv-zoomtag{position:absolute;right:8px;top:8px;font-size:11px;font-weight:800;color:var(--hv-gold2);background:rgba(0,0,0,.7);border:1px solid var(--hv-line);border-radius:8px;padding:4px 7px}'+
'.hv-toasts{position:absolute;left:8px;top:34px;display:flex;flex-direction:column;gap:5px;pointer-events:none;max-width:70%}'+
'.hv-toast{background:rgba(0,0,0,.82);border:1px solid var(--hv-gold);border-radius:12px;padding:6px 10px;font-size:12px;font-weight:800;color:#fff;animation:hvtin .25s ease-out,hvtout .4s ease-in 2.2s forwards}'+
'@keyframes hvtin{from{transform:translateX(-20px);opacity:0}}@keyframes hvtout{to{opacity:0;transform:translateY(-6px)}}'+
'.hv-banner{position:absolute;left:50%;top:30%;transform:translate(-50%,-50%) scale(.6);opacity:0;pointer-events:none;text-align:center;background:radial-gradient(ellipse at center,rgba(0,0,0,.92),rgba(0,0,0,.75));border:2px solid var(--hv-gold2);border-radius:18px;padding:14px 18px;min-width:240px;max-width:92%;box-shadow:0 0 40px rgba(255,221,85,.35)}'+
'.hv-banner.hv-show{animation:hvpop 2.6s cubic-bezier(.2,1.4,.4,1) forwards}'+
'.hv-banner h3{margin:0;font-size:24px;font-weight:900;color:var(--hv-gold2);letter-spacing:.5px}.hv-banner p{margin:4px 0 0;font-size:13px;color:#fff;font-weight:700}'+
'@keyframes hvpop{0%{opacity:0;transform:translate(-50%,-50%) scale(.5)}12%{opacity:1;transform:translate(-50%,-50%) scale(1)}82%{opacity:1;transform:translate(-50%,-50%) scale(1)}100%{opacity:0;transform:translate(-50%,-50%) scale(.9)}}'+
'.hv-bars .hv-row{margin:8px 0 10px}.hv-bars .hv-top{display:flex;justify-content:space-between;font-size:13px;font-weight:800;margin-bottom:5px}'+
'.hv-bars .hv-top span:last-child{color:var(--hv-gold2);font-variant-numeric:tabular-nums}'+
'.hv-bar{height:10px;border-radius:99px;background:#1d1d1d;overflow:hidden;border:1px solid #2a2a2a}.hv-bar i{display:block;height:100%;width:0;border-radius:99px;background:linear-gradient(90deg,#9c7d1e,#D4AF37,#FFDD55)}.hv-bar.hv-total{height:14px}'+
'.hv-speed{margin-top:10px;border:1px solid var(--hv-line);border-radius:14px;padding:10px 12px;background:#000}'+
'.hv-speed .hv-top{display:flex;justify-content:space-between;align-items:center;font-size:14px;font-weight:900}.hv-speed .hv-top b{color:var(--hv-gold2);font-variant-numeric:tabular-nums;font-size:15px}'+
'.hv-sl{display:flex;align-items:center;gap:7px;margin-top:9px;font-size:12px;font-weight:800;color:var(--hv-muted)}'+
'.hv-sl button{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--hv-gold);background:#000;color:var(--hv-gold2);font:inherit;font-size:11px;cursor:pointer;flex:none;display:grid;place-items:center;padding:0}'+
'.hv-sl input{flex:1;min-width:0;-webkit-appearance:none;appearance:none;height:8px;border-radius:99px;background:linear-gradient(90deg,#9c7d1e,#FFDD55 var(--p,60%),#2a2a2a var(--p,60%));outline:none;margin:0}'+
'.hv-sl input::-webkit-slider-thumb{-webkit-appearance:none;width:26px;height:26px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#fff6c8,#FFDD55 45%,#b8901e);border:2px solid #000;box-shadow:0 0 0 1.5px #D4AF37,0 0 12px rgba(255,221,85,.6);cursor:pointer}'+
'.hv-sl input::-moz-range-thumb{width:22px;height:22px;border-radius:50%;background:#FFDD55;border:2px solid #000}'+
'.hv-speed .hv-s{font-size:12px;color:var(--hv-muted);font-weight:700;margin-top:7px}'+
'.hv h2{font-size:16px;font-weight:900;color:var(--hv-gold2);margin:0 0 10px;display:flex;justify-content:space-between;align-items:center}'+
'.hv-streetwrap{overflow-x:auto;border-radius:14px;border:1px solid #222;background:#07080d;scrollbar-width:thin}.hv-street{display:block}'+
'.hv-streetnav{display:flex;align-items:center;gap:8px}.hv-streetnav button{width:30px;height:30px;border-radius:50%;border:1.5px solid var(--hv-gold);background:#000;color:var(--hv-gold2);font:inherit;font-weight:900;cursor:pointer;padding:0}'+
'.hv-streetnav button:disabled{opacity:.3}'+
'.hv-legend{display:flex;gap:12px;font-size:11px;color:var(--hv-muted);margin-top:8px;flex-wrap:wrap}.hv-legend span{display:flex;align-items:center;gap:5px}.hv-legend i{width:12px;height:10px;border-radius:2px;display:inline-block}'+
'.hv-confetti{position:fixed;inset:0;left:0;top:0;width:100%;height:100%;pointer-events:none;z-index:9999}';
function esc(s){return String(s).replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c];});}
function markup(o){
  var h='<div class="hv-card">';
  if(o.hero!==false)h+='<div class="hv-hero"><div><div class="hv-lbl" data-hv="houseLbl"></div><div class="hv-big" data-hv="bigCount"><b data-hv="bigNum">0</b> <span data-hv="bigOf"></span></div></div><div class="hv-pill"><i></i><span data-hv="phasePillText"></span></div></div>';
  h+='<div class="hv-stage"><canvas class="hv-house" data-hv="house" style="height:'+(+o.height||380)+'px"></canvas>'+
    '<div class="hv-phase" data-hv="phaseTag"></div><div class="hv-zoomtag" data-hv="zoomTag">1.0x</div><div class="hv-toasts" data-hv="toasts"></div>'+
    '<div class="hv-banner" data-hv="banner"><h3 data-hv="bnT"></h3><p data-hv="bnP"></p></div>'+
    '<label class="hv-follow"><input type="checkbox" data-hv="follow"> '+esc(T('follow'))+'</label>'+
    '<button type="button" class="hv-newest" data-hv="newestBtn"><svg width="14" height="14" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="#FFDD55" stroke-width="2.6"/><path d="M16 16 L21 21" stroke="#FFDD55" stroke-width="2.6" stroke-linecap="round"/></svg>'+esc(T('newest'))+'</button>'+
    '<div class="hv-ctrls"><button type="button" data-hv="mute" aria-label="'+esc(T('sound'))+'" title="'+esc(T('sound'))+'"></button><button type="button" data-hv="zin" aria-label="'+esc(T('zoom_in'))+'">+</button><button type="button" data-hv="zout" aria-label="'+esc(T('zoom_out'))+'">&minus;</button><button type="button" class="hv-fit" data-hv="zfit">'+esc(T('fit'))+'</button></div></div>';
  if(o.bars!==false)h+='<div class="hv-bars" style="margin-top:10px">'+
    '<div class="hv-row"><div class="hv-top"><span>'+esc(T('bar_f'))+'</span><span data-hv="tF"></span></div><div class="hv-bar"><i data-hv="bF"></i></div></div>'+
    '<div class="hv-row"><div class="hv-top"><span>'+esc(T('bar_b'))+'</span><span data-hv="tB"></span></div><div class="hv-bar"><i data-hv="bB"></i></div></div>'+
    '<div class="hv-row"><div class="hv-top"><span>'+esc(T('bar_s'))+'</span><span data-hv="tS"></span></div><div class="hv-bar"><i data-hv="bS"></i></div></div>'+
    '<div class="hv-row" style="margin-bottom:0"><div class="hv-top"><span>'+esc(T('bar_t'))+'</span><span data-hv="tT"></span></div><div class="hv-bar hv-total"><i data-hv="bT"></i></div></div></div>';
  if(o.speed!==false)h+='<div class="hv-speed"><div class="hv-top"><span>'+esc(T('speed'))+'</span><b data-hv="spdL"></b></div>'+
    '<div class="hv-sl"><span>'+esc(T('slower'))+'</span><button type="button" data-hv="spdDn" aria-label="'+esc(T('slower'))+'">&#9664;</button><input type="range" data-hv="spd" min="0" max="100" step="1" value="60" aria-label="'+esc(T('speed'))+'"><button type="button" data-hv="spdUp" aria-label="'+esc(T('faster'))+'">&#9654;</button><span>'+esc(T('faster'))+'</span></div>'+
    '<div class="hv-s" data-hv="queueL"></div></div>';
  h+='</div>';
  if(o.street!==false)h+='<div class="hv-card"><h2><span data-hv="streetTitle"></span><span class="hv-streetnav"><button type="button" data-hv="stPrev">&lsaquo;</button><button type="button" data-hv="stNext">&rsaquo;</button></span></h2>'+
    '<div class="hv-streetwrap" data-hv="streetWrap"><canvas class="hv-street" data-hv="street"></canvas></div>'+
    '<div class="hv-legend"><span><i style="background:#b04a33"></i>'+esc(T('lg_built'))+'</span><span><i style="background:transparent;border:1.5px solid #FFDD55"></i>'+esc(T('lg_now'))+'</span><span><i style="background:transparent;border:1px dashed #555"></i>'+esc(T('lg_empty'))+'</span><span data-hv="streetCount"></span></div></div>';
  return h;
}

/* ===================== loop ===================== */
var lastFrame=0;
function frame(now){
  raf=0;if(!alive)return;
  if(document.hidden){lastFrame=0;lastStep=0;return;}
  var fdt=lastFrame?Math.min(.1,(now-lastFrame)/1000):.016;lastFrame=now;
  if(cw===0)resize();
  updateWorld(fdt);
  if(S.started)step(now);
  while(S.settled<S.built&&now-animStart[S.settled]>=DUR)S.settled++;
  if(S.slideAt&&now>=S.slideAt){S.slideAt=0;S.slideStart=now;}
  if(S.slideStart)S.slideT=Math.min(1,(now-S.slideStart)/1100);
  if(camA){var t=Math.min(1,(now-camA.t0)/camA.d),e=1-Math.pow(1-t,3);cam.x=camA.fx+(camA.tx-camA.fx)*e;cam.y=camA.fy+(camA.ty-camA.fy)*e;cam.z=camA.fz*Math.pow(camA.tz/camA.fz,e);if(t>=1)camA=null;}
  else if(follow&&S.built>0&&!S.completing){var i=newestIdx();cam.x+=(PX[i]+PW[i]/2-cam.x)*.1;cam.y+=(PY[i]-cam.y)*.1;}
  if(stageVisible&&cw>0)drawScene(now);
  drawConfetti();updateDOM();
  if(sc){if(now-lotPop<800||now-lastStreet>200){drawStreet();lastStreet=now;}if(stVisible)streetFrame();}
  if(S.slideT>=1)finishSlide();
  // events
  var busy=pendingN()>0||S.completing||S.settled<S.built;
  if(S.started){
    if(shownParts()!==lastEmitted&&now-lastEmitAt>500)emitProgress(now);
    if(wasBusy&&!busy){emitProgress(now);emit('caughtUp',{partsShown:shownParts()});}
  }
  wasBusy=busy;
  raf=requestAnimationFrame(frame);
}
function kick(){if(alive&&!raf&&!document.hidden)raf=requestAnimationFrame(frame);}

/* ===================== public API ===================== */
function init(o){
  if(alive)destroy();
  opts=o||{};
  var container=opts.container;if(typeof container==='string')container=document.querySelector(container);
  if(!container)throw new Error('HouseView.init: container is required');
  var L=opts.lang;
  if(L&&typeof L==='object'){var base=STRINGS[String(L.code||'en').toLowerCase()]||STRINGS.en,t={},k;for(k in base)t[k]=base[k];for(k in (L.strings||{}))t[k]=L.strings[k];STR=t;L=L.code||'en';}
  else{L=String(L||'en').toLowerCase().split(/[-_]/)[0];if(L==='in')L='id';STR=STRINGS[L]||STRINGS.en;}
  if(!document.getElementById('hv-css')){var st=document.createElement('style');st.id='hv-css';st.textContent=CSS;document.head.appendChild(st);}
  root=document.createElement('div');root.className='hv';if(L==='ar')root.setAttribute('dir','rtl');
  root.innerHTML=markup(opts);container.appendChild(root);
  els={};var nodes=root.querySelectorAll('[data-hv]');for(var n=0;n<nodes.length;n++)els[nodes[n].getAttribute('data-hv')]=nodes[n];
  cv=els.house;ctx=cv.getContext('2d');
  sc=els.street||null;if(sc){scVis=sc.getContext('2d');stOff=document.createElement('canvas');sctx=stOff.getContext('2d');setupStreet();}
  cc=document.createElement('canvas');cc.className='hv-confetti';document.body.appendChild(cc);cctx=cc.getContext('2d');conf=[];
  makeBitmaps();buildScenery();resetWorld();
  S=freshState();themeOff=0;P=prepPal(0);resetBitmap();viewStreet=0;lastShown=-1;lastEmitted=-1;lastEmitAt=0;wasBusy=false;follow=false;camA=null;skyC=null;lastFrame=0;lastStep=0;idle=true;budget=0;
  // speed: the member's saved choice, else the option, else 380
  var sv=null;try{var s0=localStorage.getItem('bbHouseSpeed');if(s0!==null&&!isNaN(+s0))sv=+s0;}catch(e){}
  if(sv===null)sv=opts.speedPartsPerSec?vOf(opts.speedPartsPerSec):60;
  setSpeedV(sv,false);
  var mv=null;try{var m0=localStorage.getItem('bbHouseMuted');if(m0==='1'||m0==='0')mv=m0==='1';}catch(e){}
  setMuted(mv!==null?mv:opts.sound===false,false);
  resize();fitView(false);
  // controls
  var ptrs={},nP=0,pinch=null;
  on(root,'pointerdown',function(){ensureAudio();});
  on(cv,'pointerdown',function(e){try{cv.setPointerCapture(e.pointerId);}catch(x){}ptrs[e.pointerId]={x:e.offsetX,y:e.offsetY};nP=Object.keys(ptrs).length;camA=null;if(nP===2)pinch=null;});
  on(cv,'pointermove',function(e){var p=ptrs[e.pointerId];if(!p)return;var nx=e.offsetX,ny=e.offsetY;
    if(nP===1){cam.x-=(nx-p.x)/cam.z;cam.y-=(ny-p.y)/cam.z;if(Math.abs(nx-p.x)+Math.abs(ny-p.y)>2)setFollow(false);}
    p.x=nx;p.y=ny;
    if(nP===2){var ks=Object.keys(ptrs),a=ptrs[ks[0]],b=ptrs[ks[1]];var d=Math.hypot(a.x-b.x,a.y-b.y),mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
      if(pinch){zoomAt(mx,my,cam.z*d/pinch.d);cam.x-=(mx-pinch.mx)/cam.z;cam.y-=(my-pinch.my)/cam.z;}pinch={d:d,mx:mx,my:my};}});
  var up=function(e){delete ptrs[e.pointerId];nP=Object.keys(ptrs).length;pinch=null;};on(cv,'pointerup',up);on(cv,'pointercancel',up);
  // wheel zooms only with ctrl/cmd (and trackpad pinch, which sends ctrlKey) so the page still scrolls
  on(cv,'wheel',function(e){if(!e.ctrlKey&&!e.metaKey)return;e.preventDefault();zoomAt(e.offsetX,e.offsetY,cam.z*Math.exp(-e.deltaY*.0018));},{passive:false});
  on(els.follow,'change',function(e){follow=e.target.checked;if(follow&&cam.z<fitZ*4)zoomNewest();});
  on(els.newestBtn,'click',function(){zoomNewest();});
  on(els.zin,'click',function(){zoomAt(cw/2,ch/2,cam.z*1.6);});
  on(els.zout,'click',function(){zoomAt(cw/2,ch/2,cam.z/1.6);});
  on(els.zfit,'click',function(){setFollow(false);fitView(true);});
  on(els.mute,'click',function(){setMuted(!muted,true);});
  on(els.spd,'input',function(){setSpeedV(els.spd.value,true);});
  on(els.spdDn,'click',function(){setSpeedV(SPEED_V-10,true);});
  on(els.spdUp,'click',function(){setSpeedV(SPEED_V+10,true);});
  on(els.stPrev,'click',function(){viewStreet=Math.max(0,viewStreet-1);drawStreet();});
  on(els.stNext,'click',function(){viewStreet=Math.min(Math.floor(S.houses/PER_STREET),viewStreet+1);drawStreet();});
  on(global,'resize',function(){var r=cam.z/fitZ;resize();cam.z=fitZ*r;skyC=null;});
  on(document,'visibilitychange',function(){if(!document.hidden){lastFrame=0;lastStep=0;kick();}});
  on(global,'message',function(e){var d=e&&e.data;if(!d||typeof d!=='object'||!d.houseView)return;var fn=API[d.houseView];if(typeof fn==='function'&&d.houseView!=='init'&&d.houseView!=='destroy')fn(d.args);});
  try{
    var io=new IntersectionObserver(function(es){for(var i=0;i<es.length;i++){if(es[i].target===cv)stageVisible=es[i].isIntersecting;else stVisible=es[i].isIntersecting;}});
    io.observe(cv);if(els.streetWrap)io.observe(els.streetWrap);observers.push(io);
  }catch(e){}
  try{var ro=new ResizeObserver(function(){if(!cv)return;if(cv.clientWidth!==cw||cv.clientHeight!==ch){var r=cam.z/(fitZ||1);resize();cam.z=fitZ*r;skyC=null;}});ro.observe(cv);observers.push(ro);}catch(e){}
  alive=true;updateDOM();if(sc)drawStreet();kick();
  emit('ready',{});
  return API;
}
function setProgress(p){
  if(!alive||!p)return;
  var L=Math.max(0,Math.floor(+p.lifetimeParts||0));
  if(p.theme!=null&&isFinite(+p.theme)&&(+p.theme|0)!==themeOff){themeOff=+p.theme|0;P=prepPal(S.houses);resetBitmap();}
  if(!S.started||p.reset){
    var start;
    if(p.lastSeenParts==null||!isFinite(+p.lastSeenParts))start=Math.floor(L/N_ALL)*N_ALL;
    else start=Math.max(0,Math.min(L,Math.floor(+p.lastSeenParts)));
    placeAt(start,false);S.started=true;S.target=L;
    if(els.streetWrap)setTimeout(scrollStreetToCurrent,50);
    if(follow)zoomNewest();
    emitProgress();
  }else if(L<shownParts()){placeAt(L,false);S.target=L;emitProgress();}
  else S.target=L;
  catchUp();
  wasBusy=true; // the next idle frame reports caughtUp, even when there was nothing to lay
  lastShown=-1;kick();
}
function destroy(){
  alive=false;if(raf){cancelAnimationFrame(raf);raf=0;}
  for(var i=0;i<cleanups.length;i++){try{cleanups[i]();}catch(e){}}cleanups=[];
  for(i=0;i<observers.length;i++){try{observers[i].disconnect();}catch(e){}}observers=[];
  if(root&&root.parentNode)root.parentNode.removeChild(root);if(cc&&cc.parentNode)cc.parentNode.removeChild(cc);
  root=null;els={};cv=null;ctx=null;sc=null;cc=null;cctx=null;cw=0;ch=0;
  if(actx){try{actx.close();}catch(e){}actx=null;}
}
var API={
  version:1,
  init:init,
  setProgress:setProgress,
  setSpeed:function(n){setSpeedV(vOf(n),false);},
  mute:function(b){setMuted(b!==false,true);},
  toast:function(t){toast(t);},
  zoomToNewest:function(){if(alive)zoomNewest();},
  fit:function(){if(alive){setFollow(false);fitView(true);}},
  getState:function(){return S?{partsShown:shownParts(),target:S.target,housesBuilt:S.houses,streetsBuilt:Math.floor(S.houses/PER_STREET),partsInHouse:S.built,speed:SPEED,muted:muted}:null;},
  destroy:destroy,
  RULES:{foundation:N_F,bricks:N_B,shingles:N_S,partsPerHouse:N_ALL,housesPerStreet:PER_STREET,catchUpSeconds:CATCHUP_SECONDS}
};
global.HouseView=API;
})(window);
