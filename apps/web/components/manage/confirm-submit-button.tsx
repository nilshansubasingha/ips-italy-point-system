'use client';

import type { MouseEvent, ReactNode } from 'react';

export function ConfirmSubmitButton({
  message,
  children,
  className='danger-link',
  title,
}:{
  message:string;
  children:ReactNode;
  className?:string;
  title?:string;
}){
  function confirmSubmit(event:MouseEvent<HTMLButtonElement>){
    if(!window.confirm(message)) event.preventDefault();
  }

  return <button type="submit" className={className} title={title} onClick={confirmSubmit}>{children}</button>;
}
