export function shouldRunTableDeletionWorker(env:Record<string,string|undefined>):boolean{
 return env.NODE_ENV!=='test'&&env.TABLE_DELETION_WORKER_ENABLED!=='false';
}
