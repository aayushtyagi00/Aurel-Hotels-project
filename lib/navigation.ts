let handler:((url:string)=>void)|undefined;
export function setNavigator(navigate:(url:string)=>void){handler=navigate;return()=>{handler=undefined;};}
export function navigate(url:string){if(handler)handler(url);else window.location.assign(url);}
