'use client';

import {useState} from 'react';

type Props={
  name:string;
  label:string;
  defaultValue:number;
  min:number;
  max:number;
  step?:number;
  suffix?:string;
};

export function NumberStepper({name,label,defaultValue,min,max,step=1,suffix}:Props){
  const clamp=(value:number)=>Math.min(max,Math.max(min,value));
  const [value,setValue]=useState(clamp(defaultValue));

  function update(next:number){
    setValue(clamp(Number.isFinite(next)?next:min));
  }

  return <label className="number-stepper-field">
    <span>{label}</span>
    <div className="number-stepper">
      <button type="button" aria-label={'Decrease '+label} onClick={()=>update(value-step)}>−</button>
      <div className="number-stepper-value">
        <input
          type="number"
          name={name}
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={event=>update(Number(event.target.value))}
          required
        />
        {suffix&&<small>{suffix}</small>}
      </div>
      <button type="button" aria-label={'Increase '+label} onClick={()=>update(value+step)}>+</button>
    </div>
  </label>;
}
