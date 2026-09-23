'use client';

import {useState} from 'react';

type Structure='SINGLE'|'A_B'|'A_B_C';

export function TeamStructureSelector(){
  const [value,setValue]=useState<Structure>('SINGLE');
  const options:{value:Structure;title:string;copy:string}[]=[
    {value:'SINGLE',title:'Single side',copy:'One roster and one competitive side.'},
    {value:'A_B',title:'A + B sides',copy:'One Team identity with separate A and B rosters and fixtures.'},
    {value:'A_B_C',title:'A + B + C sides',copy:'One Team identity with separate A, B and C rosters and fixtures.'},
  ];

  return <fieldset className="team-structure-selector">
    <legend>Team structure *</legend>
    <input type="hidden" name="structure" value={value}/>
    <div className="team-structure-choice-grid">
      {options.map(option=><button
        key={option.value}
        type="button"
        className={value===option.value?'active':''}
        aria-pressed={value===option.value}
        onClick={()=>setValue(option.value)}
      >
        <span className="choice-check">{value===option.value?'✓':''}</span>
        <strong>{option.title}</strong>
        <small>{option.copy}</small>
      </button>)}
    </div>
  </fieldset>;
}
