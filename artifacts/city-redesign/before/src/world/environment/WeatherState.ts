export const WEATHER_NAMES=['clear','partly-cloudy','overcast','light-rain','heavy-rain','thunderstorm','fog','light-snow','heavy-snow','windy'] as const;
export type WeatherPreset=typeof WEATHER_NAMES[number];
export interface WeatherValues {cloud:number;darkness:number;rain:number;snow:number;fog:number;wind:number;wet:number;storm:number;}
export const WEATHER:Record<WeatherPreset,WeatherValues>={
 clear:{cloud:.02,darkness:0,rain:0,snow:0,fog:.00020,wind:1,wet:0,storm:0},
 'partly-cloudy':{cloud:.43,darkness:.15,rain:0,snow:0,fog:.00025,wind:3,wet:0,storm:0},
 overcast:{cloud:.94,darkness:.56,rain:0,snow:0,fog:.00044,wind:4,wet:.06,storm:0},
 'light-rain':{cloud:.82,darkness:.4,rain:.28,snow:0,fog:.00052,wind:4,wet:.5,storm:0},
 'heavy-rain':{cloud:1,darkness:.76,rain:.86,snow:0,fog:.00082,wind:9,wet:1,storm:0},
 thunderstorm:{cloud:1,darkness:.92,rain:1,snow:0,fog:.001,wind:14,wet:1,storm:1},
 fog:{cloud:.68,darkness:.18,rain:0,snow:0,fog:.0044,wind:.5,wet:.2,storm:0},
 'light-snow':{cloud:.6,darkness:.22,rain:0,snow:.28,fog:.00065,wind:2.5,wet:.1,storm:0},
 'heavy-snow':{cloud:1,darkness:.52,rain:0,snow:1,fog:.0019,wind:7,wet:.16,storm:0},
 windy:{cloud:.55,darkness:.23,rain:0,snow:0,fog:.00036,wind:18,wet:0,storm:0},
};
export class WeatherState {
 values:WeatherValues={...WEATHER['partly-cloudy']};
 preset:WeatherPreset='partly-cloudy';
 hour=17.3;paused=false;dayLength=1200;intensity=1;wetness=0;snowCover=0;
 private from:WeatherValues={...this.values};private elapsed=0;private duration=0;
 setWeather(preset:WeatherPreset,seconds=12):void{
  if(!WEATHER[preset])throw new Error(`Unknown weather preset ${preset}`);
  this.from={...this.values};this.preset=preset;this.elapsed=0;this.duration=Math.max(0,seconds);
  if(seconds<=0)this.values={...WEATHER[preset]};
 }
 setTime(hour:number):void{this.hour=((hour%24)+24)%24;}
 update(dt:number):void{
  const step=Math.max(0,Math.min(dt,.15));
  if(!this.paused)this.setTime(this.hour+step*24/this.dayLength);
  this.elapsed+=step;const p=this.duration?Math.min(1,this.elapsed/this.duration):1,t=p*p*(3-2*p),to=WEATHER[this.preset];
  for(const key of Object.keys(to) as (keyof WeatherValues)[])this.values[key]=this.from[key]+(to[key]-this.from[key])*t;
  const k=1-Math.exp(-step*.08);this.wetness+=(this.values.wet*this.intensity-this.wetness)*k;
  const target=this.values.snow*this.intensity;this.snowCover+=(target-this.snowCover)*(1-Math.exp(-step*(target>this.snowCover?.018:.004)));
 }
 reset():void{this.setWeather('partly-cloudy',0);this.hour=17.3;this.paused=false;this.intensity=1;this.wetness=this.snowCover=0;}
 get night():number{return 1-Math.max(0,Math.min(1,(Math.sin((this.hour-6)*Math.PI/12)+.08)*3));}
}
