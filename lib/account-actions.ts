let actions:{manage:()=>void;signOut:()=>void}|undefined;
export function setAccountActions(next:typeof actions){actions=next;return()=>{actions=undefined;};}
export function manageAccount(){actions?.manage();}
export function signOutAccount(){actions?.signOut();}
